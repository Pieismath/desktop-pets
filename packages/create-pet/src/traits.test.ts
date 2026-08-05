import { describe, expect, it } from 'vitest';
import { buildCharacter } from './char-generated.js';
import { resolvePalette } from './pixel.js';
import { renderPixelFramePng } from './pixelpet.js';
import { hashString, idFromPrompt, nameFromPrompt, paletteFromTraits, traitsFromPrompt } from './traits.js';

describe('traitsFromPrompt', () => {
  it('recognises species', () => {
    expect(traitsFromPrompt('a cat').traits.species).toBe('cat');
    expect(traitsFromPrompt('a friendly DOG').traits.species).toBe('dog');
    expect(traitsFromPrompt('two penguins').traits.species).toBe('penguin');
  });

  it('gives each species its defining features', () => {
    expect(traitsFromPrompt('a cat').traits).toMatchObject({ ears: 'pointed', tail: 'long', whiskers: true });
    expect(traitsFromPrompt('a dog').traits).toMatchObject({ ears: 'floppy', tail: 'curled' });
    expect(traitsFromPrompt('a bunny').traits).toMatchObject({ ears: 'tall', tail: 'puff' });
    expect(traitsFromPrompt('a robot').traits).toMatchObject({ ears: 'antenna', eyes: 'screen', gait: 'biped' });
    expect(traitsFromPrompt('a dragon').traits).toMatchObject({ ears: 'horns', eyes: 'slit' });
  });

  it('recognises colour', () => {
    expect(traitsFromPrompt('a purple dragon').traits.colourName).toBe('purple');
    expect(traitsFromPrompt('a GREY wolf').traits.colourName).toBe('grey');
  });

  it('lets explicit features override the species default', () => {
    expect(traitsFromPrompt('a cat with floppy ears').traits.ears).toBe('floppy');
    expect(traitsFromPrompt('a dog with a long tail').traits.tail).toBe('long');
    expect(traitsFromPrompt('a cat with no tail').traits.tail).toBe('none');
    expect(traitsFromPrompt('a wolf with green eyes').traits.accent).toEqual([104, 190, 106, 255]);
  });

  it('is deterministic — the same prompt always gives the same pet', () => {
    const a = traitsFromPrompt('something entirely unrecognisable');
    const b = traitsFromPrompt('something entirely unrecognisable');
    expect(a.traits).toEqual(b.traits);
  });

  it('still produces a usable pet from an unrecognised prompt', () => {
    const { traits, matched } = traitsFromPrompt('zzzz qqqq');
    expect(matched).toHaveLength(0);
    expect(traits.colour).toHaveLength(4);
    expect(Object.values(paletteFromTraits(traits)).every((v) => Array.isArray(v))).toBe(true);
  });

  it('never yields an incomplete palette, whatever the prompt', () => {
    // regression: a signed shift of a large hash used to index off the end of
    // the colour list and silently produce `undefined`
    const species = ['cat', 'dog', 'fox', 'robot', 'dragon', 'bunny', 'frog', 'penguin', 'bear', 'ghost'];
    const colours = ['red', 'blue', 'green', 'purple', 'pink', 'white', 'black', 'gold', 'teal', ''];
    for (const s of species) {
      for (const c of colours) {
        for (const extra of ['', ' with horns', ' with a long tail', ' tall']) {
          const { traits } = traitsFromPrompt(`a ${c} ${s}${extra}`);
          const pal = paletteFromTraits(traits);
          for (const [k, v] of Object.entries(pal)) {
            expect(Array.isArray(v), `${c} ${s}${extra} → ${k}`).toBe(true);
          }
          // the derived failed/alarm palettes must survive too
          for (const kind of ['grey', 'alarmA', 'alarmB'] as const) {
            expect(resolvePalette(pal, kind).main).toHaveLength(4);
          }
        }
      }
    }
  });
});

describe('naming helpers', () => {
  it('derives a valid kebab-case id', () => {
    expect(idFromPrompt('a purple dragon with horns')).toBe('purple-dragon-horns'); // stopwords dropped
    expect(idFromPrompt('Cat!')).toBe('cat');
    expect(idFromPrompt('a')).toMatch(/^pet-[a-z0-9]+$/);
    expect(idFromPrompt('  ')).toMatch(/^pet-[a-z0-9]+$/);
  });

  it('derives a readable display name', () => {
    expect(nameFromPrompt('a purple dragon')).toBe('Purple Dragon');
    expect(nameFromPrompt('')).toBe('My Pet');
  });

  it('hashes stably', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

describe('generated characters render', () => {
  it.each(['a purple dragon', 'a fluffy white bunny', 'a blue penguin', 'a green frog', 'a robot'])(
    'draws every state for "%s"',
    async (prompt) => {
      const { traits } = traitsFromPrompt(prompt);
      const ch = buildCharacter('test', traits);
      // failed/alarm exercise the derived palettes, which is where a missing
      // colour would blow up
      for (const state of ['idle', 'running-right', 'failed', 'alarm'] as const) {
        const png = await renderPixelFramePng(ch, state, 0);
        expect(png.subarray(1, 4).toString()).toBe('PNG');
      }
    },
    45000,
  );
});
