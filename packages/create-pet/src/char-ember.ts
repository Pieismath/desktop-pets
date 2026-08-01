/**
 * "Ember" — a small fox-ish critter, kept as an alternate character.
 * Original pixel art drawn in code. CC0.
 */
import {
  LOGICAL_BASELINE,
  drawShadow,
  type Palette,
  type PixelCanvas,
  type PixelCharacter,
  type Pose,
} from './pixel.js';

const CX = 24;
const FEET_Y = LOGICAL_BASELINE;

export const EMBER_PALETTE: Palette = {
  out: [96, 42, 18, 255],
  dark: [178, 88, 34, 255],
  main: [226, 124, 57, 255],
  light: [246, 166, 95, 255],
  cream: [250, 226, 195, 255],
  eyeWhite: [255, 250, 242, 255],
  eyeDark: [43, 26, 16, 255],
  accent: [255, 215, 94, 255],
};

function drawEyes(c: PixelCanvas, ox: number, headY: number, style: Pose['eyes'], pal: Palette): void {
  const ey = headY + 5;
  const put = (x: number): void => {
    switch (style) {
      case 'blink':
        c.rect(ox + x, ey + 2, 4, 1, pal.out);
        break;
      case 'x':
        c.px(ox + x, ey, pal.out);
        c.px(ox + x + 3, ey, pal.out);
        c.px(ox + x + 1, ey + 1, pal.out);
        c.px(ox + x + 2, ey + 1, pal.out);
        c.px(ox + x + 1, ey + 2, pal.out);
        c.px(ox + x + 2, ey + 2, pal.out);
        c.px(ox + x, ey + 3, pal.out);
        c.px(ox + x + 3, ey + 3, pal.out);
        break;
      case 'happy':
        c.rect(ox + x, ey + 2, 4, 1, pal.out);
        c.px(ox + x, ey + 1, pal.out);
        c.px(ox + x + 3, ey + 1, pal.out);
        break;
      case 'wide':
        c.rect(ox + x, ey - 1, 4, 6, pal.eyeWhite);
        c.rect(ox + x + 1, ey + 1, 3, 3, pal.eyeDark);
        c.px(ox + x + 1, ey + 1, pal.eyeWhite);
        break;
      case 'look':
        c.rect(ox + x, ey, 4, 4, pal.eyeWhite);
        c.rect(ox + x, ey, 2, 3, pal.eyeDark);
        break;
      case 'open':
      default:
        c.rect(ox + x, ey, 4, 4, pal.eyeWhite);
        c.rect(ox + x + 1, ey + 1, 3, 3, pal.eyeDark);
        c.px(ox + x + 1, ey + 1, pal.eyeWhite);
        break;
    }
  };
  put(18);
  put(26);
}

function drawMouth(c: PixelCanvas, ox: number, headY: number, style: Pose['mouth'], pal: Palette): void {
  const my = headY + 11;
  switch (style) {
    case 'open':
      c.rect(ox + 22, my, 4, 3, pal.out);
      break;
    case 'oh':
      c.rect(ox + 23, my, 2, 3, pal.out);
      break;
    case 'flat':
      c.rect(ox + 22, my + 1, 4, 1, pal.out);
      break;
    case 'frown':
      c.rect(ox + 22, my + 1, 4, 1, pal.out);
      c.px(ox + 21, my, pal.out);
      c.px(ox + 26, my, pal.out);
      break;
    case 'smile':
    default:
      c.rect(ox + 22, my, 4, 1, pal.out);
      c.px(ox + 21, my - 1, pal.out);
      c.px(ox + 26, my - 1, pal.out);
      break;
  }
  c.rect(ox + 23, headY + 8, 2, 2, pal.out);
}

function drawEmber(c: PixelCanvas, pose: Pose, pal: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const legs = pose.legs ?? 0;
  const ears = Math.round(pose.ears ?? 0);
  const squash = pose.squash ?? 0;
  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;

  drawShadow(c, CX, dx, pose.shadow ?? 1);

  const legPose: Record<number, [number, number, number, number]> = {
    0: [0, 7, 0, 7],
    1: [-2, 5, 2, 7],
    2: [-3, 4, 3, 6],
    3: [2, 7, -2, 5],
    4: [3, 6, -3, 4],
  };
  const [lx, ll, rx, rl] = legPose[legs] ?? legPose[0]!;
  c.rect(X(19 + lx), Y(FEET_Y - ll), 4, ll, pal.dark);
  c.rect(X(25 + rx), Y(FEET_Y - rl), 4, rl, pal.dark);
  c.rect(X(18 + lx), Y(FEET_Y - 1), 6, 1, pal.out);
  c.rect(X(24 + rx), Y(FEET_Y - 1), 6, 1, pal.out);

  const tw = Math.round(pose.tail ?? 0);
  c.rect(X(30), Y(33), 3, 3, pal.dark);
  c.rect(X(32), Y(31 + tw), 3, 3, pal.dark);
  c.rect(X(34), Y(28 + tw * 2), 3, 4, pal.main);
  c.rect(X(35), Y(26 + tw * 2), 3, 3, pal.light);

  const bw = 14 + squash;
  const bh = 13 - squash;
  c.round(X(CX - Math.floor(bw / 2)), Y(FEET_Y - 7 - bh), bw, bh, pal.main);
  c.rect(X(CX - 4), Y(FEET_Y - 7 - bh + 4), 8, bh - 5, pal.cream);

  const al = Math.round(pose.armL ?? 0);
  const ar = Math.round(pose.armR ?? 0);
  c.rect(X(14), Y(FEET_Y - 18 + al), 3, 7 - Math.min(0, al), pal.dark);
  c.rect(X(31), Y(FEET_Y - 18 + ar), 3, 7 - Math.min(0, ar), pal.dark);

  const headY = Y(11);
  c.round(X(15), headY, 18, 16, pal.main);
  c.rect(X(17), headY + 11, 14, 3, pal.dark);
  c.round(X(20), headY + 8, 8, 6, pal.cream);

  c.rect(X(16), headY - 4 + ears, 5, 5, pal.main);
  c.rect(X(17), headY - 5 + ears, 3, 2, pal.main);
  c.rect(X(27), headY - 4 + ears, 5, 5, pal.main);
  c.rect(X(28), headY - 5 + ears, 3, 2, pal.main);

  c.outline(pal.out);

  c.rect(X(17), headY - 3 + ears, 3, 4, pal.light);
  c.rect(X(28), headY - 3 + ears, 3, 4, pal.light);

  drawEyes(c, dx, headY, pose.eyes ?? 'open', pal);
  drawMouth(c, dx, headY, pose.mouth ?? 'smile', pal);
}

function drawEmberSide(c: PixelCanvas, pose: Pose, pal: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const step = pose.legs ?? 0;
  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;

  drawShadow(c, CX, dx, pose.shadow ?? 1);

  const swing: Record<number, [number, number, number, number]> = {
    0: [0, 9, 0, 9],
    1: [2, 8, -2, 9],
    2: [4, 5, -4, 8],
    3: [-2, 9, 2, 8],
    4: [-4, 8, 4, 5],
  };
  const [fx, fl, bx, bl] = swing[step] ?? swing[0]!;
  c.rect(X(18 + bx), Y(FEET_Y - bl), 4, bl, pal.dark);
  c.rect(X(29 + bx), Y(FEET_Y - bl), 4, bl, pal.dark);
  c.rect(X(20 + fx), Y(FEET_Y - fl), 4, fl, pal.main);
  c.rect(X(31 + fx), Y(FEET_Y - fl), 4, fl, pal.main);

  const tw = Math.round(pose.tail ?? 0);
  c.rect(X(12), Y(31 - tw), 4, 4, pal.dark);
  c.rect(X(9), Y(27 - tw * 2), 4, 5, pal.main);
  c.rect(X(8), Y(24 - tw * 2), 4, 4, pal.light);

  c.round(X(15), Y(29), 20, 10, pal.main);
  c.rect(X(18), Y(34), 14, 4, pal.cream);

  const headY = Y(18);
  c.round(X(28), headY, 13, 12, pal.main);
  c.rect(X(39), headY + 5, 5, 5, pal.main);
  c.rect(X(40), headY + 4, 3, 2, pal.main);

  const ears = Math.round(pose.ears ?? 0);
  c.rect(X(30), headY - 4 + ears, 5, 5, pal.main);
  c.rect(X(31), headY - 5 + ears, 3, 2, pal.main);
  c.rect(X(35), headY - 3 + ears, 4, 4, pal.dark);

  c.outline(pal.out);

  c.rect(X(31), headY - 3 + ears, 3, 3, pal.light);

  if ((pose.eyes ?? 'open') === 'blink') {
    c.rect(X(34), headY + 5, 4, 1, pal.out);
  } else {
    c.rect(X(34), headY + 3, 4, 4, pal.eyeWhite);
    c.rect(X(35), headY + 4, 3, 3, pal.eyeDark);
    c.px(X(35), headY + 4, pal.eyeWhite);
  }
  c.rect(X(43), headY + 5, 2, 2, pal.out);
  c.rect(X(40), headY + 9, 3, 1, pal.out);
}

export const EMBER: PixelCharacter = {
  id: 'ember',
  palette: EMBER_PALETTE,
  draw: drawEmber,
  drawSide: drawEmberSide,
};
