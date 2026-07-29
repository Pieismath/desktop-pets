/**
 * The two vocabularies are deliberately separate (see README):
 *
 * - Sprite states: what art exists — the 10 fixed rows of a spritesheet.
 * - Reactions: what agents and plugins speak in.
 *
 * Agents only ever emit reactions; the host resolves each to a sprite state
 * through a user-overridable mapping. New reactions never require new art.
 */

export const SPRITE_STATE_NAMES = [
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'working',
  'review',
  'alarm',
] as const;

export type SpriteStateName = (typeof SPRITE_STATE_NAMES)[number];

export const REACTIONS = [
  'idle',
  'thinking',
  'working',
  'editing',
  'running',
  'testing',
  'waiting',
  'waving',
  'success',
  'error',
  'celebrating',
  'risky',
] as const;

export type Reaction = (typeof REACTIONS)[number];

export function isReaction(value: unknown): value is Reaction {
  return typeof value === 'string' && (REACTIONS as readonly string[]).includes(value);
}

/**
 * Default reaction → sprite-state mapping. `running` alternates between the
 * two running rows at render time; the map stores the canonical row.
 */
export const DEFAULT_REACTION_MAP: Readonly<Record<Reaction, SpriteStateName>> = {
  idle: 'idle',
  thinking: 'working',
  working: 'working',
  editing: 'working',
  running: 'running-right',
  testing: 'review',
  waiting: 'waiting',
  waving: 'waving',
  success: 'jumping',
  error: 'failed',
  celebrating: 'jumping',
  risky: 'alarm',
};

export interface MappingIssue {
  reaction: string;
  target: string;
  problem: 'unknown-reaction' | 'unknown-sprite-state';
}

/**
 * Merge user overrides over the default map, rejecting unknown keys/targets
 * instead of silently accepting them.
 */
export function resolveReactionMap(
  overrides: Readonly<Record<string, string>> | undefined,
): { map: Record<Reaction, SpriteStateName>; issues: MappingIssue[] } {
  const map: Record<Reaction, SpriteStateName> = { ...DEFAULT_REACTION_MAP };
  const issues: MappingIssue[] = [];
  for (const [reaction, target] of Object.entries(overrides ?? {})) {
    if (!isReaction(reaction)) {
      issues.push({ reaction, target, problem: 'unknown-reaction' });
      continue;
    }
    if (!(SPRITE_STATE_NAMES as readonly string[]).includes(target)) {
      issues.push({ reaction, target, problem: 'unknown-sprite-state' });
      continue;
    }
    map[reaction] = target as SpriteStateName;
  }
  return { map, issues };
}
