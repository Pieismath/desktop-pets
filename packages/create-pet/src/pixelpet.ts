/**
 * Turn any PixelCharacter into a complete, conformant pet: 80 frames through
 * the shared pose engine, composed onto the locked 8x10 sheet.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SPRITE_STATES, validatePetManifest } from '@desktop-pets/shared';
import type { PetManifest, SpriteStateName } from '@desktop-pets/shared';
import { PixelCanvas, resolvePalette, type PixelCharacter } from './pixel.js';
import { frameFor } from './poses.js';
import { composeSheetWebp, type FrameCell } from './sheet.js';

/** Render one 192x208 PNG frame of a character. */
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

export async function composePixelSheet(character: PixelCharacter): Promise<Buffer> {
  const cells: FrameCell[] = [];
  for (const state of SPRITE_STATES) {
    for (let col = 0; col < state.frames; col++) {
      cells.push({ row: state.row, col, input: await renderPixelFramePng(character, state.name, col) });
    }
  }
  return composeSheetWebp(cells);
}

/** Write a complete pet (sheet + validated manifest) into `outDir`. */
export async function generatePixelPet(
  character: PixelCharacter,
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
