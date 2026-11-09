/**
 * Turn any character into a complete, conformant pet: 80 frames through the
 * shared pose engine, composed onto the locked 8x10 sheet.
 *
 * Two kinds of character arrive here. A DrawnCharacter is vector art, which
 * is the house style. A PixelCharacter is the older grid art, still used by
 * the pets built from an image or a prompt. Both answer the same poses, so
 * everything downstream, and every pet in the app, behaves identically.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SPRITE_STATES, validatePetManifest } from '@desktop-pets/shared';
import type { PetManifest, SpriteStateName } from '@desktop-pets/shared';
import { PixelCanvas, resolvePalette, type PixelCharacter } from './pixel.js';
import { resolveHues, type DrawnCharacter } from './draw.js';
import { renderScene } from './paper.js';
import { propShapes } from './props.js';
import { frameFor } from './poses.js';
import { composeSheetFromImage } from './from-image.js';
import { composeSheetWebp, type FrameCell } from './sheet.js';

export type Character = PixelCharacter | DrawnCharacter;

const isDrawn = (c: Character): c is DrawnCharacter => 'front' in c;

/** One sheet of paper per pet: the grain must not crawl between frames. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

/** Render one 192x208 PNG frame of a drawn character. */
export async function renderDrawnFramePng(
  character: DrawnCharacter,
  state: SpriteStateName,
  i: number,
): Promise<Buffer> {
  const f = frameFor(state, i);
  const hues = resolveHues(character.hues, f.palette);
  const seed = seedOf(character.id);
  const shapes = f.side ? character.side(f.pose, hues) : character.front(f.pose, hues);

  if (!f.mirror) {
    if (f.prop) shapes.push(...propShapes(f.prop));
    return renderScene({ shapes, hues }, seed);
  }
  // running-left is running-right flipped, and a prop is never flipped with it
  const flipped = await sharp(await renderScene({ shapes, hues }, seed)).flop().png().toBuffer();
  if (!f.prop) return flipped;
  const prop = await renderScene({ shapes: propShapes(f.prop), hues }, seed + 11);
  return sharp(flipped).composite([{ input: prop }]).png().toBuffer();
}

/** Render one 192x208 PNG frame of a grid character. */
export async function renderPixelFramePng(
  character: PixelCharacter,
  state: SpriteStateName,
  i: number,
): Promise<Buffer> {
  const f = frameFor(state, i);
  const pal = resolvePalette(character.palette, f.palette);
  let c = new PixelCanvas();
  if (f.side) character.drawSide(c, f.pose, pal);
  else character.draw(c, f.pose, pal);
  if (f.mirror) c = c.mirrored();
  // overlays are drawn in frame space, after any mirroring
  f.overlay?.(c);
  const { data, width, height } = c.toRawRGBA();
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Render one frame of whichever kind of character this is. */
export function renderFramePng(
  character: Character,
  state: SpriteStateName,
  i: number,
): Promise<Buffer> {
  return isDrawn(character)
    ? renderDrawnFramePng(character, state, i)
    : renderPixelFramePng(character, state, i);
}

/**
 * Compose a sheet from one already-drawn canvas.
 *
 * A drawing with no rig cannot walk, so it is animated the same way an image
 * pet is — the shared bob, lean, squash and state tints — which is what lets
 * an arbitrary subject still behave like every other pet in the app.
 */
export async function composeSheetFromCanvas(canvas: PixelCanvas): Promise<Buffer> {
  const { data, width, height } = canvas.toRawRGBA();
  const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return composeSheetFromImage(png);
}

export async function composePixelSheet(character: Character): Promise<Buffer> {
  const cells: FrameCell[] = [];
  for (const state of SPRITE_STATES) {
    for (let col = 0; col < state.frames; col++) {
      cells.push({ row: state.row, col, input: await renderFramePng(character, state.name, col) });
    }
  }
  return composeSheetWebp(cells, { lossless: !isDrawn(character) });
}

/** Write a complete pet (sheet + validated manifest) into `outDir`. */
export async function generatePixelPet(
  character: Character,
  manifest: PetManifest,
  outDir: string,
): Promise<{ sheetBytes: number }> {
  const sheet = await composePixelSheet(character);

  const validation = validatePetManifest(manifest);
  if (!validation.ok) {
    throw new Error(`${manifest.id} manifest invalid: ${validation.errors.join('; ')}`);
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'spritesheet.webp'), sheet);
  await writeFile(path.join(outDir, 'pet.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { sheetBytes: sheet.byteLength };
}
