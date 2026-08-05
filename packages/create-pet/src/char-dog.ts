/**
 * "Biscuit" — a tan dog with floppy ears and a curled tail. Original pixel
 * art drawn in code. CC0.
 *
 * Read at 40px: floppy ears hanging *down* (the cat's point up), a broad
 * snout, and a tail that curls over the back.
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

export const DOG_PALETTE: Palette = {
  out: [92, 56, 26, 255],
  dark: [198, 138, 72, 255],
  main: [232, 176, 106, 255],
  light: [250, 213, 163, 255],
  cream: [255, 246, 226, 255],
  eyeWhite: [255, 252, 246, 255],
  eyeDark: [46, 30, 18, 255],
  accent: [120, 80, 44, 255],
};

function dogEyes(c: PixelCanvas, ox: number, headY: number, style: Pose['eyes'], pal: Palette): void {
  const ey = headY + 6;
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
        c.px(ox + x, ey + 3, pal.out);
        c.px(ox + x + 1, ey + 2, pal.out);
        c.px(ox + x + 2, ey + 2, pal.out);
        c.px(ox + x + 3, ey + 3, pal.out);
        break;
      case 'wide':
        c.rect(ox + x, ey - 1, 5, 6, pal.eyeWhite);
        c.rect(ox + x + 1, ey, 3, 4, pal.eyeDark);
        c.px(ox + x + 1, ey, pal.eyeWhite);
        break;
      case 'look':
        c.rect(ox + x, ey, 4, 4, pal.eyeWhite);
        c.rect(ox + x, ey, 2, 4, pal.eyeDark);
        break;
      case 'open':
      default:
        c.rect(ox + x, ey, 4, 4, pal.eyeWhite);
        c.rect(ox + x + 1, ey, 3, 4, pal.eyeDark);
        c.px(ox + x + 1, ey, pal.eyeWhite);
        break;
    }
  };
  put(17);
  put(27);
}

function drawDog(c: PixelCanvas, pose: Pose, pal: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const legs = pose.legs ?? 0;
  const ears = Math.round(pose.ears ?? 0);
  const squash = pose.squash ?? 0;
  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;


  const legPose: Record<number, [number, number, number, number]> = {
    0: [0, 6, 0, 6],
    1: [-2, 4, 2, 6],
    2: [-3, 3, 3, 5],
    3: [2, 6, -2, 4],
    4: [3, 5, -3, 3],
  };
  const [lx, ll, rx, rl] = legPose[legs] ?? legPose[0]!;
  c.rect(X(18 + lx), Y(FEET_Y - ll), 5, ll, pal.main);
  c.rect(X(25 + rx), Y(FEET_Y - rl), 5, rl, pal.main);
  c.rect(X(18 + lx), Y(FEET_Y - 2), 5, 2, pal.cream);
  c.rect(X(25 + rx), Y(FEET_Y - 2), 5, 2, pal.cream);

  // curled tail, over the back
  const tw = Math.round(pose.tail ?? 0);
  c.rect(X(31), Y(33 - tw), 4, 3, pal.main);
  c.rect(X(34), Y(29 - tw), 3, 5, pal.main);
  c.rect(X(33), Y(26 - tw), 4, 3, pal.light);

  // body
  const bw = 16 + squash;
  const bh = 12 - squash;
  c.round(X(CX - Math.floor(bw / 2)), Y(FEET_Y - 6 - bh), bw, bh, pal.main);
  c.rect(X(CX - 4), Y(FEET_Y - 5 - bh + 4), 8, bh - 5, pal.cream);

  // front paws
  const al = Math.round(pose.armL ?? 0);
  const ar = Math.round(pose.armR ?? 0);
  c.rect(X(13), Y(FEET_Y - 16 + al), 4, 6 - Math.min(0, al), pal.main);
  c.rect(X(31), Y(FEET_Y - 16 + ar), 4, 6 - Math.min(0, ar), pal.main);
  c.rect(X(13), Y(FEET_Y - 11 + al), 4, 2, pal.cream);
  c.rect(X(31), Y(FEET_Y - 11 + ar), 4, 2, pal.cream);

  // head, a touch broader than the cat's
  const headY = Y(12);
  c.round(X(15), headY, 19, 15, pal.main);

  // floppy ears — hanging down the sides
  c.rect(X(12), headY + 1 + ears, 4, 9, pal.dark);
  c.rect(X(13), headY + 9 + ears, 3, 2, pal.dark);
  c.rect(X(33), headY + 1 + ears, 4, 9, pal.dark);
  c.rect(X(33), headY + 9 + ears, 3, 2, pal.dark);

  // broad snout
  c.round(X(19), headY + 9, 11, 6, pal.cream);

  c.outline(pal.out);

  dogEyes(c, dx, headY, pose.eyes ?? 'open', pal);

  // nose + mouth
  c.rect(X(23), headY + 10, 3, 2, pal.out);
  const my = headY + 13;
  switch (pose.mouth ?? 'smile') {
    case 'open':
      c.rect(X(22), my, 5, 3, pal.out);
      c.rect(X(23), my + 1, 3, 2, [214, 120, 120, 255]); // tongue
      break;
    case 'oh':
      c.rect(X(23), my, 3, 3, pal.out);
      break;
    case 'flat':
      c.rect(X(22), my + 1, 5, 1, pal.out);
      break;
    case 'frown':
      c.rect(X(22), my + 1, 5, 1, pal.out);
      c.px(X(21), my, pal.out);
      c.px(X(27), my, pal.out);
      break;
    case 'smile':
    default:
      c.rect(X(22), my, 5, 1, pal.out);
      c.px(X(21), my - 1, pal.out);
      c.px(X(27), my - 1, pal.out);
      break;
  }
}

function drawDogSide(c: PixelCanvas, pose: Pose, pal: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const step = pose.legs ?? 0;
  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;


  const swing: Record<number, [number, number, number, number]> = {
    0: [0, 9, 0, 9],
    1: [2, 8, -2, 9],
    2: [4, 5, -4, 8],
    3: [-2, 9, 2, 8],
    4: [-4, 8, 4, 5],
  };
  const [fx, fl, bx, bl] = swing[step] ?? swing[0]!;
  c.rect(X(17 + bx), Y(FEET_Y - bl), 4, bl, pal.dark);
  c.rect(X(28 + bx), Y(FEET_Y - bl), 4, bl, pal.dark);
  c.rect(X(19 + fx), Y(FEET_Y - fl), 4, fl, pal.main);
  c.rect(X(30 + fx), Y(FEET_Y - fl), 4, fl, pal.main);
  c.rect(X(19 + fx), Y(FEET_Y - 2), 4, 2, pal.cream);
  c.rect(X(30 + fx), Y(FEET_Y - 2), 4, 2, pal.cream);

  // curled tail
  const tw = Math.round(pose.tail ?? 0);
  c.rect(X(11), Y(29 - tw), 4, 4, pal.main);
  c.rect(X(8), Y(25 - tw), 4, 5, pal.main);
  c.rect(X(9), Y(22 - tw), 5, 3, pal.light);

  // body
  c.round(X(14), Y(29), 21, 10, pal.main);
  c.rect(X(17), Y(35), 15, 3, pal.cream);

  // head + long snout
  const headY = Y(18);
  c.round(X(28), headY, 12, 12, pal.main);
  c.rect(X(38), headY + 5, 7, 5, pal.cream);
  c.rect(X(39), headY + 4, 4, 2, pal.cream);

  // one floppy ear
  const ears = Math.round(pose.ears ?? 0);
  c.rect(X(29), headY + 1 + ears, 5, 9, pal.dark);
  c.rect(X(29), headY + 9 + ears, 4, 2, pal.dark);

  c.outline(pal.out);

  if ((pose.eyes ?? 'open') === 'blink') {
    c.rect(X(35), headY + 5, 3, 1, pal.out);
  } else {
    c.rect(X(35), headY + 4, 3, 4, pal.eyeWhite);
    c.rect(X(35), headY + 4, 2, 4, pal.eyeDark);
  }
  c.rect(X(44), headY + 5, 2, 2, pal.out); // nose
  c.rect(X(40), headY + 9, 4, 1, pal.out); // mouth
}

export const DOG: PixelCharacter = {
  id: 'biscuit',
  palette: DOG_PALETTE,
  draw: drawDog,
  drawSide: drawDogSide,
};
