/**
 * Turn a plain-English description into character traits.
 *
 * Deliberately offline and dependency-free: no API key, no network, no cost
 * to anyone. A prompt is matched against a vocabulary of species, colours and
 * features; anything it doesn't pin down is filled in deterministically from
 * a hash of the prompt, so the same words always give the same pet.
 */
import type { Palette, RGBA } from './pixel.js';

export type EarKind = 'pointed' | 'floppy' | 'round' | 'tall' | 'antenna' | 'horns' | 'none';
export type TailKind = 'long' | 'curled' | 'bushy' | 'puff' | 'stub' | 'none';
export type MuzzleKind = 'small' | 'snout' | 'beak' | 'none';
export type BodyKind = 'round' | 'tall' | 'boxy';
export type EyeKind = 'round' | 'slit' | 'screen' | 'beady';
export type Gait = 'quadruped' | 'biped';

export interface Traits {
  ears: EarKind;
  tail: TailKind;
  muzzle: MuzzleKind;
  body: BodyKind;
  eyes: EyeKind;
  gait: Gait;
  whiskers: boolean;
  /** Base coat colour; the rest of the palette is derived from it. */
  colour: RGBA;
  /** Iris / detail colour. */
  accent: RGBA;
  /** What the prompt was recognised as, for the CLI to report back. */
  species: string;
  colourName: string;
}

/** Stable 32-bit hash so the same prompt always yields the same pet. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type SpeciesPreset = Omit<Traits, 'colour' | 'accent' | 'species' | 'colourName'>;

const SPECIES: Record<string, SpeciesPreset> = {
  cat: { ears: 'pointed', tail: 'long', muzzle: 'small', body: 'round', eyes: 'slit', gait: 'quadruped', whiskers: true },
  kitten: { ears: 'pointed', tail: 'long', muzzle: 'small', body: 'round', eyes: 'slit', gait: 'quadruped', whiskers: true },
  dog: { ears: 'floppy', tail: 'curled', muzzle: 'snout', body: 'round', eyes: 'round', gait: 'quadruped', whiskers: false },
  puppy: { ears: 'floppy', tail: 'curled', muzzle: 'snout', body: 'round', eyes: 'round', gait: 'quadruped', whiskers: false },
  fox: { ears: 'pointed', tail: 'bushy', muzzle: 'snout', body: 'round', eyes: 'round', gait: 'quadruped', whiskers: true },
  wolf: { ears: 'pointed', tail: 'bushy', muzzle: 'snout', body: 'tall', eyes: 'round', gait: 'quadruped', whiskers: false },
  bear: { ears: 'round', tail: 'stub', muzzle: 'snout', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: false },
  panda: { ears: 'round', tail: 'stub', muzzle: 'snout', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: false },
  rabbit: { ears: 'tall', tail: 'puff', muzzle: 'small', body: 'round', eyes: 'round', gait: 'quadruped', whiskers: true },
  bunny: { ears: 'tall', tail: 'puff', muzzle: 'small', body: 'round', eyes: 'round', gait: 'quadruped', whiskers: true },
  mouse: { ears: 'round', tail: 'long', muzzle: 'small', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: true },
  bird: { ears: 'none', tail: 'puff', muzzle: 'beak', body: 'round', eyes: 'beady', gait: 'biped', whiskers: false },
  penguin: { ears: 'none', tail: 'stub', muzzle: 'beak', body: 'tall', eyes: 'beady', gait: 'biped', whiskers: false },
  owl: { ears: 'pointed', tail: 'stub', muzzle: 'beak', body: 'round', eyes: 'round', gait: 'biped', whiskers: false },
  duck: { ears: 'none', tail: 'puff', muzzle: 'beak', body: 'round', eyes: 'beady', gait: 'biped', whiskers: false },
  frog: { ears: 'none', tail: 'none', muzzle: 'none', body: 'round', eyes: 'round', gait: 'biped', whiskers: false },
  dragon: { ears: 'horns', tail: 'long', muzzle: 'snout', body: 'tall', eyes: 'slit', gait: 'quadruped', whiskers: false },
  lizard: { ears: 'none', tail: 'long', muzzle: 'snout', body: 'round', eyes: 'slit', gait: 'quadruped', whiskers: false },
  dinosaur: { ears: 'none', tail: 'long', muzzle: 'snout', body: 'tall', eyes: 'slit', gait: 'biped', whiskers: false },
  robot: { ears: 'antenna', tail: 'none', muzzle: 'none', body: 'boxy', eyes: 'screen', gait: 'biped', whiskers: false },
  ghost: { ears: 'none', tail: 'none', muzzle: 'none', body: 'tall', eyes: 'round', gait: 'biped', whiskers: false },
  blob: { ears: 'none', tail: 'none', muzzle: 'none', body: 'round', eyes: 'round', gait: 'biped', whiskers: false },
  slime: { ears: 'none', tail: 'none', muzzle: 'none', body: 'round', eyes: 'round', gait: 'biped', whiskers: false },
  alien: { ears: 'antenna', tail: 'none', muzzle: 'none', body: 'tall', eyes: 'round', gait: 'biped', whiskers: false },
  hamster: { ears: 'round', tail: 'stub', muzzle: 'small', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: true },
  pig: { ears: 'floppy', tail: 'curled', muzzle: 'snout', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: false },
};

const COLOURS: Record<string, RGBA> = {
  red: [222, 74, 62, 255],
  crimson: [198, 50, 62, 255],
  orange: [240, 145, 63, 255],
  ginger: [232, 128, 54, 255],
  amber: [240, 170, 60, 255],
  yellow: [240, 205, 78, 255],
  gold: [232, 186, 74, 255],
  lime: [154, 214, 88, 255],
  green: [104, 190, 106, 255],
  emerald: [70, 182, 130, 255],
  mint: [140, 224, 190, 255],
  teal: [76, 190, 190, 255],
  cyan: [92, 206, 226, 255],
  blue: [92, 154, 226, 255],
  navy: [78, 108, 178, 255],
  indigo: [118, 116, 214, 255],
  purple: [162, 122, 220, 255],
  violet: [176, 130, 226, 255],
  lavender: [196, 172, 234, 255],
  pink: [238, 146, 182, 255],
  rose: [232, 128, 152, 255],
  brown: [166, 118, 78, 255],
  tan: [216, 176, 122, 255],
  cream: [238, 216, 178, 255],
  white: [236, 238, 242, 255],
  grey: [166, 176, 186, 255],
  gray: [166, 176, 186, 255],
  silver: [190, 198, 208, 255],
  black: [86, 92, 100, 255],
  charcoal: [104, 110, 120, 255],
};

const EAR_WORDS: Array<[RegExp, EarKind]> = [
  [/\bfloppy\b/, 'floppy'],
  [/\b(pointy|pointed|sharp) ears?\b/, 'pointed'],
  [/\b(long|tall|big) ears?\b/, 'tall'],
  [/\bround ears?\b/, 'round'],
  [/\bhorns?\b|\bhorned\b/, 'horns'],
  [/\bantenna e?\b|\bantennae?\b/, 'antenna'],
  [/\bno ears?\b|\bearless\b/, 'none'],
];

const TAIL_WORDS: Array<[RegExp, TailKind]> = [
  [/\bbushy tail\b|\bfluffy tail\b/, 'bushy'],
  [/\bcurled tail\b|\bcurly tail\b/, 'curled'],
  [/\blong tail\b/, 'long'],
  [/\bno tail\b|\btailless\b/, 'none'],
  [/\bstubby tail\b|\bshort tail\b/, 'stub'],
];

/**
 * Index into a list by seed. Normalises the index because a signed shift of a
 * large hash can go negative, which would silently pick `undefined`.
 */
const pick = <T>(list: readonly T[], seed: number): T =>
  list[((Math.trunc(seed) % list.length) + list.length) % list.length]!;

function lighten(c: RGBA, f: number): RGBA {
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(v + (255 - v) * f)));
  return [m(c[0]), m(c[1]), m(c[2]), 255];
}

function darken(c: RGBA, f: number): RGBA {
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - f))));
  return [m(c[0]), m(c[1]), m(c[2]), 255];
}

/** Build a full sprite palette from one coat colour. */
export function paletteFromTraits(traits: Traits): Palette {
  const main = traits.colour;
  return {
    out: darken(main, 0.66),
    dark: darken(main, 0.24),
    main,
    light: lighten(main, 0.26),
    // a warm off-white belly that still reads against very pale coats
    cream: lighten(main, 0.86),
    eyeWhite: [255, 252, 246, 255],
    eyeDark: darken(main, 0.82),
    accent: traits.accent,
  };
}

export interface ParsedPrompt {
  traits: Traits;
  /** Words we recognised, for the CLI to echo back. */
  matched: string[];
}

/**
 * Parse a description into traits. Unrecognised prompts still produce a valid
 * pet — the hash decides — so this never fails.
 */
export function traitsFromPrompt(prompt: string): ParsedPrompt {
  const text = ` ${prompt.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')} `;
  const seed = hashString(prompt.trim().toLowerCase());
  const matched: string[] = [];

  // species
  let species = '';
  for (const name of Object.keys(SPECIES)) {
    if (new RegExp(`\\b${name}s?\\b`).test(text)) {
      species = name;
      break;
    }
  }
  if (species) matched.push(species);
  const speciesKeys = Object.keys(SPECIES);
  const base = SPECIES[species] ?? SPECIES[pick(speciesKeys, seed)]!;

  // colour
  let colourName = '';
  for (const name of Object.keys(COLOURS)) {
    if (new RegExp(`\\b${name}\\b`).test(text)) {
      colourName = name;
      break;
    }
  }
  if (colourName) matched.push(colourName);
  const colourKeys = Object.keys(COLOURS);
  const resolvedColour = colourName || pick(colourKeys, seed >>> 8);
  const colour = COLOURS[resolvedColour]!;

  // explicit feature overrides
  const traits: Traits = {
    ...base,
    colour,
    accent: [122, 212, 106, 255],
    species: species || resolvedColour + ' creature',
    colourName: resolvedColour,
  };

  for (const [re, kind] of EAR_WORDS) {
    if (re.test(text)) {
      traits.ears = kind;
      matched.push(`${kind} ears`);
      break;
    }
  }
  for (const [re, kind] of TAIL_WORDS) {
    if (re.test(text)) {
      traits.tail = kind;
      matched.push(`${kind} tail`);
      break;
    }
  }
  if (/\bwhiskers?\b/.test(text)) {
    traits.whiskers = true;
    matched.push('whiskers');
  }
  if (/\btall\b|\blanky\b/.test(text)) traits.body = 'tall';
  if (/\bboxy\b|\bsquare\b|\bblocky\b/.test(text)) traits.body = 'boxy';
  if (/\bround\b|\bchubby\b|\bchonky\b/.test(text)) traits.body = 'round';

  // eye colour: a complementary accent unless the prompt names one
  const eyeMatch = /\b(green|blue|amber|gold|red|purple|pink|yellow|cyan)\s+eyes?\b/.exec(text);
  if (eyeMatch) {
    traits.accent = COLOURS[eyeMatch[1]!]!;
    matched.push(`${eyeMatch[1]} eyes`);
  } else {
    traits.accent = pick(
      [COLOURS['green']!, COLOURS['amber']!, COLOURS['cyan']!, COLOURS['blue']!, COLOURS['gold']!],
      seed >>> 16,
    );
  }

  return { traits, matched };
}

/** A kebab-case id derived from the prompt, for when the user doesn't pass one. */
export function idFromPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter((w) => !['a', 'an', 'the', 'with', 'and', 'of'].includes(w))
    .slice(0, 3)
    .join('-');
  const safe = slug.replace(/^[^a-z0-9]+/, '').slice(0, 40);
  return safe.length >= 2 ? safe : `pet-${hashString(prompt).toString(36).slice(0, 6)}`;
}

/** A display name derived from the prompt. */
export function nameFromPrompt(prompt: string): string {
  const words = prompt
    .trim()
    .split(/\s+/)
    .filter((w) => !['a', 'an', 'the'].includes(w.toLowerCase()))
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(' ').slice(0, 64) || 'My Pet';
}
