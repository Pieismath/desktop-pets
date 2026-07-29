/**
 * Pure logic for adding/removing our hook entries in a Claude Code settings
 * object. The installer CLI wraps this with file IO. Uninstall removes
 * exactly the entries we recognise as ours and nothing else.
 */

export interface HookEntry {
  type: 'command';
  command: string;
  args?: string[];
  timeout?: number;
  async?: boolean;
  statusMessage?: string;
  [key: string]: unknown;
}

export interface MatcherGroup {
  matcher?: string;
  hooks: HookEntry[];
  [key: string]: unknown;
}

export type SettingsObject = Record<string, unknown> & {
  hooks?: Record<string, MatcherGroup[]>;
};

interface EventSpec {
  event: string;
  matcher?: string;
  timeout: number;
  async?: boolean;
  statusMessage?: string;
}

/**
 * Which events we subscribe to. Decision-capable events run synchronously;
 * telemetry-only events run async so the pet adds no latency to Claude.
 */
export const EVENT_SPECS: readonly EventSpec[] = [
  {
    event: 'PreToolUse',
    matcher: '*',
    timeout: 120,
    statusMessage: 'Desktop pet is checking this tool call',
  },
  {
    event: 'PermissionRequest',
    matcher: '*',
    timeout: 600,
    statusMessage: 'Answer on your desktop pet — or focus this terminal to answer here',
  },
  { event: 'PostToolUse', matcher: '*', timeout: 30, async: true },
  { event: 'PostToolUseFailure', matcher: '*', timeout: 30, async: true },
  { event: 'UserPromptSubmit', timeout: 15, async: true },
  { event: 'Notification', timeout: 30, async: true },
  { event: 'Stop', timeout: 30, async: true },
  { event: 'StopFailure', timeout: 30, async: true },
  { event: 'SessionStart', timeout: 30, async: true },
  { event: 'SessionEnd', timeout: 5, async: true },
] as const;

export const RUNNER_BASENAME = 'hook-runner.js';

export function isOurEntry(entry: unknown): entry is HookEntry {
  if (typeof entry !== 'object' || entry === null) return false;
  const e = entry as HookEntry;
  if (e.type !== 'command') return false;
  const haystack = [e.command, ...(Array.isArray(e.args) ? e.args : [])];
  return haystack.some((part) => typeof part === 'string' && part.endsWith(RUNNER_BASENAME));
}

export function buildEntry(spec: EventSpec, runnerPath: string, nodePath: string): HookEntry {
  const entry: HookEntry = {
    type: 'command',
    command: nodePath,
    args: [runnerPath, spec.event],
    timeout: spec.timeout,
  };
  if (spec.async) entry.async = true;
  if (spec.statusMessage) entry.statusMessage = spec.statusMessage;
  return entry;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export interface InstallResult {
  next: SettingsObject;
  added: string[];
  updated: string[];
}

export function installIntoSettings(
  settings: SettingsObject,
  runnerPath: string,
  nodePath: string,
): InstallResult {
  const next = clone(settings);
  const added: string[] = [];
  const updated: string[] = [];
  const hooks: Record<string, MatcherGroup[]> = (next.hooks = (next.hooks as Record<string, MatcherGroup[]>) ?? {});

  for (const spec of EVENT_SPECS) {
    const groups: MatcherGroup[] = (hooks[spec.event] = hooks[spec.event] ?? []);
    let group = groups.find((g) =>
      spec.matcher === undefined ? g.matcher === undefined || g.matcher === '' || g.matcher === '*' : g.matcher === spec.matcher,
    );
    if (!group) {
      group = spec.matcher === undefined ? { hooks: [] } : { matcher: spec.matcher, hooks: [] };
      groups.push(group);
    }
    group.hooks = group.hooks ?? [];
    const desired = buildEntry(spec, runnerPath, nodePath);
    const existingIdx = group.hooks.findIndex(isOurEntry);
    if (existingIdx >= 0) {
      const existing = group.hooks[existingIdx];
      if (JSON.stringify(existing) !== JSON.stringify(desired)) {
        group.hooks[existingIdx] = desired;
        updated.push(spec.event);
      }
    } else {
      group.hooks.push(desired);
      added.push(spec.event);
    }
  }
  return { next, added, updated };
}

export interface UninstallResult {
  next: SettingsObject;
  removed: number;
}

export function uninstallFromSettings(settings: SettingsObject): UninstallResult {
  const next = clone(settings);
  let removed = 0;
  const hooks = next.hooks;
  if (!hooks || typeof hooks !== 'object') return { next, removed };

  for (const event of Object.keys(hooks)) {
    const groups = hooks[event];
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!Array.isArray(group?.hooks)) continue;
      const before = group.hooks.length;
      group.hooks = group.hooks.filter((h) => !isOurEntry(h));
      removed += before - group.hooks.length;
    }
    hooks[event] = groups.filter((g) => Array.isArray(g?.hooks) && g.hooks.length > 0);
    if (hooks[event].length === 0) delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete next.hooks;
  return { next, removed };
}

export function statusOfSettings(settings: SettingsObject): string[] {
  const present: string[] = [];
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== 'object') return present;
  for (const [event, groups] of Object.entries(hooks)) {
    if (Array.isArray(groups) && groups.some((g) => Array.isArray(g?.hooks) && g.hooks.some(isOurEntry))) {
      present.push(event);
    }
  }
  return present;
}
