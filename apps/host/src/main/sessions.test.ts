import { describe, expect, it, vi } from 'vitest';
import { sanitizeSpeech } from '@desktop-pets/shared';
import type { ClientMsg, HostMsg } from '@desktop-pets/shared';
import type { IpcConnection } from './ipc-server.js';
import { SessionManager, reactionForPreToolUse } from './sessions.js';

function fakeConn(session?: IpcConnection['session']): IpcConnection & { sent: HostMsg[] } {
  const sent: HostMsg[] = [];
  return { id: 1, role: 'hook', session, reply: (m) => sent.push(m), sent };
}

function mgr(overrides: Partial<ConstructorParameters<typeof SessionManager>[0]> = {}) {
  const changes = { count: 0 };
  const m = new SessionManager({
    sanitize: (t) => sanitizeSpeech(t),
    onChange: () => (changes.count += 1),
    ...overrides,
  });
  return { m, changes };
}

const evt = (event: string, payload: Record<string, unknown> = {}, extra: Partial<ClientMsg> = {}): ClientMsg =>
  ({ t: 'event', event, payload: { session_id: 's1', cwd: '/proj/alpha', ...payload }, ...extra }) as ClientMsg;

describe('reactionForPreToolUse', () => {
  it('maps tools to reactions', () => {
    expect(reactionForPreToolUse({ tool_name: 'Bash', tool_input: { command: 'ls -la' } })).toBe('running');
    expect(reactionForPreToolUse({ tool_name: 'Bash', tool_input: { command: 'pnpm test' } })).toBe('testing');
    expect(reactionForPreToolUse({ tool_name: 'Bash', tool_input: { command: 'npx vitest run x' } })).toBe('testing');
    expect(reactionForPreToolUse({ tool_name: 'Edit' })).toBe('editing');
    expect(reactionForPreToolUse({ tool_name: 'Read' })).toBe('thinking');
    expect(reactionForPreToolUse({ tool_name: 'Task' })).toBe('working');
  });
});

describe('SessionManager', () => {
  it('walks a session through its lifecycle', () => {
    const { m } = mgr();
    const conn = fakeConn();
    m.handleMessage(conn, evt('SessionStart'));
    const s = m.displaySession()!;
    expect(s.name).toBe('alpha');
    expect(s.oneShot?.reaction).toBe('waving');

    m.handleMessage(conn, evt('UserPromptSubmit'));
    expect(s.status).toBe('thinking');

    m.handleMessage(conn, evt('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } }));
    expect(s.status).toBe('running');

    m.handleMessage(conn, evt('PostToolUseFailure', { tool_name: 'Bash' }));
    expect(s.oneShot?.reaction).toBe('error');

    m.handleMessage(conn, evt('Stop'));
    expect(s.status).toBe('idle');
    expect(s.oneShot?.reaction).toBe('success');

    m.handleMessage(conn, evt('SessionEnd'));
    expect(m.list()).toHaveLength(0);
  });

  it('marks waiting on PermissionRequest and answers none by default', () => {
    const { m } = mgr();
    const conn = fakeConn();
    m.handleMessage(conn, evt('PermissionRequest', { tool_name: 'Bash' }, { id: 'q1', wantsDecision: true }));
    const s = m.displaySession()!;
    expect(s.status).toBe('waiting');
    expect(s.waitingSince).toBeDefined();
    expect(s.bubbleText).toBe('Needs permission: Bash');
    expect(conn.sent).toContainEqual({ t: 'decision', id: 'q1', decision: 'none' });
  });

  it('routes decision requests through the seam when provided', () => {
    const seen: string[] = [];
    const { m } = mgr({
      onDecisionRequest: (req) => {
        seen.push(req.event);
        req.respond('deny', 'risk rule');
      },
    });
    const conn = fakeConn();
    m.handleMessage(conn, evt('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }, { id: 'q2', wantsDecision: true }));
    expect(seen).toEqual(['PreToolUse']);
    expect(conn.sent).toContainEqual({ t: 'decision', id: 'q2', decision: 'deny', reason: 'risk rule' });
  });

  it('sanitises MCP speech and expires say bubbles', () => {
    vi.useFakeTimers();
    try {
      const { m } = mgr();
      const conn = fakeConn({ cwd: '/proj/alpha' });
      conn.role = 'mcp';
      m.handleMessage(conn, { t: 'say', text: 'done, wrote /Users/jasonfang/x.txt\nsecond line' });
      const s = m.displaySession()!;
      expect(s.bubbleText).toBe('done, wrote ⟨path⟩ …');
      vi.advanceTimersByTime(9000);
      expect(s.bubbleText).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('merges an MCP connection into the hook session with the same cwd (D6)', () => {
    const { m } = mgr();
    m.handleMessage(fakeConn(), evt('SessionStart'));
    const mcpConn = fakeConn({ cwd: '/proj/alpha' });
    mcpConn.role = 'mcp';
    m.handleMessage(mcpConn, { t: 'status', reaction: 'celebrating' });
    expect(m.list()).toHaveLength(1);
    expect(m.displaySession()!.status).toBe('celebrating');
  });

  it('alternates running rows between runs', () => {
    const { m } = mgr();
    const conn = fakeConn();
    m.handleMessage(conn, evt('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } }));
    const first = m.displaySession()!.runFlip;
    m.handleMessage(conn, evt('PostToolUse', { tool_name: 'Bash' }));
    m.handleMessage(conn, evt('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } }));
    expect(m.displaySession()!.runFlip).toBe(!first);
  });

  it('raises a sticky alarm from the classifier and clears it only on dismiss', () => {
    const { m } = mgr({
      classify: (call) =>
        typeof call.toolInput?.['command'] === 'string' && (call.toolInput['command'] as string).includes('rm -rf')
          ? { level: 'alarm', ruleId: 'rm-recursive-force', reason: 'Recursive force-delete (rm -rf)' }
          : { level: 'none' },
    });
    const conn = fakeConn();
    m.handleMessage(conn, evt('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'rm -rf /data' } }));
    const s = m.displaySession()!;
    expect(s.alarm).toMatchObject({ ruleId: 'rm-recursive-force' });
    expect(s.alarm?.detail).toBe('rm -rf ⟨path⟩');

    // Alarm survives subsequent activity — it is dismissed, not aged out.
    m.handleMessage(conn, evt('PostToolUse', { tool_name: 'Bash' }));
    m.handleMessage(conn, evt('Stop'));
    expect(s.alarm).toBeDefined();

    m.dismissAlarm(s.key);
    expect(s.alarm).toBeUndefined();
  });

  it('stays silent for ordinary commands when a classifier is installed', () => {
    const { m } = mgr({ classify: () => ({ level: 'none' }) });
    const conn = fakeConn();
    m.handleMessage(conn, evt('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } }));
    expect(m.displaySession()!.alarm).toBeUndefined();
  });

  it('sweeps sessions that stopped sending events (agent died mid-task)', () => {
    let t = 1000;
    const { m } = mgr({ now: () => t });
    m.handleMessage(fakeConn(), evt('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'sleep 999' } }));
    expect(m.list()).toHaveLength(1);
    t += 31 * 60_000;
    m.sweepStale(30 * 60_000);
    expect(m.list()).toHaveLength(0);
  });
});
