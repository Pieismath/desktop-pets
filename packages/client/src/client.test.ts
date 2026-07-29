import { mkdtempSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PetClient } from './index.js';

interface FakeHost {
  received: unknown[];
  close: () => void;
  env: NodeJS.ProcessEnv;
}

function startFakeHost(opts: { token?: string; decision?: 'allow' | 'deny' | 'none' } = {}): Promise<FakeHost> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dp-client-'));
  const sock = path.join(dir, 'pet.sock');
  const token = 'tok_test_1234567890';
  writeFileSync(
    path.join(dir, 'ipc.json'),
    JSON.stringify({ socket: sock, token, pid: 1, startedAt: new Date().toISOString() }),
  );
  const received: unknown[] = [];
  const server = net.createServer((socket) => {
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const msg = JSON.parse(buf.slice(0, idx)) as Record<string, unknown>;
        buf = buf.slice(idx + 1);
        received.push(msg);
        if (msg['t'] === 'hello') {
          if (msg['token'] === (opts.token ?? token)) {
            socket.write(JSON.stringify({ t: 'ack', ok: true, hostVersion: 'test' }) + '\n');
          } else {
            socket.write(JSON.stringify({ t: 'err', code: 'auth', msg: 'bad token' }) + '\n');
            socket.destroy();
          }
        }
        if (msg['t'] === 'event' && msg['wantsDecision']) {
          socket.write(
            JSON.stringify({ t: 'decision', id: msg['id'], decision: opts.decision ?? 'none', reason: 'test' }) + '\n',
          );
        }
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(sock, () =>
      resolve({ received, close: () => server.close(), env: { DESKTOP_PETS_DIR: dir } }),
    );
  });
}

let host: FakeHost | undefined;
afterEach(() => host?.close());

describe('PetClient', () => {
  it('connects, authenticates, and delivers events', async () => {
    host = await startFakeHost();
    const client = await PetClient.connect({ role: 'hook', env: host.env, session: { cwd: '/x' } });
    expect(client).not.toBeNull();
    client!.sendEvent('Stop', { session_id: 's1' });
    await client!.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(host.received[0]).toMatchObject({ t: 'hello', role: 'hook', session: { cwd: '/x' } });
    expect(host.received[1]).toMatchObject({ t: 'event', event: 'Stop' });
  });

  it('round-trips a decision request', async () => {
    host = await startFakeHost({ decision: 'deny' });
    const client = await PetClient.connect({ role: 'hook', env: host.env });
    const res = await client!.requestDecision('PermissionRequest', { tool_name: 'Bash' }, 2000);
    expect(res).toEqual({ decision: 'deny', reason: 'test' });
    await client!.close();
  });

  it('resolves null on token mismatch (host rejects)', async () => {
    host = await startFakeHost({ token: 'a-different-token' });
    const client = await PetClient.connect({ role: 'hook', env: host.env });
    expect(client).toBeNull();
  });

  it('resolves null quickly when the host is not running', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'dp-none-'));
    writeFileSync(
      path.join(dir, 'ipc.json'),
      JSON.stringify({ socket: path.join(dir, 'gone.sock'), token: 'x', pid: 1, startedAt: '' }),
    );
    const t0 = Date.now();
    const client = await PetClient.connect({ role: 'hook', env: { DESKTOP_PETS_DIR: dir } });
    expect(client).toBeNull();
    expect(Date.now() - t0).toBeLessThan(600);
  });

  it('resolves null when no ipc.json exists at all', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'dp-empty-'));
    const client = await PetClient.connect({ role: 'hook', env: { DESKTOP_PETS_DIR: dir } });
    expect(client).toBeNull();
  });

  it('answers pending decisions with none when the connection drops mid-wait', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'dp-drop-'));
    const sock = path.join(dir, 'pet.sock');
    writeFileSync(path.join(dir, 'ipc.json'), JSON.stringify({ socket: sock, token: 't', pid: 1, startedAt: '' }));
    const server = net.createServer((socket) => {
      let buf = '';
      socket.on('data', (c) => {
        buf += c.toString();
        if (buf.includes('"hello"')) {
          socket.write(JSON.stringify({ t: 'ack', ok: true, hostVersion: 'test' }) + '\n');
        }
        if (buf.includes('"wantsDecision"')) {
          socket.destroy(); // agent-side view of "host died mid-decision"
        }
      });
    });
    await new Promise<void>((r) => server.listen(sock, r));
    const client = await PetClient.connect({ role: 'hook', env: { DESKTOP_PETS_DIR: dir } });
    const res = await client!.requestDecision('PreToolUse', {}, 3000);
    expect(res.decision).toBe('none');
    server.close();
  });
});
