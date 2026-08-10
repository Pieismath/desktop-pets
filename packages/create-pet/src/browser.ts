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
import { PixelCanvas, resolvePalette, LOGICAL_W, LOGICAL_H } from './pixel.js';
import type { PaletteKind } from './pixel.js';
import { buildCharacter } from './char-generated.js';
import { frameFor } from './poses.js';
import { idFromPrompt, nameFromPrompt, traitsFromPrompt } from './traits.js';

export { buildCharacter, frameFor, traitsFromPrompt, idFromPrompt, nameFromPrompt, PixelCanvas };

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

/** What the description was understood as, for showing back to the reader. */
export function describe(prompt: string): { summary: string; matched: string[]; id: string; name: string } {
  const { traits, matched } = traitsFromPrompt(prompt);
  const bits = [`${traits.colourName} ${traits.species}`];
  if (traits.ears !== 'none') bits.push(`${traits.ears} ears`);
  if (traits.tail !== 'none') bits.push(`${traits.tail} tail`);
  return {
    summary: bits.join(', '),
    matched,
    id: idFromPrompt(prompt),
    name: nameFromPrompt(prompt),
  };
}

export const LOGICAL = { w: LOGICAL_W, h: LOGICAL_H };
