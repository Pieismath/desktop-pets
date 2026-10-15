import { describe, expect, it } from 'vitest';
import {
  planFromResponse,
  planWithAi,
  renderDrawing,
  resolveApiKey,
  PET_SCHEMA,
  type AiRequest,
} from './ai.js';
import { composeSheetFromCanvas } from './pixelpet.js';
import { assertSheetGeometry } from './sheet.js';
import {
  BUILDS,
  EAR_KINDS,
  HAT_KINDS,
  OUTFIT_KINDS,
  traitsFromPrompt,
} from './traits.js';

/** No test here talks to the network; the transport is always supplied. */
const stub = (answer: unknown) => async (_req: AiRequest) => answer;

describe('the key is the caller’s own', () => {
  it('prefers the flag, falls back to the environment, and never invents one', () => {
    expect(resolveApiKey('sk-flag', { ANTHROPIC_API_KEY: 'sk-env' })).toBe('sk-flag');
    expect(resolveApiKey(undefined, { ANTHROPIC_API_KEY: 'sk-env' })).toBe('sk-env');
    expect(resolveApiKey('  ', { ANTHROPIC_API_KEY: '  ' })).toBeUndefined();
    expect(resolveApiKey(undefined, {})).toBeUndefined();
  });
});

describe('the schema only offers parts that exist', () => {
  it('is built from the drawing vocabulary itself', () => {
    const parts = PET_SCHEMA.properties.parts.properties;
    expect(parts.build.enum).toEqual([...BUILDS]);
    expect(parts.ears.enum).toEqual([...EAR_KINDS]);
    expect(parts.hat.enum).toEqual([...HAT_KINDS]);
    expect(parts.outfit.enum).toEqual([...OUTFIT_KINDS]);
  });
});

describe('parts mode', () => {
  it('takes the model’s choices', async () => {
    const plan = await planWithAi('a sea captain', {
      apiKey: 'sk-test',
      send: stub({
        mode: 'parts',
        name: 'Sea Captain',
        reasoning: 'A weathered sailor.',
        parts: {
          build: 'humanoid',
          species: 'sea captain',
          hair: 'long',
          facialHair: 'beard',
          outfit: 'suit',
          hat: 'cap',
          held: 'staff',
          skin: '#d8a878',
          hairColour: '#e8e4dc',
          clothing: '#22405e',
        },
      }),
    });
    expect(plan.mode).toBe('parts');
    expect(plan.traits).toMatchObject({
      build: 'humanoid',
      hair: 'long',
      facialHair: 'beard',
      hat: 'cap',
      held: 'staff',
      species: 'sea captain',
    });
    expect(plan.traits?.colour).toEqual([216, 168, 120, 255]);
    expect(plan.traits?.clothing).toEqual([34, 64, 94, 255]);
  });

  it('falls back to the offline reading rather than breaking on a bad answer', async () => {
    const offline = traitsFromPrompt('a wizard').traits;
    const plan = await planWithAi('a wizard', {
      apiKey: 'sk-test',
      // every field wrong in a different way
      send: stub({
        mode: 'parts',
        parts: { build: 'octopus', ears: 42, hat: null, skin: 'not-a-colour', glasses: 'yes' },
      }),
    });
    expect(plan.traits).toMatchObject({
      build: offline.build,
      ears: offline.ears,
      hat: offline.hat,
      glasses: offline.glasses,
    });
    expect(plan.traits?.colour).toEqual(offline.colour);
  });

  it('survives a response that is not an object at all', () => {
    for (const junk of [null, undefined, 'nope', 7, []]) {
      const plan = planFromResponse(junk, 'a cat');
      expect(plan.traits?.species).toBe('cat');
    }
  });
});

describe('draw mode', () => {
  const teapot = {
    mode: 'draw',
    name: 'Teapot',
    reasoning: 'Not a creature, so drawn directly.',
    draw: {
      palette: { body: '#d8683c', trim: '#f2e4d0', line: '#5a2a12' },
      ops: [
        { op: 'ellipse', cx: 24, cy: 32, rx: 12, ry: 9, c: 'body' },
        { op: 'rect', x: 20, y: 18, w: 8, h: 6, c: 'body' },
        { op: 'round', x: 18, y: 14, w: 12, h: 5, c: 'trim' },
        { op: 'px', x: 24, y: 12, c: 'trim' },
        { op: 'outline', c: 'line' },
      ],
    },
  };

  it('accepts a drawing program and paints it', async () => {
    const plan = await planWithAi('a teapot', { apiKey: 'sk-test', send: stub(teapot) });
    expect(plan.mode).toBe('draw');
    expect(plan.drawing?.ops).toHaveLength(5);
    const canvas = renderDrawing(plan.drawing!);
    let painted = 0;
    for (let y = 0; y < canvas.h; y++) for (let x = 0; x < canvas.w; x++) if (canvas.get(x, y)) painted++;
    expect(painted).toBeGreaterThan(100);
  });

  it('animates an arbitrary drawing into a conformant sheet', async () => {
    const plan = await planWithAi('a teapot', { apiKey: 'sk-test', send: stub(teapot) });
    const sheet = await composeSheetFromCanvas(renderDrawing(plan.drawing!));
    await expect(assertSheetGeometry(sheet)).resolves.not.toThrow();
  }, 45000);

  it('drops ops it cannot execute instead of trusting them', () => {
    const plan = planFromResponse(
      {
        mode: 'draw',
        draw: {
          palette: { body: '#ffffff', bad: 'rgb(1,2,3)' },
          ops: [
            { op: 'rect', x: 4, y: 4, w: 8, h: 8, c: 'body' },
            { op: 'rect', x: 4, y: 4, w: 8, h: 8, c: 'missing' }, // unknown colour
            { op: 'rect', x: 9999, y: 4, w: 8, h: 8, c: 'body' }, // off the grid
            { op: 'evict', x: 1, y: 1, c: 'body' }, // not an op
            { op: 'ellipse', cx: 24, cy: 24, rx: 0, ry: 4, c: 'body' }, // zero radius
          ],
        },
      },
      'a teapot',
    );
    expect(plan.drawing?.ops).toHaveLength(1);
    expect(Object.keys(plan.drawing!.palette)).toEqual(['body']); // bad hex dropped
  });

  it('caps how much it will draw', () => {
    const ops = Array.from({ length: 5000 }, () => ({ op: 'px', x: 1, y: 1, c: 'a' }));
    const plan = planFromResponse({ mode: 'draw', draw: { palette: { a: '#fff' }, ops } }, 'x');
    expect(plan.drawing!.ops.length).toBeLessThanOrEqual(600);
  });

  it('falls back to parts when the drawing is unusable', () => {
    const plan = planFromResponse({ mode: 'draw', draw: { palette: {}, ops: [] } }, 'a cat');
    expect(plan.mode).toBe('parts');
    expect(plan.traits?.species).toBe('cat');
  });
});
