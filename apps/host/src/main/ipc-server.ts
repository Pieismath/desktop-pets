import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import { dataDir, ipcInfoPath, parseLine, socketPath } from '@desktop-pets/shared';
import type { ClientMsg, DecisionMsg, HostMsg, IpcInfo, SessionInfo } from '@desktop-pets/shared';

export interface IpcConnection {
  id: number;
  role: 'hook' | 'mcp' | 'cli';
  session: SessionInfo | undefined;
  reply(msg: HostMsg): void;
}

export interface IpcDelegate {
  onMessage(conn: IpcConnection, msg: ClientMsg): void;
  onDisconnect(conn: IpcConnection): void;
}

const HOST_VERSION = '0.1.0';

function timingSafeEq(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Local-socket IPC server. Per-run random token; the rendezvous file and the
 * socket both live in the user-only data dir with mode 0600. No TCP, ever.
 */
export class IpcServer {
  private readonly token = crypto.randomBytes(32).toString('hex');
  private server: net.Server | undefined;
  private nextConnId = 1;

  constructor(private readonly delegate: IpcDelegate) {}

  /** Throws if another live host owns the socket. */
  async start(): Promise<void> {
    const sock = socketPath();
    fs.mkdirSync(dataDir(), { recursive: true, mode: 0o700 });

    if (fs.existsSync(sock)) {
      const alive = await new Promise<boolean>((resolve) => {
        const probe = net.createConnection(sock);
        const t = setTimeout(() => {
          probe.destroy();
          resolve(false);
        }, 300);
        probe.once('connect', () => {
          clearTimeout(t);
          probe.destroy();
          resolve(true);
        });
        probe.once('error', () => {
          clearTimeout(t);
          resolve(false);
        });
      });
      if (alive) throw new Error(`another desktop-pets host is already listening on ${sock}`);
      fs.rmSync(sock, { force: true });
    }

    this.server = net.createServer((socket) => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(sock, () => resolve());
    });
    fs.chmodSync(sock, 0o600);

    const info: IpcInfo = { socket: sock, token: this.token, pid: process.pid, startedAt: new Date().toISOString() };
    fs.writeFileSync(ipcInfoPath(), JSON.stringify(info, null, 2), { mode: 0o600 });
  }

  private handleConnection(socket: net.Socket): void {
    let authed = false;
    let buffer = '';
    const conn: IpcConnection = {
      id: this.nextConnId++,
      role: 'hook',
      session: undefined,
      reply: (msg) => {
        if (!socket.destroyed) socket.write(JSON.stringify(msg) + '\n');
      },
    };

    const authTimer = setTimeout(() => {
      if (!authed) socket.destroy();
    }, 1500);

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 1_000_000) {
        socket.destroy(); // no client has business sending us a megabyte
        return;
      }
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const msg = parseLine(line) as ClientMsg | null;
        if (!msg || typeof msg.t !== 'string') {
          conn.reply({ t: 'err', code: 'proto', msg: 'unparseable message' });
          socket.destroy();
          return;
        }
        if (!authed) {
          if (msg.t !== 'hello' || typeof msg.token !== 'string' || !timingSafeEq(msg.token, this.token)) {
            conn.reply({ t: 'err', code: 'auth', msg: 'bad token' });
            socket.destroy();
            return;
          }
          authed = true;
          clearTimeout(authTimer);
          conn.role = msg.role;
          conn.session = msg.session;
          conn.reply({ t: 'ack', ok: true, hostVersion: HOST_VERSION });
          continue;
        }
        try {
          this.delegate.onMessage(conn, msg);
        } catch (err) {
          console.error('[ipc] delegate error:', err);
          conn.reply({ t: 'err', code: 'internal', msg: 'internal error' });
        }
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      if (authed) this.delegate.onDisconnect(conn);
    });
    socket.on('error', () => {
      /* close handler does the cleanup */
    });
  }

  sendDecision(conn: IpcConnection, msg: DecisionMsg): void {
    conn.reply(msg);
  }

  stop(): void {
    this.server?.close();
    try {
      fs.rmSync(socketPath(), { force: true });
      fs.rmSync(ipcInfoPath(), { force: true });
    } catch {
      /* best effort */
    }
  }
}
