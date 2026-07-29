import type { SpriteStateName } from './reactions.js';

/** Locked sprite-sheet geometry. Do not change (brief §5). */
export const SPRITE_SHEET = {
  columns: 8,
  rows: 10,
  frameWidth: 192,
  frameHeight: 208,
  width: 8 * 192,
  height: 10 * 208,
} as const;

export type SpriteLoop = number | 'infinite' | 'until-dismissed';

export interface SpriteStateSpec {
  name: SpriteStateName;
  row: number;
  frames: number;
  durationMs: number;
  loop: SpriteLoop;
  /**
   * What happens when a finite loop count completes: fall back to the
   * session's persistent state, or hold the final frame (e.g. `failed`
   * staying slumped until something else happens).
   */
  after: 'revert' | 'hold';
}

/** Fixed row order — one row per state, locked. */
export const SPRITE_STATES: readonly SpriteStateSpec[] = [
  { name: 'idle', row: 0, frames: 6, durationMs: 5500, loop: 'infinite', after: 'revert' },
  { name: 'running-right', row: 1, frames: 8, durationMs: 1060, loop: 1, after: 'revert' },
  { name: 'running-left', row: 2, frames: 8, durationMs: 1060, loop: 1, after: 'revert' },
  { name: 'waving', row: 3, frames: 4, durationMs: 700, loop: 2, after: 'revert' },
  { name: 'jumping', row: 4, frames: 5, durationMs: 840, loop: 2, after: 'revert' },
  { name: 'failed', row: 5, frames: 8, durationMs: 1220, loop: 2, after: 'hold' },
  { name: 'waiting', row: 6, frames: 6, durationMs: 1010, loop: 1, after: 'revert' },
  { name: 'working', row: 7, frames: 6, durationMs: 820, loop: 1, after: 'revert' },
  { name: 'review', row: 8, frames: 6, durationMs: 1030, loop: 1, after: 'revert' },
  { name: 'alarm', row: 9, frames: 6, durationMs: 900, loop: 'until-dismissed', after: 'revert' },
];

export const SPRITE_STATE_BY_NAME: ReadonlyMap<SpriteStateName, SpriteStateSpec> = new Map(
  SPRITE_STATES.map((s) => [s.name, s]),
);

export const PET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** SPDX license-expression charset (no semantic validation of the id). */
const SPDX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .+()-]*$/;

export interface PetManifest {
  id: string;
  displayName: string;
  description: string;
  spritesheet: string;
  /** SPDX id — REQUIRED. A pet without provenance cannot install. */
  license: string;
  /** REQUIRED. */
  author: string;
  authorUrl?: string;
  /** AI tool used to generate the art, if any. */
  generator?: string;
}

const KNOWN_KEYS = new Set([
  'id',
  'displayName',
  'description',
  'spritesheet',
  'license',
  'author',
  'authorUrl',
  'generator',
]);

export type PetValidation =
  | { ok: true; pet: PetManifest; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Validate a parsed pet.json. `license` and `author` are hard requirements —
 * there is deliberately no escape hatch (brief §2).
 */
export function validatePetManifest(input: unknown): PetValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['pet.json must be a JSON object'], warnings };
  }
  const obj = input as Record<string, unknown>;

  const id = obj['id'];
  if (!isNonEmptyString(id)) errors.push('"id" is required and must be a string');
  else if (!PET_ID_PATTERN.test(id)) {
    errors.push(`"id" must match ${PET_ID_PATTERN.source} (kebab-case), got ${JSON.stringify(id)}`);
  }

  const displayName = obj['displayName'];
  if (!isNonEmptyString(displayName)) errors.push('"displayName" is required and must be a non-empty string');
  else if (displayName.length > 64) errors.push('"displayName" must be at most 64 characters');

  const description = obj['description'];
  if (!isNonEmptyString(description)) errors.push('"description" is required and must be a non-empty string');
  else if (description.length > 300) errors.push('"description" must be at most 300 characters');

  const spritesheet = obj['spritesheet'];
  if (!isNonEmptyString(spritesheet)) {
    errors.push('"spritesheet" is required and must be a non-empty string');
  } else if (/[/\\]/.test(spritesheet) || spritesheet.includes('..')) {
    errors.push('"spritesheet" must be a plain file name inside the pet directory (no path separators)');
  }

  const license = obj['license'];
  if (!isNonEmptyString(license)) {
    errors.push('"license" is REQUIRED (SPDX id) — a pet without a license cannot install');
  } else if (license.length > 64 || !SPDX_PATTERN.test(license.trim())) {
    errors.push(`"license" must look like an SPDX expression, got ${JSON.stringify(license)}`);
  }

  const author = obj['author'];
  if (!isNonEmptyString(author)) {
    errors.push('"author" is REQUIRED — a pet without an author cannot install');
  } else if (author.length > 120) {
    errors.push('"author" must be at most 120 characters');
  }

  const authorUrl = obj['authorUrl'];
  if (authorUrl !== undefined) {
    if (!isNonEmptyString(authorUrl) || !/^https?:\/\//.test(authorUrl)) {
      errors.push('"authorUrl" must be an http(s) URL when present');
    }
  }

  const generator = obj['generator'];
  if (generator !== undefined && !isNonEmptyString(generator)) {
    errors.push('"generator" must be a non-empty string when present');
  }

  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`unknown key ${JSON.stringify(key)} ignored`);
  }

  if (errors.length > 0) return { ok: false, errors, warnings };
  const pet: PetManifest = {
    id: (id as string).trim(),
    displayName: (displayName as string).trim(),
    description: (description as string).trim(),
    spritesheet: (spritesheet as string).trim(),
    license: (license as string).trim(),
    author: (author as string).trim(),
  };
  if (authorUrl !== undefined) pet.authorUrl = (authorUrl as string).trim();
  if (generator !== undefined) pet.generator = (generator as string).trim();
  return { ok: true, pet, warnings };
}
