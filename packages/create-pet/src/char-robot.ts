/**
 * "Bolt" — a small steel robot with a screen face. Original pixel art drawn
 * in code. CC0.
 *
 * Deliberately the odd one out: hard right angles where the animals have
 * curves, and a glowing screen instead of drawn eyes. The `ears` pose slot
 * drives its antenna and `tail` drives the back vent, so it animates through
 * the same engine as everything else.
 */
import {
  LOGICAL_BASELINE,
  type Palette,
  type PixelCanvas,
  type PixelCharacter,
  type Pose,
} from './pixel.js';

const CX = 24;
const FEET_Y = LOGICAL_BASELINE;

export const ROBOT_PALETTE: Palette = {
  out: [46, 54, 64, 255],
  dark: [110, 124, 140, 255],
  main: [166, 180, 196, 255],
  light: [212, 224, 236, 255],
  cream: [238, 246, 252, 255],
  eyeWhite: [236, 250, 255, 255],
  eyeDark: [26, 34, 44, 255],
  accent: [77, 216, 255, 255], // screen glow
};

/** The face is a lit screen, so "eyes" are shapes drawn on it. */
function screenFace(c: PixelCanvas, ox: number, sx: number, sy: number, pose: Pose, pal: Palette): void {
  const style = pose.eyes ?? 'open';
  const on = pal.accent;

  switch (style) {
    case 'blink':
      c.rect(ox + sx + 1, sy + 3, 3, 1, on);
      c.rect(ox + sx + 7, sy + 3, 3, 1, on);
      break;
    case 'x':
      for (const bx of [sx + 1, sx + 7]) {
        c.px(ox + bx, sy + 1, on);
        c.px(ox + bx + 2, sy + 1, on);
        c.px(ox + bx + 1, sy + 2, on);
        c.px(ox + bx, sy + 3, on);
        c.px(ox + bx + 2, sy + 3, on);
      }
      break;
    case 'happy':
      c.rect(ox + sx + 1, sy + 3, 3, 1, on);
      c.px(ox + sx, sy + 2, on);
      c.px(ox + sx + 4, sy + 2, on);
      c.rect(ox + sx + 7, sy + 3, 3, 1, on);
      c.px(ox + sx + 6, sy + 2, on);
      c.px(ox + sx + 10, sy + 2, on);
      break;
    case 'wide':
      c.rect(ox + sx, sy, 5, 5, on);
      c.rect(ox + sx + 6, sy, 5, 5, on);
      c.rect(ox + sx + 1, sy + 1, 3, 3, pal.eyeDark);
      c.rect(ox + sx + 7, sy + 1, 3, 3, pal.eyeDark);
      break;
    case 'look':
      c.rect(ox + sx, sy + 1, 3, 3, on);
      c.rect(ox + sx + 6, sy + 1, 3, 3, on);
      break;
    case 'open':
    default:
      c.rect(ox + sx + 1, sy + 1, 3, 3, on);
      c.rect(ox + sx + 7, sy + 1, 3, 3, on);
      break;
  }

  // mouth line, also on the screen
  const my = sy + 6;
  switch (pose.mouth ?? 'smile') {
    case 'open':
      c.rect(ox + sx + 3, my, 5, 2, on);
      break;
    case 'oh':
      c.rect(ox + sx + 4, my, 3, 2, on);
      break;
    case 'frown':
      c.rect(ox + sx + 3, my + 1, 5, 1, on);
      c.px(ox + sx + 2, my, on);
      c.px(ox + sx + 8, my, on);
      break;
    case 'flat':
      c.rect(ox + sx + 3, my, 5, 1, on);
      break;
    case 'smile':
    default:
      c.rect(ox + sx + 3, my, 5, 1, on);
      c.px(ox + sx + 2, my - 1, on);
      c.px(ox + sx + 8, my - 1, on);
      break;
  }
}

function drawRobot(c: PixelCanvas, pose: Pose, pal: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const legs = pose.legs ?? 0;
  const ears = Math.round(pose.ears ?? 0);
  const squash = pose.squash ?? 0;
  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;


  // blocky legs
  const legPose: Record<number, [number, number, number, number]> = {
    0: [0, 6, 0, 6],
    1: [-2, 4, 2, 6],
    2: [-3, 3, 3, 5],
    3: [2, 6, -2, 4],
    4: [3, 5, -3, 3],
  };
  const [lx, ll, rx, rl] = legPose[legs] ?? legPose[0]!;
  c.rect(X(18 + lx), Y(FEET_Y - ll), 5, ll, pal.dark);
  c.rect(X(25 + rx), Y(FEET_Y - rl), 5, rl, pal.dark);
  c.rect(X(17 + lx), Y(FEET_Y - 2), 7, 2, pal.main);
  c.rect(X(24 + rx), Y(FEET_Y - 2), 7, 2, pal.main);

  // back vent, glowing
  const tw = Math.round(pose.tail ?? 0);
  c.rect(X(32), Y(30 - tw), 3, 6, pal.dark);
  c.rect(X(33), Y(31 - tw), 1, 4, pal.accent);

  // chassis
  const bw = 16 + squash;
  const bh = 12 - squash;
  c.rect(X(CX - Math.floor(bw / 2)), Y(FEET_Y - 6 - bh), bw, bh, pal.main);
  c.rect(X(CX - 4), Y(FEET_Y - 4 - bh + 4), 8, 4, pal.dark);
  c.rect(X(CX - 3), Y(FEET_Y - 3 - bh + 4), 2, 2, pal.accent); // status light

  // arms
  const al = Math.round(pose.armL ?? 0);
  const ar = Math.round(pose.armR ?? 0);
  c.rect(X(13), Y(FEET_Y - 16 + al), 4, 6 - Math.min(0, al), pal.dark);
  c.rect(X(31), Y(FEET_Y - 16 + ar), 4, 6 - Math.min(0, ar), pal.dark);
  c.rect(X(12), Y(FEET_Y - 11 + al), 5, 3, pal.main);
  c.rect(X(31), Y(FEET_Y - 11 + ar), 5, 3, pal.main);

  // head: a hard rectangle, no rounding
  const headY = Y(13);
  c.rect(X(15), headY, 18, 14, pal.main);
  c.rect(X(17), headY + 2, 14, 10, pal.eyeDark); // the screen

  // antenna
  c.rect(X(23), headY - 5 + ears, 2, 5, pal.dark);
  c.rect(X(22), headY - 8 + ears, 4, 3, pal.accent);

  c.outline(pal.out);

  screenFace(c, dx, 18, headY + 4, pose, pal);
}

function drawRobotSide(c: PixelCanvas, pose: Pose, pal: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const step = pose.legs ?? 0;
  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;


  // Bipedal, unlike the animals: two legs striding, not four.
  const swing: Record<number, [number, number, number, number]> = {
    //  [frontLegX, frontLen, backLegX, backLen]
    0: [0, 9, 0, 9],
    1: [3, 8, -3, 9],
    2: [5, 6, -5, 8],
    3: [-3, 9, 3, 8],
    4: [-5, 8, 5, 6],
  };
  const [fx, fl, bx, bl] = swing[step] ?? swing[0]!;
  c.rect(X(22 + bx), Y(FEET_Y - bl), 5, bl, pal.dark);
  c.rect(X(21 + bx), Y(FEET_Y - 2), 7, 2, pal.dark);
  c.rect(X(24 + fx), Y(FEET_Y - fl), 5, fl, pal.main);
  c.rect(X(23 + fx), Y(FEET_Y - 2), 7, 2, pal.main);

  // exhaust vent on its back
  const tw = Math.round(pose.tail ?? 0);
  c.rect(X(15), Y(28 - tw), 4, 7, pal.dark);
  c.rect(X(16), Y(29 - tw), 2, 5, pal.accent);

  // upright chassis
  c.rect(X(19), Y(26), 14, 12, pal.main);
  c.rect(X(22), Y(31), 9, 3, pal.dark);

  // one arm, swinging opposite the front leg
  const armSwing = step === 2 || step === 4 ? -2 : 1;
  c.rect(X(29), Y(28 + armSwing), 4, 8, pal.dark);

  // head sits on top, screen facing right
  const headY = Y(13);
  c.rect(X(20), headY, 14, 13, pal.main);
  c.rect(X(25), headY + 3, 9, 8, pal.eyeDark);

  const ears = Math.round(pose.ears ?? 0);
  c.rect(X(26), headY - 5 + ears, 2, 5, pal.dark);
  c.rect(X(25), headY - 8 + ears, 4, 3, pal.accent);

  c.outline(pal.out);

  // a single glowing eye band on the screen
  if ((pose.eyes ?? 'open') === 'blink') {
    c.rect(X(28), headY + 7, 5, 1, pal.accent);
  } else {
    c.rect(X(28), headY + 5, 5, 4, pal.accent);
  }
}

export const ROBOT: PixelCharacter = {
  id: 'bolt',
  palette: ROBOT_PALETTE,
  draw: drawRobot,
  drawSide: drawRobotSide,
};
