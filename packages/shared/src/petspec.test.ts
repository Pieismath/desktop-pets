import { describe, expect, it } from 'vitest';
import { SPRITE_SHEET, SPRITE_STATES, validatePetManifest } from './petspec.js';
import { readWebpSize } from './webp.js';

const validPet = {
  id: 'pip',
  displayName: 'Pip',
  description: 'A friendly blob.',
  spritesheet: 'spritesheet.webp',
  license: 'CC0-1.0',
  author: 'Desktop Pets contributors',
};

describe('sprite sheet spec', () => {
  it('locks the 8x10 grid of 192x208 frames', () => {
    expect(SPRITE_SHEET).toMatchObject({ columns: 8, rows: 10, frameWidth: 192, frameHeight: 208 });
    expect(SPRITE_SHEET.width).toBe(1536);
    expect(SPRITE_SHEET.height).toBe(2080);
  });

  it('has ten states with unique rows 0..9 in fixed order and frames within the grid', () => {
    expect(SPRITE_STATES).toHaveLength(10);
    SPRITE_STATES.forEach((s, i) => {
      expect(s.row).toBe(i);
      expect(s.frames).toBeGreaterThan(0);
      expect(s.frames).toBeLessThanOrEqual(SPRITE_SHEET.columns);
    });
    expect(SPRITE_STATES.map((s) => s.name)).toEqual([
      'idle',
      'running-right',
      'running-left',
      'waving',
      'jumping',
      'failed',
      'waiting',
      'working',
      'review',
      'alarm',
    ]);
  });
});

describe('validatePetManifest', () => {
  it('accepts a valid manifest', () => {
    const res = validatePetManifest(validPet);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.pet.id).toBe('pip');
  });

  it('REJECTS a pet missing license — no escape hatch', () => {
    const { license: _license, ...rest } = validPet;
    const res = validatePetManifest(rest);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(' ')).toMatch(/license.*REQUIRED/);
  });

  it('REJECTS a pet missing author', () => {
    const { author: _author, ...rest } = validPet;
    const res = validatePetManifest(rest);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(' ')).toMatch(/author.*REQUIRED/);
  });

  it('rejects empty-string license and author (whitespace does not count)', () => {
    expect(validatePetManifest({ ...validPet, license: '  ' }).ok).toBe(false);
    expect(validatePetManifest({ ...validPet, author: '' }).ok).toBe(false);
  });

  it('rejects bad ids, path-escaping spritesheets, and non-object input', () => {
    expect(validatePetManifest({ ...validPet, id: 'Bad_ID!' }).ok).toBe(false);
    expect(validatePetManifest({ ...validPet, id: '-leading' }).ok).toBe(false);
    expect(validatePetManifest({ ...validPet, spritesheet: '../escape.webp' }).ok).toBe(false);
    expect(validatePetManifest({ ...validPet, spritesheet: 'a/b.webp' }).ok).toBe(false);
    expect(validatePetManifest(null).ok).toBe(false);
    expect(validatePetManifest('nope').ok).toBe(false);
  });

  it('warns on unknown keys but still accepts', () => {
    const res = validatePetManifest({ ...validPet, futureField: 1 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.warnings[0]).toMatch(/futureField/);
  });
});

describe('readWebpSize', () => {
  it('parses a hand-built VP8X header', () => {
    const buf = new Uint8Array(30);
    const put = (s: string, off: number) => [...s].forEach((c, i) => (buf[off + i] = c.charCodeAt(0)));
    put('RIFF', 0);
    put('WEBP', 8);
    put('VP8X', 12);
    // canvas 1536x2080 -> store minus one, 24-bit LE at offsets 24 and 27
    const w = 1535;
    const h = 2079;
    buf[24] = w & 0xff;
    buf[25] = (w >> 8) & 0xff;
    buf[26] = (w >> 16) & 0xff;
    buf[27] = h & 0xff;
    buf[28] = (h >> 8) & 0xff;
    buf[29] = (h >> 16) & 0xff;
    expect(readWebpSize(buf)).toEqual({ width: 1536, height: 2080 });
  });

  it('returns null for garbage', () => {
    expect(readWebpSize(new Uint8Array(10))).toBeNull();
    expect(readWebpSize(new TextEncoder().encode('not a webp file at all........'))).toBeNull();
  });
});
