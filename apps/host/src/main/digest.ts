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

/** Cap each list so the panel stays glanceable rather than a wall of text. */
const MAX_ROWS = 4;

/**
 * How tall the panel needs to be for this summary. The panel runs with
 * JavaScript disabled, so it can't measure itself — we size the window from
 * the content instead, which avoids a scrollbar in every ordinary case.
 */
export function digestHeight(summary: DigestSummary): number {
  const CHROME = 142; // title, subtitle, footer hint and padding
  const SECTION = 34; // section heading
  const ROW = 32;
  const MORE = 22;

  if (summary.empty) return 210;

  const lists = [summary.blocked, summary.completed, summary.failed, summary.risky];
  let h = CHROME;
  for (const list of lists) {
    if (list.length === 0) continue;
    h += SECTION + Math.min(list.length, MAX_ROWS) * ROW;
    if (list.length > MAX_ROWS) h += MORE;
  }
  return Math.max(210, Math.min(h, 560));
}

function rows(items: Array<{ left: string; right: string; flag?: boolean }>, dot: string): string {
  const shown = items.slice(0, MAX_ROWS);
  const extra = items.length - shown.length;
  const body = shown
    .map(
      (r) =>
        `<li><span class="dot" style="background:${dot}"></span>` +
        `<span class="name">${esc(r.left)}</span>` +
        `<span class="meta">${r.flag ? '<b class="warn">risky</b> ' : ''}${esc(r.right)}</span></li>`,
    )
    .join('');
  const more = extra > 0 ? `<li class="more">and ${extra} more</li>` : '';
  return body + more;
}

/**
 * Render the digest as a fully self-contained HTML document (inline CSS, no
 * scripts, no external loads) for a data: URL panel window. Content is
 * host-composed, but project names originate from a cwd basename so they are
 * still HTML-escaped.
 */
export function renderDigestHtml(summary: DigestSummary, now: number): string {
  const section = (title: string, count: number, list: string, dot: string): string =>
    count === 0
      ? ''
      : `<section><h2><span class="swatch" style="background:${dot}"></span>${esc(title)}` +
        `<span class="count">${count}</span></h2><ul>${list}</ul></section>`;

  const AMBER = '#c8811a';
  const GREEN = '#2f9e5f';
  const RED = '#d0453a';

  const body = summary.empty
    ? '<div class="empty"><p class="big">All quiet.</p><p>Nothing needs you right now.</p></div>'
    : section(
        'Waiting on you',
        summary.blocked.length,
        rows(
          summary.blocked.map((b) => ({ left: b.project, right: `blocked ${fmtDur(b.forMs)}`, flag: b.alarm })),
          AMBER,
        ),
        AMBER,
      ) +
      section(
        'Finished',
        summary.completed.length,
        rows(
          summary.completed.map((e) => ({ left: e.project, right: fmtAgo(e.at, now) })),
          GREEN,
        ),
        GREEN,
      ) +
      section(
        'Failed',
        summary.failed.length,
        rows(
          summary.failed.map((e) => ({ left: e.project, right: e.detail })),
          RED,
        ),
        RED,
      ) +
      section(
        'Risky commands',
        summary.risky.length,
        rows(
          summary.risky.map((e) => ({ left: e.project, right: e.detail })),
          RED,
        ),
        RED,
      );

  // Light by default and legible; the dark variant is a soft slate rather
  // than the near-black it used to be.
  const css = [
    'html,body{margin:0;overflow-x:hidden}',
    'body{background:#fff;color:#1c2024;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}',
    '.wrap{padding:18px 18px 16px}',
    'h1{font-size:15px;font-weight:650;margin:0 0 2px;letter-spacing:-.01em}',
    '.sub{margin:0 0 4px;color:#8b939c;font-size:12px}',
    'section{margin-top:18px}',
    'h2{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#6b7480;margin:0 0 6px}',
    '.swatch{width:7px;height:7px;border-radius:2px;flex:none}',
    '.count{margin-left:auto;font-size:11px;color:#9aa2ab;font-variant-numeric:tabular-nums}',
    'ul{list-style:none;margin:0;padding:0}',
    'li{display:flex;align-items:baseline;gap:8px;padding:6px 0;border-top:1px solid #eef0f2}',
    'li:first-child{border-top:0}',
    '.dot{width:5px;height:5px;border-radius:50%;flex:none;transform:translateY(-2px)}',
    '.name{font-weight:600;flex:0 0 auto;max-width:44%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.meta{color:#767f89;flex:1 1 auto;min-width:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}',
    '.warn{color:#c8811a;font-weight:600}',
    '.more{color:#9aa2ab;font-size:12px;padding-left:13px}',
    '.empty{padding:26px 0 20px;text-align:center;color:#8b939c}',
    '.empty .big{font-size:16px;color:#1c2024;font-weight:600;margin:0 0 4px}',
    '.empty p{margin:0;font-size:13px}',
    '.hint{margin:18px 0 0;padding-top:12px;border-top:1px solid #eef0f2;color:#a2aab3;font-size:11px;text-align:center}',
    '@media (prefers-color-scheme:dark){',
    'body{background:#20242a;color:#eef1f4}',
    'h2{color:#9aa4b0}.count,.more,.sub{color:#8a94a0}',
    'li{border-top-color:#2d323a}.meta{color:#a8b2bd}',
    '.hint{border-top-color:#2d323a;color:#79838f}',
    '.empty{color:#9aa4b0}.empty .big{color:#eef1f4}',
    '}',
  ].join('');

  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">' +
    `<style>${css}</style></head><body><div class="wrap">` +
    '<h1>While you were away</h1>' +
    '<p class="sub">Everything here stays on this Mac.</p>' +
    body +
    '<p class="hint">Press Esc or click anywhere to close</p>' +
    '</div></body></html>'
  );
}
