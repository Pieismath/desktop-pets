import { describe, expect, it } from 'vitest';
import { HistoryStore } from './history.js';

describe('HistoryStore (ephemeral)', () => {
  it('records entries and returns them in order', () => {
    let t = 1000;
    const h = new HistoryStore({ ephemeral: true, now: () => t });
    h.add({ kind: 'success', project: 'a', detail: 'done', sessionKey: 'a' });
    t += 1000;
    h.add({ kind: 'error', project: 'b', detail: 'boom', sessionKey: 'b' });
    expect(h.all().map((e) => e.kind)).toEqual(['success', 'error']);
    expect(h.all()[0]!.at).toBe(1000);
  });

  it('bounds by max entry count', () => {
    const h = new HistoryStore({ ephemeral: true, maxEntries: 3 });
    for (let i = 0; i < 10; i++) h.add({ kind: 'success', project: `p${i}`, detail: '', sessionKey: 's' });
    expect(h.all()).toHaveLength(3);
    expect(h.all().map((e) => e.project)).toEqual(['p7', 'p8', 'p9']);
  });

  it('drops entries older than maxAge', () => {
    let t = 10_000_000;
    const h = new HistoryStore({ ephemeral: true, maxAgeMs: 1000, now: () => t });
    h.add({ kind: 'success', project: 'old', detail: '', sessionKey: 's' });
    t += 5000;
    h.add({ kind: 'success', project: 'new', detail: '', sessionKey: 's' });
    expect(h.all().map((e) => e.project)).toEqual(['new']);
  });

  it('since() returns only entries within the window', () => {
    let t = 100_000;
    const h = new HistoryStore({ ephemeral: true, now: () => t });
    h.add({ kind: 'success', project: 'old', detail: '', sessionKey: 's' });
    t += 10_000;
    h.add({ kind: 'success', project: 'recent', detail: '', sessionKey: 's' });
    expect(h.since(5000).map((e) => e.project)).toEqual(['recent']);
  });
});
