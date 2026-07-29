import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SPRITE_STATES, validatePetManifest } from '@desktop-pets/shared';
import type { PetManifest } from '@desktop-pets/shared';
import { composeSheetWebp, assertSheetGeometry, type FrameCell } from './sheet.js';
import { renderPipFrameSvg } from './pip.js';

export const DEFAULT_PET_MANIFEST: PetManifest = {
  id: 'pip',
  displayName: 'Pip',
  description: 'A friendly blob who keeps one eye on your agents and both eyes on your shell commands.',
  spritesheet: 'spritesheet.webp',
  license: 'CC0-1.0',
  author: 'Desktop Pets contributors',
  generator: 'procedural SVG, @desktop-pets/create-pet (art drawn in code by Claude, Anthropic)',
};

/** Render Pip into `outDir` as a conformant pet (pet.json + spritesheet.webp). */
export async function generateDefaultPet(outDir: string): Promise<{ sheetBytes: number }> {
  const cells: FrameCell[] = [];
  for (const state of SPRITE_STATES) {
    for (let col = 0; col < state.frames; col++) {
      cells.push({
        row: state.row,
        col,
        input: Buffer.from(renderPipFrameSvg(state.name, col, state.frames)),
      });
    }
  }
  const sheet = await composeSheetWebp(cells);
  await assertSheetGeometry(sheet);

  const validation = validatePetManifest(DEFAULT_PET_MANIFEST);
  if (!validation.ok) {
    throw new Error(`default pet manifest failed validation: ${validation.errors.join('; ')}`);
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'spritesheet.webp'), sheet);
  await writeFile(path.join(outDir, 'pet.json'), JSON.stringify(DEFAULT_PET_MANIFEST, null, 2) + '\n');
  return { sheetBytes: sheet.byteLength };
}
