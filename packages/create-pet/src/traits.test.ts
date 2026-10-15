import { describe, expect, it } from 'vitest';
import { buildCharacter } from './char-generated.js';
import { resolvePalette } from './pixel.js';
import { renderPixelFramePng } from './pixelpet.js';
import {
  hashString,
  idFromPrompt,
  KNOWN_SPECIES,
  KNOWN_WORDS,
  nameFromPrompt,
  paletteFromTraits,
  traitsFromPrompt,
  unusedWords,
} from './traits.js';

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

  it('says when it invented the animal instead of reading it', () => {
    // the whole complaint this guards against: a prompt it cannot read used to
    // come back as a confident random animal with nothing to say so
    expect(traitsFromPrompt('zzzz qqqq').invented).toContain('species');
    expect(traitsFromPrompt('a blue cat').invented).toHaveLength(0);
    // a recognised animal wearing its natural coat is not an invention
    expect(traitsFromPrompt('a penguin').invented).toHaveLength(0);
  });

  it('understands the words people actually type, not just the canonical ones', () => {
    expect(traitsFromPrompt('a tiger').traits).toMatchObject({ ears: 'pointed', whiskers: true });
    expect(traitsFromPrompt('a corgi').traits).toMatchObject({ ears: 'floppy', tail: 'curled' });
    expect(traitsFromPrompt('a golden retriever').traits).toMatchObject({ ears: 'floppy', colourName: 'gold' });
    expect(traitsFromPrompt('shiba inu').invented).toHaveLength(0);
    expect(traitsFromPrompt('a t-rex').traits).toMatchObject({ gait: 'biped', tail: 'long' });
    expect(traitsFromPrompt('a guinea pig').traits.species).toBe('guinea pig'); // beats "pig"
  });

  it('prefers the specific animal over a vague one', () => {
    expect(traitsFromPrompt('a pet dragon').traits.species).toBe('dragon');
    expect(traitsFromPrompt('a friendly creature').traits.species).toBe('creature');
  });

  it('dresses a recognised animal in its own colour when none is asked for', () => {
    expect(traitsFromPrompt('a penguin').traits.colourName).toBe('charcoal');
    expect(traitsFromPrompt('a frog').traits.colourName).toBe('green');
    expect(traitsFromPrompt('a pig').traits.colourName).toBe('pink');
    // an explicit colour still wins
    expect(traitsFromPrompt('a pink penguin').traits.colourName).toBe('pink');
  });

  it('marks the animals that have markings', () => {
    expect(traitsFromPrompt('a tiger').traits.pattern).toBe('stripes');
    expect(traitsFromPrompt('a panda').traits.pattern).toBe('patch');
    expect(traitsFromPrompt('a leopard').traits.pattern).toBe('spots');
    expect(traitsFromPrompt('a cat').traits.pattern).toBe('none');
    expect(traitsFromPrompt('a striped cat').traits.pattern).toBe('stripes');
    expect(traitsFromPrompt('a spotted dog').traits.pattern).toBe('spots');
    expect(traitsFromPrompt('a plain tiger').traits.pattern).toBe('none');
  });

  it('reads a colour through its everyday endings', () => {
    expect(traitsFromPrompt('a golden cat').traits.colourName).toBe('gold');
    expect(traitsFromPrompt('a greenish frog').traits.colourName).toBe('green');
    expect(traitsFromPrompt('a silvery robot').traits.colourName).toBe('silver');
  });

  it('does not let a description of the ears stretch the whole animal', () => {
    expect(traitsFromPrompt('a cat with tall ears').traits.body).not.toBe('tall');
    expect(traitsFromPrompt('a tall cat').traits.body).toBe('tall');
  });

  it('builds a person, not an animal with the ears filed off', () => {
    const { traits, invented } = traitsFromPrompt('an asian man');
    expect(traits.build).toBe('humanoid');
    expect(traits.colourName).toBe('light');
    expect(traits.hairColour).toEqual([44, 42, 50, 255]); // black hair
    expect(invented).toEqual([]);
  });

  it('reads a role as the costume that makes it one', () => {
    expect(traitsFromPrompt('a wizard').traits).toMatchObject({
      build: 'humanoid',
      hat: 'wizard',
      outfit: 'robe',
      held: 'staff',
      facialHair: 'beard',
    });
    expect(traitsFromPrompt('a chef').traits).toMatchObject({ hat: 'chef', outfit: 'apron' });
    expect(traitsFromPrompt('a knight').traits).toMatchObject({ hat: 'helmet', outfit: 'armour', held: 'sword' });
  });

  it('lets parts be asked for directly, on top of any role', () => {
    expect(traitsFromPrompt('a wizard with a red hat').traits.hat).toBe('cap');
    expect(traitsFromPrompt('a man with long hair and glasses').traits).toMatchObject({
      hair: 'long',
      glasses: true,
    });
    expect(traitsFromPrompt('a woman with a bun holding a book').traits).toMatchObject({
      hair: 'bun',
      held: 'book',
    });
  });

  it('puts worn things on animals too', () => {
    const { traits } = traitsFromPrompt('a cat with a wizard hat');
    expect(traits.build).toBe('beast');
    expect(traits.species).toBe('cat');
    expect(traits.hat).toBe('wizard');
  });

  it('sends a colour to the thing it was said about', () => {
    // a person in red is dressed in red, not painted red
    expect(traitsFromPrompt('a man in a red shirt').traits.clothing).toEqual([222, 74, 62, 255]);
    expect(traitsFromPrompt('a man in a red shirt').traits.colourName).toBe('light');
    // but a skin-tone word describes the person
    expect(traitsFromPrompt('a tan man').traits.colourName).toBe('tan');
    expect(traitsFromPrompt('a person with dark skin').traits.colourName).toBe('dark');
    expect(traitsFromPrompt('a woman with red hair').traits.hairColour).toEqual([176, 74, 52, 255]);
    // an animal is still painted all over
    expect(traitsFromPrompt('a red dragon').traits.colourName).toBe('red');
  });

  it('keeps a shade word attached to the colour it shades', () => {
    expect(traitsFromPrompt('a dark green frog').traits.colourName).toBe('dark green');
    expect(traitsFromPrompt('a light blue cat').traits.colourName).toBe('light blue');
  });

  it('reads an occupation as a person from the shape of the word', () => {
    // none of these are in any table, and there is no end to words like them
    for (const job of [
      'a basketball player',
      'a taxi driver',
      'a shopkeeper',
      'an electrician',
      'a youtuber',
      'a journalist',
      'a blacksmith',
      'a goalkeeper',
      'a swimmer',
      'a mountaineer',
    ]) {
      const { traits, invented, assumed } = traitsFromPrompt(job);
      expect(traits.build, job).toBe('humanoid');
      // a good guess is not an invention — but it is still worth admitting to
      expect(invented, job).not.toContain('species');
      expect(assumed.length, job).toBeGreaterThan(0);
    }
  });

  it('does not turn every word ending in -er into a person', () => {
    for (const notAJob of ['a flower', 'a computer', 'a lobster', 'a spider']) {
      const { invented, assumed } = traitsFromPrompt(notAJob);
      // the honest answer for a thing we cannot draw is to admit it, not to
      // confidently hand back a person
      expect(assumed, notAJob).toHaveLength(0);
      expect(invented, notAJob).toContain('species');
    }
    // and known words still win outright, never reaching the shape rule
    expect(traitsFromPrompt('a tiger').traits.species).toBe('tiger');
    expect(traitsFromPrompt('an otter').traits.build).toBe('beast');
    expect(traitsFromPrompt('a silver cat').traits.species).toBe('cat');
  });

  it('does not call a word ignored when that word did the work', () => {
    // "player" is what made this a person, so it cannot also be dead weight
    expect(unusedWords('a basketball player')).not.toContain('player');
    expect(unusedWords('a taxi driver')).not.toContain('driver');
    expect(unusedWords('a taxi driver')).toContain('taxi'); // this one really is
  });

  it('gives an activity its prop', () => {
    expect(traitsFromPrompt('a basketball player').traits.held).toBe('ball');
    expect(traitsFromPrompt('a footballer').traits.held).toBe('ball');
    expect(traitsFromPrompt('a guitarist').traits.held).toBe('guitar');
    expect(traitsFromPrompt('a programmer').traits.held).toBe('laptop');
  });

  it('draws every word it claims to know', () => {
    // a mistyped coat or alias would otherwise surface as a broken pet
    for (const word of KNOWN_WORDS) {
      const { traits, invented } = traitsFromPrompt(`a ${word}`);
      expect(invented, word).not.toContain('species');
      expect(traits.colour, word).toHaveLength(4);
      for (const [k, v] of Object.entries(paletteFromTraits(traits))) {
        expect(Array.isArray(v), `${word} → ${k}`).toBe(true);
      }
    }
    expect(KNOWN_SPECIES).toContain('cat');
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
    expect(nameFromPrompt('a purple dragon with horns')).toBe('Purple Dragon Horns');
    expect(nameFromPrompt('')).toBe('My Pet');
  });

  it('hashes stably', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

describe('generated characters render', () => {
  it.each(['an asian man', 'a wizard', 'a chef', 'a black woman with an afro', 'a cat in a top hat'])(
    'draws every state for the person "%s"',
    async (prompt) => {
      const { traits } = traitsFromPrompt(prompt);
      const ch = buildCharacter('test', traits);
      for (const state of ['idle', 'running-right', 'failed', 'alarm', 'waving'] as const) {
        const png = await renderPixelFramePng(ch, state, 0);
        expect(png.subarray(1, 4).toString()).toBe('PNG');
      }
    },
    45000,
  );

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
