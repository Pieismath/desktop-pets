/**
 * The escalation ladder (brief §5), as a pure function so it can be tested
 * exhaustively without Electron or a real desktop.
 *
 *   | Situation                              | Response          |
 *   | at machine, agent's app focused        | silent animation  |
 *   | at machine, other app focused          | speech bubble     |
 *   | idle > notifyIdleSec (default 2 min)   | OS notification   |
 *   | idle > digestIdleSec (default 10 min)  | notification+digest |
 *
 * Plus Do Not Disturb: while screen-sharing / in a call (or manual DND),
 * everything below `alarm` stays silent. Alarms never route through here —
 * they are always maximally visible and bypass DND.
 */

export type EscalationTier = 'silent' | 'animate' | 'bubble' | 'notify' | 'digest';

export interface EscalationThresholds {
  notifyIdleSec: number;
  digestIdleSec: number;
}

export interface EscalationInput {
  idleSeconds: number;
  focusedBundleId: string | undefined;
  agentBundleId: string | undefined;
  dnd: boolean;
  thresholds: EscalationThresholds;
}

/** How loud may the pet be about a non-alarm announcement right now? */
export function computeTier(input: EscalationInput): EscalationTier {
  const { idleSeconds, focusedBundleId, agentBundleId, dnd, thresholds } = input;

  // DND wins over everything below an alarm.
  if (dnd) return 'silent';

  if (idleSeconds >= thresholds.digestIdleSec) return 'digest';
  if (idleSeconds >= thresholds.notifyIdleSec) return 'notify';

  // At the machine: silent animation if the agent's own app is focused,
  // otherwise a speech bubble to catch the eye in another app.
  if (agentBundleId && focusedBundleId && focusedBundleId === agentBundleId) return 'animate';
  return 'bubble';
}

export function tierShowsBubble(tier: EscalationTier): boolean {
  return tier === 'bubble' || tier === 'notify' || tier === 'digest';
}

export function tierFiresNotification(tier: EscalationTier): boolean {
  return tier === 'notify' || tier === 'digest';
}

export function tierQueuesDigest(tier: EscalationTier): boolean {
  return tier === 'digest';
}

/**
 * Map a terminal's TERM_PROGRAM to its bundle id, so we can compare the
 * agent's app against the frontmost app even when the hook didn't inherit
 * __CFBundleIdentifier. Best-effort; unknown terminals fall through.
 */
const TERM_PROGRAM_BUNDLES: Record<string, string> = {
  'iTerm.app': 'com.googlecode.iterm2',
  Apple_Terminal: 'com.apple.Terminal',
  vscode: 'com.microsoft.VSCode',
  WarpTerminal: 'dev.warp.Warp-Stable',
  ghostty: 'com.mitchellh.ghostty',
  Hyper: 'co.zeit.hyper',
  Tabby: 'org.tabby',
  WezTerm: 'com.github.wez.wezterm',
  kitty: 'net.kovidgoyal.kitty',
  Alacritty: 'org.alacritty',
};

export function agentBundleId(session: { bundleId?: string; termProgram?: string }): string | undefined {
  if (session.bundleId) return session.bundleId;
  if (session.termProgram) return TERM_PROGRAM_BUNDLES[session.termProgram];
  return undefined;
}

export const DEFAULT_ESCALATION: EscalationThresholds = {
  notifyIdleSec: 120,
  digestIdleSec: 600,
};
