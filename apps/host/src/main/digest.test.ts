import { describe, expect, it } from 'vitest';
import { buildDigest, digestHeight, renderDigestHtml } from './digest.js';
import type { HistoryEntry } from './history.js';

const NOW = 1_000_000_000_000;
const min = (n: number) => n * 60_000;

const history: HistoryEntry[] = [
  { at: NOW - min(5), kind: 'success', project: 'alpha', detail: 'Task complete', sessionKey: 'a' },
  { at: NOW - min(120), kind: 'success', project: 'bravo', detail: 'Task complete', sessionKey: 'b' },
  { at: NOW - min(60 * 20), kind: 'success', project: 'ancient', detail: 'old', sessionKey: 'c' }, // outside 12h window
  { at: NOW - min(30), kind: 'error', project: 'charlie', detail: 'Turn failed: rate_limit', sessionKey: 'd' },
  { at: NOW - min(2), kind: 'risky', project: 'delta', detail: 'rm -rf ⟨path⟩', sessionKey: 'e' },
];

describe('buildDigest', () => {
  it('reports live blocked sessions with duration, longest first', () => {
    const s = buildDigest(history, [
      { project: 'alpha', since: NOW - min(3), alarm: false },
      { project: 'echo', since: NOW - min(12), alarm: true },
    ], NOW);
    expect(s.blocked.map((b) => b.project)).toEqual(['echo', 'alpha']);
    expect(s.blocked[0]).toMatchObject({ project: 'echo', alarm: true });
    expect(s.blocked[0]!.forMs).toBe(min(12));
  });

  it('summarises completed/failed/risky from the recent window only', () => {
    const s = buildDigest(history, [], NOW);
    expect(s.completed.map((e) => e.project)).toEqual(['alpha', 'bravo']); // 'ancient' aged out
    expect(s.failed.map((e) => e.project)).toEqual(['charlie']);
    expect(s.risky.map((e) => e.project)).toEqual(['delta']);
    expect(s.empty).toBe(false);
  });

  it('marks empty when nothing is live or recent', () => {
    expect(buildDigest([], [], NOW).empty).toBe(true);
  });
});

describe('digestHeight', () => {
  it('is compact when there is nothing to report', () => {
    expect(digestHeight(buildDigest([], [], NOW))).toBe(210);
  });

  it('grows with the number of sections and rows', () => {
    const one = digestHeight(buildDigest([history[0]!], [], NOW));
    const many = digestHeight(buildDigest(history, [{ project: 'x', since: NOW, alarm: false }], NOW));
    expect(many).toBeGreaterThan(one);
  });

  it('never exceeds a screen-friendly maximum', () => {
    const lots = Array.from({ length: 40 }, (_, i) => ({
      at: NOW - i * 1000,
      kind: 'success' as const,
      project: `p${i}`,
      detail: 'done',
      sessionKey: 's',
    }));
    expect(digestHeight(buildDigest(lots, [], NOW))).toBeLessThanOrEqual(560);
  });
});

describe('renderDigestHtml', () => {
  it('produces self-contained HTML with no scripts or external loads', () => {
    const html = renderDigestHtml(buildDigest(history, [{ project: 'alpha', since: NOW - min(3), alarm: false }], NOW), NOW);
    expect(html).toContain('While you were away');
    expect(html).toContain('blocked 3m');
    expect(html).toContain('background:#fff'); // light, not the old dark panel
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain("default-src 'none'");
  });

  it('escapes HTML in project names and details', () => {
    const html = renderDigestHtml(
      buildDigest(
        [{ at: NOW, kind: 'error', project: '<img src=x>', detail: 'boom & <b>', sessionKey: 'x' }],
        [],
        NOW,
      ),
      NOW,
    );
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('boom &amp; &lt;b&gt;');
  });

  it('shows the all-quiet state when empty', () => {
    expect(renderDigestHtml(buildDigest([], [], NOW), NOW)).toContain('All quiet');
  });
});
