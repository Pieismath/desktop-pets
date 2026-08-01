import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPRITE_SHEET, readWebpSize, validatePetManifest } from '@desktop-pets/shared';
import { BUNDLED_PETS } from './bundled-pets.js';
import { CAT } from './char-cat.js';
import { PixelCanvas, alarmPalette, desaturate, greyPalette, resolvePalette, towardRed } from './pixel.js';
import { generatePixelPet, renderPixelFramePng } from './pixelpet.js';
import { frameFor } from './poses.js';

describe('bundled pets', () => {
  it('ships exactly one default, and it is the cat', () => {
    const defaults = BUNDLED_PETS.filter((p) => p.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.manifest.id).toBe('mochi');
  });

  it('every bundled pet carries provenance', () => {
    for (const { manifest } of BUNDLED_PETS) {
      const res = validatePetManifest(manifest);
      expect(res.ok, `${manifest.id}: ${res.ok ? '' : res.errors.join('; ')}`).toBe(true);
      expect(manifest.license.length).toBeGreaterThan(0);
      expect(manifest.author.length).toBeGreaterThan(0);
    }
  });

  it.each(BUNDLED_PETS.map((p) => [p.manifest.id, p] as const))(
    'generates a conformant sheet for %s',
    async (_id, entry) => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'pixelpet-'));
      await generatePixelPet(entry.character, entry.manifest, dir);
      const sheet = readFileSync(path.join(dir, 'spritesheet.webp'));
      expect(readWebpSize(sheet)).toEqual({ width: SPRITE_SHEET.width, height: SPRITE_SHEET.height });
      const manifest = JSON.parse(readFileSync(path.join(dir, 'pet.json'), 'utf8')) as unknown;
      expect(validatePetManifest(manifest).ok).toBe(true);
    },
    45000,
  );
});

describe('shared pose engine', () => {
  it('uses the side profile only for walking, and mirrors the leftward walk', () => {
    expect(frameFor('running-right', 0).side).toBe(true);
    expect(frameFor('running-left', 0).side).toBe(true);
    expect(frameFor('running-left', 0).mirror).toBe(true);
    expect(frameFor('running-right', 0).mirror).toBeUndefined();
    expect(frameFor('idle', 0).side).toBeUndefined();
    expect(frameFor('working', 0).side).toBeUndefined();
  });

  it('drains colour for failed and flashes red for alarm', () => {
    expect(frameFor('failed', 0).palette).toBe('grey');
    expect(frameFor('alarm', 0).palette).toBe('alarmA');
    expect(frameFor('alarm', 1).palette).toBe('alarmB');
    expect(frameFor('idle', 0).palette).toBe('normal');
  });

  it('walks through the full leg cycle rather than repeating one step', () => {
    const steps = Array.from({ length: 8 }, (_, i) => frameFor('running-right', i).pose.legs);
    expect(new Set(steps).size).toBeGreaterThan(2);
  });
});

describe('palette derivation', () => {
  it('greyPalette removes saturation from any character colour', () => {
    const grey = greyPalette(CAT.palette);
    const [r, g, b] = grey.main;
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(24);
  });

  it('alarmPalette pushes colours toward red', () => {
    const alarm = alarmPalette(CAT.palette, true);
    expect(alarm.main[0]).toBeGreaterThan(alarm.main[1]);
    expect(alarm.main[0]).toBeGreaterThan(alarm.main[2]);
  });

  it('resolvePalette maps every kind, and preserves alpha', () => {
    expect(resolvePalette(CAT.palette, 'normal')).toEqual(CAT.palette);
    for (const kind of ['grey', 'alarmA', 'alarmB'] as const) {
      expect(resolvePalette(CAT.palette, kind).main[3]).toBe(255);
    }
    expect(desaturate([255, 0, 0, 128])[3]).toBe(128);
    expect(towardRed([0, 255, 0, 200])[3]).toBe(200);
  });
});

describe('pixel canvas', () => {
  it('mirrors horizontally', () => {
    const c = new PixelCanvas(4, 1);
    c.px(0, 0, [1, 2, 3, 255]);
    const m = c.mirrored();
    expect(m.get(3, 0)).toEqual([1, 2, 3, 255]);
    expect(m.get(0, 0)).toBeNull();
  });

  it('upscales 4x with hard edges (no blending)', () => {
    const c = new PixelCanvas(1, 1);
    c.px(0, 0, [10, 20, 30, 255]);
    const { data, width, height } = c.toRawRGBA(4);
    expect([width, height]).toEqual([4, 4]);
    // every pixel of the 4x4 block is the exact source colour
    for (let i = 0; i < 16; i++) {
      expect([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]).toEqual([10, 20, 30]);
    }
  });

  it('blitRaw skips transparent source pixels', () => {
    const c = new PixelCanvas(2, 1);
    const src = Buffer.from([255, 0, 0, 255, 0, 255, 0, 0]); // opaque red, transparent green
    c.blitRaw(src, 2, 1, 0, 0);
    expect(c.get(0, 0)).toEqual([255, 0, 0, 255]);
    expect(c.get(1, 0)).toBeNull();
  });

  it('renders a frame at the locked size', async () => {
    const png = await renderPixelFramePng(CAT, 'idle', 0);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  }, 15000);
});
