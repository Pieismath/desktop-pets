import { describe, expect, it } from 'vitest';
import { conceptCount, findConcept, KNOWN_CONCEPTS, CONCEPTS } from './pictograph.js';
import { drawPictograph, twemojiFile, TWEMOJI_ATTRIBUTION } from './from-pictograph.js';
import { composeSheetFromCanvas } from './pixelpet.js';
import { assertSheetGeometry } from './sheet.js';
import { traitsFromPrompt } from './traits.js';

describe('finding a concept', () => {
  it('matches the things the parts engine cannot draw', () => {
    expect(findConcept('a pizza')?.glyph).toBe('🍕');
    expect(findConcept('a lobster')?.glyph).toBe('🦞');
    expect(findConcept('a flower')?.glyph).toBe('🌸');
    expect(findConcept('a red car')?.glyph).toBe('🚗');
  });

  it('handles plurals and multi-word concepts', () => {
    // reports the word as typed, having resolved the plural to look it up
    expect(findConcept('some cookies')).toMatchObject({ term: 'cookies', glyph: '🍪' });
    // a longer phrase wins outright, so this is a hot dog and not a dog
    expect(findConcept('a hot dog')?.term).toBe('hot dog');
    expect(findConcept('an ice cream')?.term).toBe('ice cream');
    expect(findConcept('a police car')?.glyph).toBe('🚓');
  });

  it('reads the head of a noun phrase, not the adjective', () => {
    // "red" is a concept in its own right; a red car is still a car
    expect(findConcept('a red car')?.term).toBe('car');
    expect(findConcept('a chocolate cake')?.term).toBe('cake');
  });

  it('covers the long tail from CLDR, not just the curated words', () => {
    const { curated, total } = conceptCount();
    expect(curated).toBeGreaterThan(300);
    // thousands of words nobody would sit down and enumerate
    expect(total).toBeGreaterThan(4000);
    for (const word of ['stethoscope', 'roller coaster', 'crystal ball', 'hedgehog', 'accordion']) {
      expect(findConcept(`a ${word}`), word).toBeDefined();
    }
  });

  it('lets the curated word win where the two layers disagree', () => {
    // CLDR lists "car" under the taxi too, and offers no way to tell which a
    // bare "car" means; the curated table is what encodes that
    expect(findConcept('a car')?.glyph).toBe(CONCEPTS['car']);
    expect(findConcept('a flower')?.glyph).toBe(CONCEPTS['flower']);
    expect(findConcept('a moon')?.glyph).toBe(CONCEPTS['moon']);
  });

  it('finds nothing when there is nothing to find', () => {
    expect(findConcept('zzzz qqqq')).toBeUndefined();
    expect(findConcept('')).toBeUndefined();
  });

  it('every concept is a real glyph, not an empty string', () => {
    for (const [word, glyph] of Object.entries(CONCEPTS)) {
      expect(glyph.length, word).toBeGreaterThan(0);
      expect(findConcept(`a ${word}`), word).toBeDefined();
    }
    expect(KNOWN_CONCEPTS.length).toBeGreaterThan(300);
  });

  it('lets a pictured thing beat a guess from word shape', () => {
    // "roller" ends like an occupation, but a roller coaster is a thing we
    // have an actual picture of, and knowledge should beat a hunch
    const coaster = traitsFromPrompt('a roller coaster');
    expect(coaster.assumed).toHaveLength(0);
    expect(findConcept('a roller coaster')?.term).toBe('roller coaster');
    // but a bare word that merely happens to be some emoji's keyword must not
    // stop an occupation being read as a person
    expect(traitsFromPrompt('a basketball player').traits.build).toBe('humanoid');
    expect(traitsFromPrompt('a taxi driver').traits.build).toBe('humanoid');
  });

  it('leaves the creature vocabulary alone', () => {
    // a cat is drawn from parts and animates properly; it must not be
    // downgraded to a picture just because a picture exists
    for (const creature of ['a cat', 'a wizard', 'a tiger', 'a basketball player']) {
      expect(traitsFromPrompt(creature).invented, creature).not.toContain('species');
    }
  });
});

describe('provenance', () => {
  it('draws from the artwork we ship, and can name its licence', async () => {
    const art = await drawPictograph('🍕');
    expect(art).toBeDefined();
    // this is the whole point of bundling: a licence we can actually state
    expect(art!.source).toBe('twemoji');
    expect(art!.licence).toBe('CC-BY-4.0');
    expect(art!.attribution).toBe(TWEMOJI_ATTRIBUTION);
  }, 30000);

  it('maps a glyph to its Twemoji file, variation selectors and all', () => {
    expect(twemojiFile('🍕')).toBe('1f355.svg');
    expect(twemojiFile('🦞')).toBe('1f99e.svg');
    // U+FE0F is dropped, so both presentations resolve to one file
    expect(twemojiFile('☂️')).toBe('2602.svg');
    expect(twemojiFile('☂')).toBe('2602.svg');
    // sequences join with hyphens
    expect(twemojiFile('🏳️‍🌈')).toBe('1f3f3-200d-1f308.svg');
  });

  it('claims nothing about the licence when it falls back to a font', async () => {
    // asking for a specific family takes the font path, whose artwork we
    // cannot identify — the renderer substitutes per character, invisibly
    const art = await drawPictograph('🍕', 'Courier');
    if (!art) return;
    expect(art.source).toBe('font');
    expect(art.licence).toBeUndefined();
    expect(art.attribution).toBeUndefined();
  }, 30000);
});

describe('drawing a pictograph', () => {
  it('either draws it or declines, but never throws', async () => {
    const art = await drawPictograph('🍕');
    if (!art) return; // no emoji font on this machine; declining is correct
    let painted = 0;
    for (let y = 0; y < art.canvas.h; y++) {
      for (let x = 0; x < art.canvas.w; x++) if (art.canvas.get(x, y)) painted++;
    }
    expect(painted).toBeGreaterThan(40);
  }, 30000);

  it('declines a glyph no font can draw rather than shipping a box', async () => {
    // U+10FFFF is unassigned: any font renders "tofu", one flat colour
    expect(await drawPictograph('\u{10FFFF}')).toBeUndefined();
  }, 30000);

  it('animates a picture into a conformant sheet', async () => {
    const art = await drawPictograph('🦞');
    if (!art) return;
    const sheet = await composeSheetFromCanvas(art.canvas);
    await expect(assertSheetGeometry(sheet)).resolves.not.toThrow();
  }, 45000);
});
