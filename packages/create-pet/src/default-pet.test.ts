import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPRITE_SHEET, readWebpSize, validatePetManifest } from '@desktop-pets/shared';
import { generateDefaultPet } from './default-pet.js';

describe('default pet generation', () => {
  it('produces a conformant sheet and a manifest that passes validation', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pip-'));
    await generateDefaultPet(dir);

    const sheet = await readFile(path.join(dir, 'spritesheet.webp'));
    const dims = readWebpSize(sheet);
    expect(dims).toEqual({ width: SPRITE_SHEET.width, height: SPRITE_SHEET.height });

    const manifest = JSON.parse(await readFile(path.join(dir, 'pet.json'), 'utf8')) as unknown;
    const res = validatePetManifest(manifest);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.pet.license).toBe('CC0-1.0');
      expect(res.pet.author).not.toHaveLength(0);
      expect(res.pet.generator).toBeDefined();
    }
  }, 30000);
});
