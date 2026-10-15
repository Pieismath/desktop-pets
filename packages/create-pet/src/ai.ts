/**
 * Optional: let a model read the prompt, using *your* Anthropic key.
 *
 * The offline reader in `traits.ts` has a hard ceiling in two places — the
 * words it knows, and the parts it can draw. This lifts both, without giving
 * up the things that make the offline path worth having:
 *
 *   - **parts mode** — the model fills in the same part spec the offline
 *     reader produces, so anything expressible as a creature or a person comes
 *     out fully articulated, with a real walk cycle and every sprite state.
 *   - **draw mode** — for anything the parts cannot express (a teapot, a
 *     lighthouse, a bowl of ramen), the model returns a small drawing program
 *     in the same primitives the hand-drawn pets use, which is then animated
 *     through the shared motion vocabulary. No subject matter is off limits.
 *
 * The model never returns code and never returns pixels it can smuggle
 * anything through: `draw` mode is a validated list of rectangles and circles,
 * executed by the same canvas the rest of the generator draws on.
 *
 * **This is opt-in and billed to whoever runs it.** The key comes from the
 * caller's own environment or flag; there is no key in this repository and no
 * shared account. Without `--ai` nothing here is loaded and nothing leaves the
 * machine.
 */
import {
  BUILDS,
  BODY_KINDS,
  EAR_KINDS,
  EYE_KINDS,
  FACIAL_HAIR_KINDS,
  GAITS,
  HAIR_KINDS,
  HAT_KINDS,
  HELD_KINDS,
  MUZZLE_KINDS,
  OUTFIT_KINDS,
  PATTERN_KINDS,
  TAIL_KINDS,
  traitsFromPrompt,
  type Traits,
} from './traits.js';
import { PixelCanvas, type RGBA } from './pixel.js';

/** Anthropic's most capable model. Override per run; the caller pays. */
export const DEFAULT_AI_MODEL = 'claude-opus-5';

const MAX_OPS = 600;
const MAX_COLOURS = 24;

// ------------------------------------------------------------------ schema

const enumOf = (values: readonly string[], description: string) => ({
  type: 'string',
  enum: [...values],
  description,
});

/**
 * The shape the model must answer in. Built from the same arrays the drawing
 * code switches on, so it cannot offer a part that does not exist.
 */
export const PET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'name', 'reasoning'],
  properties: {
    mode: enumOf(
      ['parts', 'draw'],
      'Use "parts" whenever the subject is a creature or a person — it animates far better. Use "draw" only when the subject cannot be expressed as one, such as an object, a vehicle, food or a landmark.',
    ),
    name: { type: 'string', description: 'Two or three words naming this pet.' },
    reasoning: { type: 'string', description: 'One sentence on how you read the prompt.' },

    parts: {
      type: 'object',
      additionalProperties: false,
      description: 'Required when mode is "parts".',
      required: ['build', 'species', 'skin'],
      properties: {
        build: enumOf(BUILDS, 'humanoid for anything person-shaped, beast for animals and creatures.'),
        species: { type: 'string', description: 'What this is, in a word or two, for showing back to the user.' },
        ears: enumOf(EAR_KINDS, ''),
        tail: enumOf(TAIL_KINDS, ''),
        muzzle: enumOf(MUZZLE_KINDS, ''),
        body: enumOf(BODY_KINDS, ''),
        eyes: enumOf(EYE_KINDS, ''),
        gait: enumOf(GAITS, ''),
        pattern: enumOf(PATTERN_KINDS, 'Markings over the coat.'),
        hair: enumOf(HAIR_KINDS, 'Humanoids only.'),
        facialHair: enumOf(FACIAL_HAIR_KINDS, 'Humanoids only.'),
        outfit: enumOf(OUTFIT_KINDS, 'Humanoids only.'),
        hat: enumOf(HAT_KINDS, 'Works on any build.'),
        held: enumOf(HELD_KINDS, 'Works on any build.'),
        whiskers: { type: 'boolean' },
        glasses: { type: 'boolean' },
        skin: { type: 'string', description: 'Coat or skin colour as #rrggbb.' },
        hairColour: { type: 'string', description: 'Hair colour as #rrggbb.' },
        clothing: { type: 'string', description: 'Clothing colour as #rrggbb.' },
        accent: { type: 'string', description: 'Eye or detail colour as #rrggbb.' },
      },
    },

    draw: {
      type: 'object',
      additionalProperties: false,
      description: 'Required when mode is "draw".',
      required: ['palette', 'ops'],
      properties: {
        palette: {
          type: 'object',
          description: 'Named colours as #rrggbb, at most 24. Op colours refer to these names.',
          additionalProperties: { type: 'string' },
        },
        ops: {
          type: 'array',
          description:
            'Drawing steps, painted in order on a 48 wide by 52 tall grid. The character should stand on the ground line at y=46 and fill roughly 34 by 38. Finish with an "outline" op to trace a 1px edge, the way every pet in this app is drawn.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['op'],
            properties: {
              op: enumOf(['rect', 'round', 'ellipse', 'px', 'outline'], ''),
              x: { type: 'integer' },
              y: { type: 'integer' },
              w: { type: 'integer' },
              h: { type: 'integer' },
              cx: { type: 'integer' },
              cy: { type: 'integer' },
              rx: { type: 'integer' },
              ry: { type: 'integer' },
              c: { type: 'string', description: 'A key from palette.' },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `You design tiny pixel-art desktop pets. A pet is drawn on a 48x52 grid, stands on a ground line at y=46, and is animated by the app into 80 frames: idle, walking, working, waiting, celebrating, failing and alarmed.

Read the user's description and answer in the given schema.

Prefer "parts" mode. It produces a rigged character with a real walk cycle, and it covers creatures and people of every kind, including roles and costumes. Reach for "draw" mode only when the subject genuinely is not a creature or a person.

In parts mode, choose every field deliberately — an unset field falls back to a plain default. Colours are #rrggbb. Pick a small, warm, readable palette: this is a 48x52 sprite, so a handful of well separated colours reads better than many close ones.

In draw mode, build the subject from filled rectangles and circles, largest shapes first, details last, then one final "outline" op. Keep it under 200 ops. Leave the silhouette solid and readable at this size — a shape that is recognisable in a 34x38 block, not a detailed illustration.`;

// -------------------------------------------------------------- validation

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(value: unknown): RGBA | undefined {
  if (typeof value !== 'string' || !HEX.test(value)) return undefined;
  let h = value.slice(1);
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
}

const oneOf = <T extends string>(values: readonly T[], v: unknown): T | undefined =>
  typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : undefined;

export interface PetPlan {
  mode: 'parts' | 'draw';
  name: string;
  reasoning: string;
  traits?: Traits;
  drawing?: { palette: Record<string, RGBA>; ops: DrawOp[] };
}

export type DrawOp =
  | { op: 'rect' | 'round'; x: number; y: number; w: number; h: number; c: string }
  | { op: 'ellipse'; cx: number; cy: number; rx: number; ry: number; c: string }
  | { op: 'px'; x: number; y: number; c: string }
  | { op: 'outline'; c: string };

const int = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && Math.trunc(v) >= lo && Math.trunc(v) <= hi
    ? Math.trunc(v)
    : undefined;

/**
 * Turn a model answer into something drawable.
 *
 * Every field is checked against the vocabulary and every coordinate against
 * the grid. Anything missing or unrecognised falls back to what the offline
 * reader made of the same prompt, so a partial answer degrades to a worse pet
 * rather than to an error.
 */
export function planFromResponse(raw: unknown, prompt: string): PetPlan {
  const o = (raw ?? {}) as Record<string, unknown>;
  const mode = oneOf(['parts', 'draw'] as const, o['mode']) ?? 'parts';
  const name = typeof o['name'] === 'string' ? o['name'].slice(0, 64) : '';
  const reasoning = typeof o['reasoning'] === 'string' ? o['reasoning'].slice(0, 300) : '';

  if (mode === 'draw') {
    const drawing = parseDrawing(o['draw']);
    if (drawing) return { mode: 'draw', name, reasoning, drawing };
    // a draw answer we cannot execute is still a prompt we can read offline
  }

  const base = traitsFromPrompt(prompt).traits;
  const p = (o['parts'] ?? {}) as Record<string, unknown>;
  const traits: Traits = {
    ...base,
    build: oneOf(BUILDS, p['build']) ?? base.build,
    ears: oneOf(EAR_KINDS, p['ears']) ?? base.ears,
    tail: oneOf(TAIL_KINDS, p['tail']) ?? base.tail,
    muzzle: oneOf(MUZZLE_KINDS, p['muzzle']) ?? base.muzzle,
    body: oneOf(BODY_KINDS, p['body']) ?? base.body,
    eyes: oneOf(EYE_KINDS, p['eyes']) ?? base.eyes,
    gait: oneOf(GAITS, p['gait']) ?? base.gait,
    pattern: oneOf(PATTERN_KINDS, p['pattern']) ?? base.pattern,
    hair: oneOf(HAIR_KINDS, p['hair']) ?? base.hair,
    facialHair: oneOf(FACIAL_HAIR_KINDS, p['facialHair']) ?? base.facialHair,
    outfit: oneOf(OUTFIT_KINDS, p['outfit']) ?? base.outfit,
    hat: oneOf(HAT_KINDS, p['hat']) ?? base.hat,
    held: oneOf(HELD_KINDS, p['held']) ?? base.held,
    whiskers: typeof p['whiskers'] === 'boolean' ? p['whiskers'] : base.whiskers,
    glasses: typeof p['glasses'] === 'boolean' ? p['glasses'] : base.glasses,
    colour: parseHex(p['skin']) ?? base.colour,
    hairColour: parseHex(p['hairColour']) ?? base.hairColour,
    clothing: parseHex(p['clothing']) ?? base.clothing,
    accent: parseHex(p['accent']) ?? base.accent,
    species: typeof p['species'] === 'string' && p['species'] ? p['species'].slice(0, 40) : base.species,
    colourName: base.colourName,
  };
  return { mode: 'parts', name, reasoning, traits };
}

function parseDrawing(raw: unknown): PetPlan['drawing'] | undefined {
  const d = (raw ?? {}) as Record<string, unknown>;
  const palRaw = d['palette'];
  const opsRaw = d['ops'];
  if (typeof palRaw !== 'object' || palRaw === null || !Array.isArray(opsRaw)) return undefined;

  const palette: Record<string, RGBA> = {};
  for (const [key, value] of Object.entries(palRaw as Record<string, unknown>)) {
    if (Object.keys(palette).length >= MAX_COLOURS) break;
    const c = parseHex(value);
    if (c) palette[key] = c;
  }
  if (Object.keys(palette).length === 0) return undefined;

  const ops: DrawOp[] = [];
  for (const item of opsRaw.slice(0, MAX_OPS)) {
    const op = parseOp(item, palette);
    if (op) ops.push(op);
  }
  return ops.length > 0 ? { palette, ops } : undefined;
}

function parseOp(raw: unknown, palette: Record<string, RGBA>): DrawOp | undefined {
  const o = (raw ?? {}) as Record<string, unknown>;
  const kind = oneOf(['rect', 'round', 'ellipse', 'px', 'outline'] as const, o['op']);
  if (!kind) return undefined;
  const c = typeof o['c'] === 'string' ? o['c'] : '';
  if (!(c in palette)) return undefined;

  // a little off-grid is fine — the canvas clips — but not wildly so
  if (kind === 'outline') return { op: 'outline', c };
  if (kind === 'px') {
    const x = int(o['x'], -8, 56);
    const y = int(o['y'], -8, 60);
    return x !== undefined && y !== undefined ? { op: 'px', x, y, c } : undefined;
  }
  if (kind === 'ellipse') {
    const cx = int(o['cx'], -8, 56);
    const cy = int(o['cy'], -8, 60);
    const rx = int(o['rx'], 1, 48);
    const ry = int(o['ry'], 1, 52);
    return cx !== undefined && cy !== undefined && rx !== undefined && ry !== undefined
      ? { op: 'ellipse', cx, cy, rx, ry, c }
      : undefined;
  }
  const x = int(o['x'], -8, 56);
  const y = int(o['y'], -8, 60);
  const w = int(o['w'], 1, 60);
  const h = int(o['h'], 1, 60);
  return x !== undefined && y !== undefined && w !== undefined && h !== undefined
    ? { op: kind, x, y, w, h, c }
    : undefined;
}

/** Run a validated drawing program onto the logical grid. */
export function renderDrawing(drawing: NonNullable<PetPlan['drawing']>): PixelCanvas {
  const c = new PixelCanvas();
  for (const op of drawing.ops) {
    const colour = drawing.palette[op.c]!;
    switch (op.op) {
      case 'rect':
        c.rect(op.x, op.y, op.w, op.h, colour);
        break;
      case 'round':
        c.round(op.x, op.y, op.w, op.h, colour);
        break;
      case 'ellipse':
        c.ellipse(op.cx, op.cy, op.rx, op.ry, colour);
        break;
      case 'px':
        c.px(op.x, op.y, colour);
        break;
      case 'outline':
        c.outline(colour);
        break;
    }
  }
  return c;
}

// ------------------------------------------------------------------ client

export interface AiOptions {
  /** The caller's own Anthropic key. Never read from anywhere but here. */
  apiKey: string;
  model?: string;
  /** Swap the transport in tests. */
  send?: (req: AiRequest) => Promise<unknown>;
}

export interface AiRequest {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
}

export class AiError extends Error {}

/** Where the key comes from: an explicit flag, else the caller's environment. */
export function resolveApiKey(flag: string | undefined, env: NodeJS.ProcessEnv): string | undefined {
  const fromFlag = typeof flag === 'string' ? flag.trim() : '';
  if (fromFlag) return fromFlag;
  const fromEnv = (env['ANTHROPIC_API_KEY'] ?? '').trim();
  return fromEnv || undefined;
}

async function callAnthropic(req: AiRequest): Promise<unknown> {
  // imported here so the offline path never loads the SDK
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: req.apiKey });
  let response;
  try {
    response = await client.beta.messages.create({
      model: req.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: req.system,
      messages: [{ role: 'user', content: req.prompt }],
      output_config: { format: { type: 'json_schema', schema: req.schema } },
    });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 401) throw new AiError('that API key was rejected (401). Check it and try again.');
    if (e.status === 429) throw new AiError('rate limited by the API (429). Wait a moment and try again.');
    throw new AiError(`the API call failed: ${e.message ?? String(err)}`);
  }

  if (response.stop_reason === 'refusal') {
    throw new AiError('the model declined to answer that prompt. Try describing the pet differently.');
  }
  const text = response.content
    .filter((b): b is typeof b & { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!text.trim()) throw new AiError('the model returned nothing to draw.');
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError('the model did not return usable JSON.');
  }
}

/** Ask a model to design the pet. Throws AiError with a readable reason. */
export async function planWithAi(prompt: string, opts: AiOptions): Promise<PetPlan> {
  const req: AiRequest = {
    apiKey: opts.apiKey,
    model: opts.model ?? DEFAULT_AI_MODEL,
    system: SYSTEM,
    prompt,
    schema: PET_SCHEMA,
  };
  const raw = await (opts.send ?? callAnthropic)(req);
  return planFromResponse(raw, prompt);
}
