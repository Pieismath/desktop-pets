/**
 * Browser entry point for the pet generator.
 *
 * Everything the generator needs to *draw* a pet is pure logic with no Node
 * dependencies (sharp is only used to encode the finished sheet), so the same
 * code that builds a spritesheet on the command line can render a live preview
 * on a web page. Bundle this file to embed a pet designer anywhere:
 *
 *   esbuild src/browser.ts --bundle --format=iife --global-name=DesktopPets
 */
import {
  PixelCanvas,
  resolvePalette,
  desaturate,
  towardRed,
  LOGICAL_W,
  LOGICAL_H,
  LOGICAL_BASELINE,
} from './pixel.js';
import type { PaletteKind, RGBA } from './pixel.js';
import { buildCharacter } from './char-generated.js';
import { frameFor } from './poses.js';
import {
  coatLabel,
  featureLabels,
  hashString,
  idFromPrompt,
  KNOWN_SPECIES,
  nameFromPrompt,
  unusedWords,
  traitsFromPrompt,
} from './traits.js';
import type { Invented } from './traits.js';
import { findConcept, type ConceptHit } from './pictograph.js';

export { buildCharacter, frameFor, traitsFromPrompt, idFromPrompt, nameFromPrompt, PixelCanvas, KNOWN_SPECIES };
export { findConcept, KNOWN_CONCEPTS } from './pictograph.js';

/** The sprite states a preview is likely to want, with their real timings. */
export const PREVIEW_STATES = [
  { name: 'idle', frames: 6, durationMs: 5500 },
  { name: 'running-right', frames: 8, durationMs: 1060 },
  { name: 'working', frames: 6, durationMs: 820 },
  { name: 'alarm', frames: 6, durationMs: 900 },
] as const;

export type PreviewState = (typeof PREVIEW_STATES)[number]['name'];

/**
 * The slice of a 2D canvas context we actually use. Declared structurally so
 * this package keeps its Node-only type surface and does not need the DOM lib.
 */
export interface Painter {
  fillStyle: string;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/**
 * Draw one frame of a described pet into a canvas, scaled up with hard pixel
 * edges. Returns nothing; paints straight onto the 2D context.
 */
export function paintFrame(
  ctx: Painter,
  prompt: string,
  state: PreviewState,
  frameIndex: number,
  scale: number,
): void {
  const { traits } = traitsFromPrompt(prompt);
  const character = buildCharacter('preview', traits);
  const f = frameFor(state as Parameters<typeof frameFor>[0], frameIndex);
  const palette = resolvePalette(character.palette, f.palette as PaletteKind);

  let canvas = new PixelCanvas();
  if (f.side) character.drawSide(canvas, f.pose, palette);
  else character.draw(canvas, f.pose, palette);
  if (f.mirror) canvas = canvas.mirrored();
  f.overlay?.(canvas);

  ctx.clearRect(0, 0, LOGICAL_W * scale, LOGICAL_H * scale);
  for (let y = 0; y < LOGICAL_H; y++) {
    for (let x = 0; x < LOGICAL_W; x++) {
      const c = canvas.get(x, y);
      if (!c) continue;
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

/** A rasterised pictograph: tightly-cropped RGBA pixels the caller produced. */
export interface Sprite {
  data: ArrayLike<number>;
  w: number;
  h: number;
}

/** Nearest-neighbour resize, so squash keeps hard pixel edges. */
function resample(sprite: Sprite, w: number, h: number): Sprite {
  if (w === sprite.w && h === sprite.h) return sprite;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(sprite.h - 1, Math.floor((y * sprite.h) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(sprite.w - 1, Math.floor((x * sprite.w) / w));
      const s = (sy * sprite.w + sx) * 4;
      const d = (y * w + x) * 4;
      out[d] = sprite.data[s] ?? 0;
      out[d + 1] = sprite.data[s + 1] ?? 0;
      out[d + 2] = sprite.data[s + 2] ?? 0;
      out[d + 3] = sprite.data[s + 3] ?? 0;
    }
  }
  return { data: out, w, h };
}

function recolourFor(kind: PaletteKind): ((c: RGBA) => RGBA) | undefined {
  if (kind === 'grey') return (c) => desaturate(c);
  if (kind === 'alarmA') return (c) => towardRed(c, 0.82);
  if (kind === 'alarmB') return (c) => towardRed(c, 0.92);
  return undefined;
}

/**
 * Draw one animated frame of a pictograph pet.
 *
 * A picture has no limbs to swing, so it gets the same treatment an image pet
 * gets on the command line: whole-body bob and lean, a hop on the mid-stride
 * frames so walking reads as movement, the grey wash when a task fails, the
 * red wash and warning sign on alarm, and the state overlays. Without this the
 * preview showed the same still emoji for every mood, which is not what the
 * installed pet actually does.
 */
export function paintPictographFrame(
  ctx: Painter,
  sprite: Sprite,
  state: PreviewState,
  frameIndex: number,
  scale: number,
): void {
  const f = frameFor(state as Parameters<typeof frameFor>[0], frameIndex);
  const pose = f.pose;

  const squash = pose.squash ?? 0;
  const art = resample(
    sprite,
    Math.max(1, Math.round(sprite.w * (1 + squash * 0.03))),
    Math.max(1, Math.round(sprite.h * (1 - squash * 0.03))),
  );

  const midStride = f.side && (pose.legs === 2 || pose.legs === 4);
  const left = Math.round(24 - art.w / 2 + (pose.dx ?? 0));
  const top = Math.round(LOGICAL_BASELINE - art.h + (pose.dy ?? 0) + (midStride ? -2 : 0));

  let canvas = new PixelCanvas();
  canvas.blitRaw(art.data, art.w, art.h, left, top, recolourFor(f.palette as PaletteKind));
  if (f.mirror) canvas = canvas.mirrored();
  f.overlay?.(canvas);

  ctx.clearRect(0, 0, LOGICAL_W * scale, LOGICAL_H * scale);
  for (let y = 0; y < LOGICAL_H; y++) {
    for (let x = 0; x < LOGICAL_W; x++) {
      const c = canvas.get(x, y);
      if (!c) continue;
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

export interface Description {
  summary: string;
  /**
   * Set when the prompt named a thing rather than a creature. The caller draws
   * the glyph itself — the browser can rasterise an emoji natively, and doing
   * it there keeps this module free of any DOM dependency.
   */
  concept?: ConceptHit;
  matched: string[];
  /** Readings taken from a word's shape rather than a word we know. */
  assumed: string[];
  /** Words from the prompt that changed nothing about the result. */
  ignored: string[];
  /** Parts of the pet no word in the prompt asked for. */
  invented: Invented[];
  /** Set when the animal itself was a guess — say this out loud, don't bury it. */
  warning?: string;
  /** A handful of words that would have worked, to show alongside the warning. */
  suggestions: string[];
  id: string;
  name: string;
}

/** What the description was understood as, for showing back to the reader. */
export function describe(prompt: string): Description {
  const { traits, matched, invented, assumed } = traitsFromPrompt(prompt);
  const bits = [coatLabel(traits), ...featureLabels(traits)];
  // no creature or person, but possibly a thing we have a picture of
  const concept = invented.includes('species') ? findConcept(prompt) : undefined;
  const guessedSpecies = invented.includes('species') && !concept;
  return {
    summary: concept ? `${concept.term} ${concept.glyph}` : bits.join(', '),
    ...(concept ? { concept } : {}),
    matched,
    assumed,
    // only worth pointing out once something was understood; when nothing was,
    // the warning below already says so
    ignored: guessedSpecies ? [] : unusedWords(prompt),
    invented,
    ...(guessedSpecies
      ? { warning: 'No creature or person in there that I know, so this one is invented. Name one and I will draw that instead.' }
      : {}),
    suggestions: guessedSpecies ? suggestFor(prompt) : [],
    id: idFromPrompt(prompt),
    name: nameFromPrompt(prompt),
  };
}

/** A stable handful of species to offer, varied by prompt so it doesn't feel canned. */
function suggestFor(prompt: string): string[] {
  const start = hashString(prompt) % KNOWN_SPECIES.length;
  // stride past the alphabetical neighbours so the six on offer look unalike
  return Array.from({ length: 6 }, (_, i) => KNOWN_SPECIES[(start + i * 7) % KNOWN_SPECIES.length]!);
}

export const LOGICAL = { w: LOGICAL_W, h: LOGICAL_H };
