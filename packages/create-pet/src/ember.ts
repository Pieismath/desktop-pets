/**
 * "Ember" — the pixel-art default pet. Original art, drawn entirely in code
 * on a 48x52 logical grid and upscaled 4x into the locked 192x208 frame.
 * No reference images, no third-party IP. CC0.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SPRITE_STATES, validatePetManifest } from '@desktop-pets/shared';
import type { PetManifest, SpriteStateName } from '@desktop-pets/shared';
import {
  PAL_ALARM_A,
  PAL_ALARM_B,
  PAL_GREY,
  PAL_NORMAL,
  PixelCanvas,
  drawCloud,
  drawDots,
  drawEmber,
  drawEmberSide,
  drawGear,
  drawMagnifier,
  drawSparkle,
  drawWarning,
  type Palette,
  type Pose,
} from './pixel.js';
import { composeSheetWebp, type FrameCell } from './sheet.js';

export const EMBER_MANIFEST: PetManifest = {
  id: 'ember',
  displayName: 'Ember',
  description: 'A small pixel critter who sits on your Dock and watches what your agents are about to run.',
  spritesheet: 'spritesheet.webp',
  license: 'CC0-1.0',
  author: 'Desktop Pets contributors',
  generator: 'procedural pixel art, @desktop-pets/create-pet (drawn in code by Claude, Anthropic)',
};

interface Frame {
  pose: Pose;
  pal: Palette;
  overlay?: (c: PixelCanvas) => void;
  mirror?: boolean;
  /** Walk cycles use the side profile so travel reads properly. */
  side?: boolean;
}

const walkCycle: Array<Pose['legs']> = [1, 2, 3, 4, 1, 2, 3, 4];

function frameFor(state: SpriteStateName, i: number, _frames: number): Frame {
  switch (state) {
    case 'idle': {
      // slow breathing, one blink, lazy tail
      const bob = [0, 0, -1, -1, 0, 0][i] ?? 0;
      return {
        pal: PAL_NORMAL,
        pose: {
          dy: bob,
          eyes: i === 4 ? 'blink' : 'open',
          mouth: 'smile',
          tail: [0, 1, 1, 0, -1, -1][i] ?? 0,
          ears: bob,
        },
      };
    }

    case 'running-right':
    case 'running-left': {
      const bob = i % 2 === 0 ? 0 : -1;
      const f: Frame = {
        side: true,
        pal: PAL_NORMAL,
        pose: {
          dy: bob,
          legs: walkCycle[i] ?? 0,
          eyes: 'open',
          ears: bob - 1,
          tail: i % 2 === 0 ? 1 : 0,
          shadow: 0.85,
        },
      };
      if (state === 'running-left') f.mirror = true;
      return f;
    }

    case 'waving': {
      const lift = [0, -5, -7, -5][i] ?? 0;
      return {
        pal: PAL_NORMAL,
        pose: { armR: lift, eyes: 'happy', mouth: 'open', ears: -1, tail: 1 },
      };
    }

    case 'jumping': {
      const dy = [1, -5, -9, -4, 1][i] ?? 0;
      const squash = [2, -1, -2, -1, 2][i] ?? 0;
      const peak = i === 2;
      return {
        pal: PAL_NORMAL,
        pose: {
          dy,
          squash,
          legs: peak ? 2 : 0,
          armL: dy < 0 ? -5 : 0,
          armR: dy < 0 ? -5 : 0,
          eyes: peak ? 'happy' : 'open',
          mouth: 'open',
          ears: dy < 0 ? -2 : 1,
          shadow: 1 + dy / 12,
        },
        ...(peak
          ? {
              overlay: (c: PixelCanvas) => {
                drawSparkle(c, 10, 12);
                drawSparkle(c, 38, 8);
                drawSparkle(c, 24, 4);
              },
            }
          : {}),
      };
    }

    case 'failed': {
      const sink = Math.min(i, 5);
      return {
        pal: PAL_GREY,
        pose: {
          dy: Math.round(sink * 0.6),
          squash: Math.round(sink * 0.4),
          eyes: 'x',
          mouth: 'frown',
          ears: 3 + Math.round(sink * 0.4),
          tail: -1,
          armL: 1,
          armR: 1,
        },
        overlay: (c: PixelCanvas) => drawCloud(c, 16, 1, i >= 3),
      };
    }

    case 'waiting': {
      const tap = i % 2 === 0;
      return {
        pal: PAL_NORMAL,
        pose: {
          dy: 0,
          legs: tap ? 0 : 1,
          eyes: 'look',
          mouth: 'flat',
          ears: tap ? 0 : -1,
          tail: tap ? 0 : 1,
        },
        overlay: (c: PixelCanvas) => drawDots(c, 18, 5, Math.floor(i / 2) % 3),
      };
    }

    case 'working': {
      const bob = i % 2 === 0 ? 0 : -1;
      return {
        pal: PAL_NORMAL,
        pose: {
          dy: bob,
          armL: i % 2 === 0 ? -1 : 2,
          armR: i % 2 === 0 ? 2 : -1,
          eyes: 'open',
          mouth: 'flat',
          ears: bob,
          tail: i % 3 === 0 ? 1 : 0,
        },
        overlay: (c: PixelCanvas) => drawGear(c, 36, 4, i),
      };
    }

    case 'review': {
      const x = [30, 32, 34, 34, 32, 30][i] ?? 30;
      return {
        pal: PAL_NORMAL,
        pose: { eyes: 'wide', mouth: 'oh', ears: -1, armR: -3, tail: 0 },
        overlay: (c: PixelCanvas) => drawMagnifier(c, x, 14),
      };
    }

    case 'alarm': {
      const shake = [0, -1, 1, -1, 1, 0][i] ?? 0;
      const bright = i % 2 === 0;
      return {
        pal: bright ? PAL_ALARM_A : PAL_ALARM_B,
        pose: {
          dx: shake,
          armL: -6,
          armR: -6,
          eyes: 'wide',
          mouth: 'oh',
          ears: -2,
          tail: 1,
        },
        overlay: (c: PixelCanvas) => drawWarning(c, 19, 0, bright),
      };
    }
  }
}

/** Render one 192x208 PNG frame of Ember. */
export async function renderEmberFramePng(
  state: SpriteStateName,
  i: number,
  frames: number,
): Promise<Buffer> {
  const f = frameFor(state, i, frames);
  let c = new PixelCanvas();
  if (f.side) drawEmberSide(c, f.pose, f.pal);
  else drawEmber(c, f.pose, f.pal);
  if (f.mirror) c = c.mirrored();
  // overlays are drawn in frame space, after any mirroring
  f.overlay?.(c);
  const { data, width, height } = c.toRawRGBA();
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Write a complete, conformant Ember pet into `outDir`. */
export async function generateEmberPet(outDir: string): Promise<{ sheetBytes: number }> {
  const cells: FrameCell[] = [];
  for (const state of SPRITE_STATES) {
    for (let col = 0; col < state.frames; col++) {
      cells.push({ row: state.row, col, input: await renderEmberFramePng(state.name, col, state.frames) });
    }
  }
  const sheet = await composeSheetWebp(cells);

  const validation = validatePetManifest(EMBER_MANIFEST);
  if (!validation.ok) throw new Error(`Ember manifest invalid: ${validation.errors.join('; ')}`);

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'spritesheet.webp'), sheet);
  await writeFile(path.join(outDir, 'pet.json'), JSON.stringify(EMBER_MANIFEST, null, 2) + '\n');
  return { sheetBytes: sheet.byteLength };
}
