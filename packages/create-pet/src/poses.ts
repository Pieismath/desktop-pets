/**
 * The state machine every pixel pet shares: given a sprite state and frame
 * index, what pose, palette and overlay decoration to draw. Character-
 * agnostic on purpose — a new character only supplies drawing, never
 * animation timing, so all pets behave identically.
 */
import type { SpriteStateName } from '@desktop-pets/shared';
import {
  drawCloud,
  drawDots,
  drawGear,
  drawMagnifier,
  drawSparkle,
  drawWarning,
  type PaletteKind,
  type PixelCanvas,
  type Pose,
} from './pixel.js';

export interface PixelFrame {
  pose: Pose;
  palette: PaletteKind;
  overlay?: (c: PixelCanvas) => void;
  /** Mirror after drawing (running-left is running-right flipped). */
  mirror?: boolean;
  /** Use the character's side profile rather than its front view. */
  side?: boolean;
}

const walkCycle: Array<Pose['legs']> = [1, 2, 3, 4, 1, 2, 3, 4];

export function frameFor(state: SpriteStateName, i: number): PixelFrame {
  switch (state) {
    case 'idle': {
      const bob = [0, 0, -1, -1, 0, 0][i] ?? 0;
      return {
        palette: 'normal',
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
      const f: PixelFrame = {
        side: true,
        palette: 'normal',
        pose: {
          dy: bob,
          legs: walkCycle[i] ?? 0,
          eyes: 'open',
          ears: bob - 1,
          tail: i % 2 === 0 ? 1 : 0,
        },
      };
      if (state === 'running-left') f.mirror = true;
      return f;
    }

    case 'waving': {
      const lift = [0, -5, -7, -5][i] ?? 0;
      return {
        palette: 'normal',
        pose: { armR: lift, eyes: 'happy', mouth: 'open', ears: -1, tail: 1 },
      };
    }

    case 'jumping': {
      const dy = [1, -5, -9, -4, 1][i] ?? 0;
      const squash = [2, -1, -2, -1, 2][i] ?? 0;
      const peak = i === 2;
      const f: PixelFrame = {
        palette: 'normal',
        pose: {
          dy,
          squash,
          legs: peak ? 2 : 0,
          armL: dy < 0 ? -5 : 0,
          armR: dy < 0 ? -5 : 0,
          eyes: peak ? 'happy' : 'open',
          mouth: 'open',
          ears: dy < 0 ? -2 : 1,
        },
      };
      if (peak) {
        f.overlay = (c) => {
          drawSparkle(c, 10, 12);
          drawSparkle(c, 38, 8);
          drawSparkle(c, 24, 4);
        };
      }
      return f;
    }

    case 'failed': {
      const sink = Math.min(i, 5);
      return {
        palette: 'grey',
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
        overlay: (c) => drawCloud(c, 16, 1, i >= 3),
      };
    }

    case 'waiting': {
      const tap = i % 2 === 0;
      return {
        palette: 'normal',
        pose: {
          legs: tap ? 0 : 1,
          eyes: 'look',
          mouth: 'flat',
          ears: tap ? 0 : -1,
          tail: tap ? 0 : 1,
        },
        overlay: (c) => drawDots(c, 18, 5, Math.floor(i / 2) % 3),
      };
    }

    case 'working': {
      const bob = i % 2 === 0 ? 0 : -1;
      return {
        palette: 'normal',
        pose: {
          dy: bob,
          armL: i % 2 === 0 ? -1 : 2,
          armR: i % 2 === 0 ? 2 : -1,
          eyes: 'open',
          mouth: 'flat',
          ears: bob,
          tail: i % 3 === 0 ? 1 : 0,
        },
        overlay: (c) => drawGear(c, 36, 4, i),
      };
    }

    case 'review': {
      const x = [30, 32, 34, 34, 32, 30][i] ?? 30;
      return {
        palette: 'normal',
        pose: { eyes: 'wide', mouth: 'oh', ears: -1, armR: -3, tail: 0 },
        overlay: (c) => drawMagnifier(c, x, 14),
      };
    }

    case 'alarm': {
      const shake = [0, -1, 1, -1, 1, 0][i] ?? 0;
      const bright = i % 2 === 0;
      return {
        palette: bright ? 'alarmA' : 'alarmB',
        pose: {
          dx: shake,
          armL: -6,
          armR: -6,
          eyes: 'wide',
          mouth: 'oh',
          ears: -2,
          tail: 1,
        },
        overlay: (c) => drawWarning(c, 19, 0, bright),
      };
    }
  }
}
