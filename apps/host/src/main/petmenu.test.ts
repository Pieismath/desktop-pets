import { describe, expect, it } from 'vitest';
import type { PetManifest } from '@desktop-pets/shared';
import { petMenuEntries, type PetChoice } from './petmenu.js';

const pet = (id: string, displayName: string, license = 'CC0-1.0', author = 'Someone'): PetManifest => ({
  id,
  displayName,
  description: 'd',
  spritesheet: 'spritesheet.webp',
  license,
  author,
});

const choices: PetChoice[] = [
  { pet: pet('zebra', 'Zebra'), bundled: false },
  { pet: pet('ember', 'Ember'), bundled: true },
  { pet: pet('apple', 'Apple'), bundled: false },
  { pet: pet('pip', 'Pip'), bundled: true },
];

describe('petMenuEntries', () => {
  it('lists bundled pets first, then user pets, each alphabetically', () => {
    expect(petMenuEntries(choices, 'ember').map((e) => e.id)).toEqual(['ember', 'pip', 'apple', 'zebra']);
  });

  it('checks exactly the active pet', () => {
    const entries = petMenuEntries(choices, 'apple');
    expect(entries.filter((e) => e.checked).map((e) => e.id)).toEqual(['apple']);
  });

  it('checks nothing when the active id is unknown', () => {
    expect(petMenuEntries(choices, 'ghost-pet').some((e) => e.checked)).toBe(false);
  });

  it('surfaces provenance in the tooltip so the picker shows licence and author', () => {
    const entries = petMenuEntries([{ pet: pet('x', 'Xavier', 'MIT', 'Jason') }], 'x');
    expect(entries[0]!.tooltip).toBe('Xavier · MIT by Jason');
    expect(petMenuEntries([{ pet: pet('e', 'Ember'), bundled: true }], 'e')[0]!.tooltip).toContain('(bundled)');
  });

  it('handles an empty install gracefully', () => {
    expect(petMenuEntries([], undefined)).toEqual([]);
  });
});
