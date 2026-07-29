import { describe, expect, it, vi } from 'vitest';
import type { Decision } from '@desktop-pets/shared';
import { DecisionBroker } from './broker.js';
import type { DecisionRequest } from './sessions.js';

function makeReq(key: string, tool = 'Bash'): DecisionRequest & { answered: Array<{ d: Decision; r?: string }> } {
  const answered: Array<{ d: Decision; r?: string }> = [];
  return {
    session: { key, name: key, status: 'waiting', firstSeen: 0, lastEventAt: 0 },
    event: 'PermissionRequest',
    payload: { tool_name: tool },
    respond: (d, r) => answered.push({ d, ...(r !== undefined ? { r } : {}) }),
    answered,
  };
}

describe('DecisionBroker', () => {
  it('holds a request and resolves it once on approve', () => {
    const resolved: Array<[string, Decision]> = [];
    const broker = new DecisionBroker({ maxHoldMs: 1000, onResolved: (k, d) => resolved.push([k, d]) });
    const req = makeReq('s1');
    broker.hold(req);
    expect(broker.has('s1')).toBe(true);
    expect(broker.get('s1')?.tool).toBe('Bash');

    expect(broker.resolve('s1', 'allow')).toBe(true);
    expect(req.answered).toEqual([{ d: 'allow' }]);
    expect(resolved).toEqual([['s1', 'allow']]);
    expect(broker.has('s1')).toBe(false);

    // second resolve is a no-op — the hook is answered exactly once
    expect(broker.resolve('s1', 'deny')).toBe(false);
    expect(req.answered).toHaveLength(1);
  });

  it('passes a deny reason through to the hook', () => {
    const broker = new DecisionBroker({ maxHoldMs: 1000, onResolved: () => {} });
    const req = makeReq('s1');
    broker.hold(req);
    broker.resolve('s1', 'deny', 'nope');
    expect(req.answered).toEqual([{ d: 'deny', r: 'nope' }]);
  });

  it('superseding a hold releases the old one as none', () => {
    const broker = new DecisionBroker({ maxHoldMs: 1000, onResolved: () => {} });
    const first = makeReq('s1', 'Bash');
    const second = makeReq('s1', 'Write');
    broker.hold(first);
    broker.hold(second);
    expect(first.answered).toEqual([{ d: 'none', r: 'superseded' }]);
    expect(broker.get('s1')?.tool).toBe('Write');
    broker.resolve('s1', 'allow');
    expect(second.answered).toEqual([{ d: 'allow' }]);
  });

  it('times out to none using injected timers', () => {
    vi.useFakeTimers();
    try {
      const broker = new DecisionBroker({ maxHoldMs: 5000, onResolved: () => {} });
      const req = makeReq('s1');
      broker.hold(req);
      expect(req.answered).toHaveLength(0);
      vi.advanceTimersByTime(5000);
      expect(req.answered).toEqual([{ d: 'none', r: 'timeout' }]);
      expect(broker.has('s1')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releaseAll answers every pending hook as none', () => {
    const broker = new DecisionBroker({ maxHoldMs: 1000, onResolved: () => {} });
    const a = makeReq('a');
    const b = makeReq('b');
    broker.hold(a);
    broker.hold(b);
    broker.releaseAll('shutdown');
    expect(a.answered).toEqual([{ d: 'none', r: 'shutdown' }]);
    expect(b.answered).toEqual([{ d: 'none', r: 'shutdown' }]);
    expect(broker.keys()).toHaveLength(0);
  });
});
