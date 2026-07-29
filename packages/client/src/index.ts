import fs from 'node:fs';
import net from 'node:net';
import { ipcInfoPath } from '@desktop-pets/shared';
import type {
  ClientMsg,
  Decision,
  EventMsg,
  HookEventName,
  HookPayload,
  HostMsg,
  IpcInfo,
  Reaction,
  SessionInfo,
} from '@desktop-pets/shared';
import { PROTOCOL_VERSION, parseLine } from '@desktop-pets/shared';

export interface ConnectOptions {
  role: 'hook' | 'mcp' | 'cli';
  session?: SessionInfo;
  /** Socket connect + hello-ack budget. Keep tiny: a missing pet must cost ~nothing. */
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export function readIpcInfo(env: NodeJS.ProcessEnv = process.env): IpcInfo | null {
  try {
    const raw = fs.readFileSync(ipcInfoPath(env), 'utf8');
    const info = JSON.parse(raw) as Partial<IpcInfo>;
    if (typeof info.socket === 'string' && typeof info.token === 'string') {
      return info as IpcInfo;
    }
    return null;
  } catch {
    return null;
  }
}

export class PetClient {
  private buffer = '';
  private waiters = new Map<string, (msg: HostMsg & { t: 'decision' }) => void>();

  private constructor(private readonly sock: net.Socket) {
    sock.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      let idx: number;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        const msg = parseLine(line) as HostMsg | null;
        if (msg && msg.t === 'decision') {
          const waiter = this.waiters.get(msg.id);
          if (waiter) {
            this.waiters.delete(msg.id);
            waiter(msg);
          }
        }
      }
    });
    sock.on('error', () => this.failAllWaiters());
    sock.on('close', () => this.failAllWaiters());
  }

  private failAllWaiters(): void {
    for (const [id, waiter] of this.waiters) {
      this.waiters.delete(id);
      waiter({ t: 'decision', id, decision: 'none', reason: 'connection closed' });
    }
  }

  /**
   * Connect + authenticate. Resolves null when the pet isn't running,
   * the socket is stale, auth fails, or anything times out — callers treat
   * null as "behave as if desktop-pets were not installed".
   */
  static async connect(opts: ConnectOptions): Promise<PetClient | null> {
    const info = readIpcInfo(opts.env);
    if (!info) return null;
    const timeoutMs = opts.timeoutMs ?? 250;

    return new Promise((resolve) => {
      const sock = net.createConnection(info.socket);
      const timer = setTimeout(() => {
        sock.destroy();
        resolve(null);
      }, timeoutMs);

      sock.once('error', () => {
        clearTimeout(timer);
        resolve(null);
      });

      sock.once('connect', () => {
        const hello: ClientMsg = {
          t: 'hello',
          v: PROTOCOL_VERSION,
          token: info.token,
          role: opts.role,
          pid: process.pid,
          ...(opts.session ? { session: opts.session } : {}),
        };
        sock.write(JSON.stringify(hello) + '\n');

        let buf = '';
        const onData = (chunk: Buffer) => {
          buf += chunk.toString('utf8');
          const idx = buf.indexOf('\n');
          if (idx < 0) return;
          sock.off('data', onData);
          clearTimeout(timer);
          const msg = parseLine(buf.slice(0, idx)) as HostMsg | null;
          if (msg && msg.t === 'ack' && msg.ok) {
            const client = new PetClient(sock);
            client.buffer = buf.slice(idx + 1);
            resolve(client);
          } else {
            sock.destroy();
            resolve(null);
          }
        };
        sock.on('data', onData);
      });
    });
  }

  private send(msg: ClientMsg): void {
    if (!this.sock.destroyed) this.sock.write(JSON.stringify(msg) + '\n');
  }

  sendEvent(event: HookEventName, payload: HookPayload): void {
    this.send({ t: 'event', event, payload });
  }

  /**
   * Forward an event and wait for the host's decision (or 'none'). The host
   * owns hold policy; `maxWaitMs` is only the client-side safety net.
   */
  requestDecision(
    event: HookEventName,
    payload: HookPayload,
    maxWaitMs: number,
  ): Promise<{ decision: Decision; reason?: string }> {
    const id = `${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const msg: EventMsg = { t: 'event', id, event, wantsDecision: true, payload };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        resolve({ decision: 'none', reason: 'client timeout' });
      }, maxWaitMs);
      this.waiters.set(id, (m) => {
        clearTimeout(timer);
        resolve(m.reason !== undefined ? { decision: m.decision, reason: m.reason } : { decision: m.decision });
      });
      this.send(msg);
    });
  }

  react(reaction: Reaction, text?: string): void {
    this.send({ t: 'react', reaction, ...(text !== undefined ? { text } : {}) });
  }

  status(reaction: Reaction, text?: string): void {
    this.send({ t: 'status', reaction, ...(text !== undefined ? { text } : {}) });
  }

  say(text: string): void {
    this.send({ t: 'say', text });
  }

  /** Flush and close; resolves when the socket has drained. */
  close(): Promise<void> {
    return new Promise((resolve) => {
      this.sock.end(() => resolve());
      setTimeout(resolve, 150);
    });
  }
}
