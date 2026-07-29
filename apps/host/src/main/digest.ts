import type { HistoryEntry } from './history.js';

export interface BlockedItem {
  project: string;
  forMs: number;
  alarm: boolean;
}

export interface EventItem {
  project: string;
  detail: string;
  at: number;
}

export interface DigestSummary {
  blocked: BlockedItem[];
  completed: EventItem[];
  failed: EventItem[];
  risky: EventItem[];
  empty: boolean;
}

export interface LiveBlocked {
  project: string;
  since: number;
  alarm: boolean;
}

/**
 * Compose the "while you were away" summary: what is blocked *right now* (with
 * duration — the useful signal) from live state, and what completed / failed /
 * flagged as risky from the bounded history window. Pure; unit-tested.
 */
export function buildDigest(
  history: readonly HistoryEntry[],
  liveBlocked: LiveBlocked[],
  now: number,
  windowMs = 12 * 60 * 60 * 1000,
): DigestSummary {
  const cutoff = now - windowMs;
  const recent = history.filter((e) => e.at >= cutoff);

  const latestByKind = (kind: HistoryEntry['kind']): EventItem[] =>
    recent
      .filter((e) => e.kind === kind)
      .sort((a, b) => b.at - a.at)
      .map((e) => ({ project: e.project, detail: e.detail, at: e.at }));

  const blocked = liveBlocked
    .map((b) => ({ project: b.project, forMs: Math.max(0, now - b.since), alarm: b.alarm }))
    .sort((a, b) => b.forMs - a.forMs); // longest-blocked first: duration is the signal

  const completed = latestByKind('success');
  const failed = latestByKind('error');
  const risky = latestByKind('risky');

  return {
    blocked,
    completed,
    failed,
    risky,
    empty: blocked.length === 0 && completed.length === 0 && failed.length === 0 && risky.length === 0,
  };
}

function fmtDur(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtAgo(at: number, now: number): string {
  return `${fmtDur(now - at)} ago`;
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * Render the digest as a fully self-contained HTML document (inline CSS, no
 * scripts, no external loads) for a data: URL panel window. Content is
 * host-composed, but project names originate from a cwd basename so they are
 * still HTML-escaped.
 */
export function renderDigestHtml(summary: DigestSummary, now: number): string {
  const section = (title: string, rows: string[], accent: string): string =>
    rows.length === 0
      ? ''
      : `<section><h2 style="color:${accent}">${esc(title)}</h2><ul>${rows.join('')}</ul></section>`;

  const blockedRows = summary.blocked.map(
    (b) =>
      `<li><span class="proj">${esc(b.project)}</span>` +
      `<span class="meta">${b.alarm ? '⚠︎ ' : ''}blocked ${fmtDur(b.forMs)}</span></li>`,
  );
  const doneRows = summary.completed.slice(0, 8).map(
    (e) => `<li><span class="proj">${esc(e.project)}</span><span class="meta">${fmtAgo(e.at, now)}</span></li>`,
  );
  const failRows = summary.failed.slice(0, 8).map(
    (e) => `<li><span class="proj">${esc(e.project)}</span><span class="meta">${esc(e.detail)}</span></li>`,
  );
  const riskyRows = summary.risky.slice(0, 8).map(
    (e) => `<li><span class="proj">${esc(e.project)}</span><span class="meta">${esc(e.detail)}</span></li>`,
  );

  const body = summary.empty
    ? '<p class="empty">Nothing to report. All quiet.</p>'
    : section('Blocked now', blockedRows, '#ffb648') +
      section('Completed', doneRows, '#2ecc71') +
      section('Failed', failRows, '#e74c3c') +
      section('Risky', riskyRows, '#ff5546');

  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">' +
    '<style>' +
    'html,body{margin:0;background:#12161e;color:#eaf2f4;font:13px -apple-system,BlinkMacSystemFont,sans-serif;overflow-x:hidden}' +
    '.wrap{padding:12px 14px}h1{font-size:13px;margin:0 0 8px;color:#9fb2c8;font-weight:600}' +
    'h2{font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin:12px 0 4px}' +
    'ul{list-style:none;margin:0;padding:0}li{display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)}' +
    '.proj{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 0 auto;max-width:45%}' +
    '.meta{color:#9fb2c8;flex:1 1 auto;min-width:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.empty{color:#9fb2c8;padding:8px 0}' +
    '.hint{margin-top:12px;color:#5f6b7a;font-size:11px}' +
    '</style></head><body><div class="wrap"><h1>🐾 While you were away</h1>' +
    body +
    '<p class="hint">Esc or click away to close · local only</p></div></body></html>'
  );
}
