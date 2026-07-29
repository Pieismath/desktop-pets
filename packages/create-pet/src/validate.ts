import fs from 'node:fs';
import path from 'node:path';
import { SPRITE_SHEET, readWebpSize, validatePetManifest } from '@desktop-pets/shared';
import type { PetManifest } from '@desktop-pets/shared';

export interface PetDirValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  pet?: PetManifest;
}

/**
 * Validate a pet directory the same way the host does before install:
 * manifest provenance (license + author required), plus spritesheet geometry
 * (the locked 8×10 grid of 192×208 frames).
 */
export function validatePetDir(dir: string): PetDirValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(dir, 'pet.json'), 'utf8'));
  } catch (err) {
    return { ok: false, errors: [`cannot read pet.json: ${(err as Error).message}`], warnings };
  }

  const res = validatePetManifest(parsed);
  if (!res.ok) return { ok: false, errors: res.errors, warnings: res.warnings };
  warnings.push(...res.warnings);

  const sheetPath = path.join(dir, res.pet.spritesheet);
  let sheet: Buffer;
  try {
    sheet = fs.readFileSync(sheetPath);
  } catch {
    return { ok: false, errors: [`spritesheet not found: ${res.pet.spritesheet}`], warnings };
  }
  const dims = readWebpSize(sheet);
  if (!dims) {
    errors.push(`${res.pet.spritesheet} is not a readable WebP`);
  } else if (dims.width !== SPRITE_SHEET.width || dims.height !== SPRITE_SHEET.height) {
    errors.push(
      `spritesheet must be ${SPRITE_SHEET.width}×${SPRITE_SHEET.height} ` +
        `(${SPRITE_SHEET.columns} cols × ${SPRITE_SHEET.rows} rows of ${SPRITE_SHEET.frameWidth}×${SPRITE_SHEET.frameHeight}), ` +
        `got ${dims.width}×${dims.height}`,
    );
  }

  return { ok: errors.length === 0, errors, warnings, pet: res.pet };
}
