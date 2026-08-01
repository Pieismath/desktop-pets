/**
 * "Mochi" — a ginger tabby cat, and the default pet. Original pixel art
 * drawn in code on the 48x52 logical grid. No reference images, no
 * third-party IP. CC0.
 *
 * At this size a cat reads through four things: pointed triangular ears,
 * whiskers, slit pupils, and a long expressive tail. Everything else is
 * secondary, so those get the pixels.
 */
import {
  LOGICAL_BASELINE,
  drawShadow,
  type Palette,
  type PixelCanvas,
  type PixelCharacter,
  type Pose,
  type RGBA,
} from './pixel.js';

const CX = 24;
const FEET_Y = LOGICAL_BASELINE;

export const CAT_PALETTE: Palette = {
  out: [92, 46, 20, 255],
  dark: [196, 106, 40, 255], // tabby stripes / shading
  main: [240, 145, 63, 255], // ginger coat
  light: [255, 185, 104, 255],
  cream: [255, 240, 216, 255], // muzzle, chest, paws, tail tip
  eyeWhite: [255, 253, 245, 255],
  eyeDark: [38, 24, 14, 255],
  accent: [122, 212, 106, 255], // green iris
};

// ------------------------------------------------------------- front view

function catEyes(c: PixelCanvas, ox: number, headY: number, style: Pose['eyes'], pal: Palette): void {
  const ey = headY + 6;
  const put = (x: number): void => {
    switch (style) {
      case 'blink':
        c.rect(ox + x, ey + 2, 5, 1, pal.out);
        break;
      case 'x':
        c.px(ox + x, ey, pal.out);
        c.px(ox + x + 4, ey, pal.out);
        c.px(ox + x + 1, ey + 1, pal.out);
        c.px(ox + x + 3, ey + 1, pal.out);
        c.px(ox + x + 2, ey + 2, pal.out);
        c.px(ox + x + 1, ey + 3, pal.out);
        c.px(ox + x + 3, ey + 3, pal.out);
        c.px(ox + x, ey + 4, pal.out);
        c.px(ox + x + 4, ey + 4, pal.out);
        break;
      case 'happy':
        // upturned "^" — a pleased cat
        c.px(ox + x, ey + 3, pal.out);
        c.px(ox + x + 1, ey + 2, pal.out);
        c.px(ox + x + 2, ey + 1, pal.out);
        c.px(ox + x + 3, ey + 2, pal.out);
        c.px(ox + x + 4, ey + 3, pal.out);
        break;
      case 'wide':
        // startled: whites showing, pupil blown round. Deliberately not the
        // iris colour — it has to stay legible against the red alarm coat.
        c.rect(ox + x, ey - 1, 5, 6, pal.eyeWhite);
        c.rect(ox + x + 1, ey, 3, 4, pal.eyeDark);
        c.px(ox + x + 1, ey, pal.eyeWhite);
        break;
      case 'look':
        c.rect(ox + x, ey, 5, 4, pal.accent);
        c.rect(ox + x + 1, ey, 1, 4, pal.eyeDark);
        break;
      case 'open':
      default:
        // green iris with a vertical slit pupil — the cat tell
        c.rect(ox + x, ey, 5, 4, pal.accent);
        c.rect(ox + x + 2, ey, 1, 4, pal.eyeDark);
        c.px(ox + x + 1, ey, pal.eyeWhite);
        break;
    }
  };
  put(17);
  put(26);
}

function catFace(c: PixelCanvas, headY: number, pose: Pose, pal: Palette, ox = 0): void {
  catEyes(c, ox, headY, pose.eyes ?? 'open', pal);

  // muzzle + nose
  const my = headY + 12;
  c.rect(ox + 22, my - 1, 4, 2, pal.cream);
  c.px(ox + 23, my - 1, pal.out);
  c.px(ox + 24, my - 1, pal.out);

  switch (pose.mouth ?? 'smile') {
    case 'open':
      c.rect(ox + 22, my + 1, 4, 3, pal.out);
      break;
    case 'oh':
      c.rect(ox + 23, my + 1, 2, 3, pal.out);
      break;
    case 'flat':
      c.rect(ox + 22, my + 2, 4, 1, pal.out);
      break;
    case 'frown':
      c.rect(ox + 22, my + 2, 4, 1, pal.out);
      c.px(ox + 21, my + 1, pal.out);
      c.px(ox + 26, my + 1, pal.out);
      break;
    case 'smile':
    default:
      // the classic cat "w" mouth
      c.px(ox + 22, my + 1, pal.out);
      c.px(ox + 23, my + 2, pal.out);
      c.px(ox + 24, my + 2, pal.out);
      c.px(ox + 25, my + 1, pal.out);
      break;
  }

  // whiskers, drawn last so they sit over the cheeks and past the outline
  const wy = my + 1;
  c.rect(ox + 10, wy - 1, 5, 1, pal.cream);
  c.rect(ox + 10, wy + 2, 5, 1, pal.cream);
  c.rect(ox + 33, wy - 1, 5, 1, pal.cream);
  c.rect(ox + 33, wy + 2, 5, 1, pal.cream);
}

function drawCat(c: PixelCanvas, pose: Pose, pal: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const legs = pose.legs ?? 0;
  const ears = Math.round(pose.ears ?? 0);
  const squash = pose.squash ?? 0;
  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;

  drawShadow(c, CX, dx, pose.shadow ?? 1);

  // ---- hind legs / paws ----
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

  // ---- tail: long, curling up the right side ----
  const tw = Math.round(pose.tail ?? 0);
  c.rect(X(30), Y(36), 4, 3, pal.main);
  c.rect(X(33), Y(32 - tw), 3, 5, pal.main);
  c.rect(X(34), Y(27 - tw * 2), 3, 6, pal.main);
  c.rect(X(34), Y(23 - tw * 2), 4, 5, pal.light);
  c.rect(X(34), Y(23 - tw * 2), 4, 2, pal.cream); // pale tip
  c.rect(X(33), Y(30 - tw), 3, 1, pal.dark); // tail rings
  c.rect(X(34), Y(25 - tw * 2), 3, 1, pal.dark);

  // ---- body ----
  const bw = 15 + squash;
  const bh = 12 - squash;
  c.round(X(CX - Math.floor(bw / 2)), Y(FEET_Y - 6 - bh), bw, bh, pal.main);
  c.rect(X(CX - 4), Y(FEET_Y - 5 - bh + 4), 8, bh - 5, pal.cream); // chest
  c.rect(X(CX - 7), Y(FEET_Y - 6 - bh + 2), 3, 1, pal.dark); // flank stripes
  c.rect(X(CX + 4), Y(FEET_Y - 6 - bh + 2), 3, 1, pal.dark);

  // ---- front paws ----
  const al = Math.round(pose.armL ?? 0);
  const ar = Math.round(pose.armR ?? 0);
  c.rect(X(14), Y(FEET_Y - 16 + al), 4, 6 - Math.min(0, al), pal.main);
  c.rect(X(30), Y(FEET_Y - 16 + ar), 4, 6 - Math.min(0, ar), pal.main);
  c.rect(X(14), Y(FEET_Y - 11 + al), 4, 2, pal.cream);
  c.rect(X(30), Y(FEET_Y - 11 + ar), 4, 2, pal.cream);

  // ---- head ----
  const headY = Y(12);
  c.round(X(15), headY, 18, 15, pal.main);

  // ---- ears: triangles that widen downward and lean outward ----
  for (let r = 0; r < 5; r++) {
    c.rect(X(19 - r), headY - 5 + r + ears, r + 1, 1, pal.main); // left, apex up-left
    c.rect(X(29), headY - 5 + r + ears, r + 1, 1, pal.main); // right, apex up-right
  }

  c.outline(pal.out);

  // inner ears + forehead tabby "M", after the outline so they stay inside
  c.rect(X(17), headY - 2 + ears, 2, 2, pal.light);
  c.rect(X(30), headY - 2 + ears, 2, 2, pal.light);
  c.rect(X(20), headY + 2, 1, 3, pal.dark);
  c.rect(X(23), headY + 1, 1, 2, pal.dark);
  c.rect(X(27), headY + 2, 1, 3, pal.dark);

  catFace(c, headY, pose, pal, dx);
}

// -------------------------------------------------------------- side view

function drawCatSide(c: PixelCanvas, pose: Pose, pal: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const step = pose.legs ?? 0;
  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;

  drawShadow(c, CX, dx, pose.shadow ?? 1);

  // legs, front pair and back pair swinging in opposition
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
  // pale paws
  c.rect(X(19 + fx), Y(FEET_Y - 2), 4, 2, pal.cream);
  c.rect(X(30 + fx), Y(FEET_Y - 2), 4, 2, pal.cream);

  // a long cat tail, held high and curving back
  const tw = Math.round(pose.tail ?? 0);
  c.rect(X(11), Y(30 - tw), 4, 4, pal.main);
  c.rect(X(8), Y(25 - tw), 4, 6, pal.main);
  c.rect(X(7), Y(20 - tw * 2), 4, 6, pal.main);
  c.rect(X(7), Y(16 - tw * 2), 4, 5, pal.light);
  c.rect(X(7), Y(16 - tw * 2), 4, 2, pal.cream);
  c.rect(X(8), Y(27 - tw), 3, 1, pal.dark);
  c.rect(X(7), Y(22 - tw * 2), 3, 1, pal.dark);

  // body
  c.round(X(14), Y(29), 21, 10, pal.main);
  c.rect(X(17), Y(35), 15, 3, pal.cream); // underside
  c.rect(X(19), Y(30), 2, 1, pal.dark); // stripes
  c.rect(X(24), Y(29), 2, 1, pal.dark);
  c.rect(X(29), Y(30), 2, 1, pal.dark);

  // head in profile
  const headY = Y(18);
  c.round(X(28), headY, 13, 12, pal.main);
  c.rect(X(39), headY + 5, 5, 5, pal.main); // snout
  c.rect(X(40), headY + 4, 3, 2, pal.main);

  // one visible pointed ear (plus the far ear peeking behind)
  const ears = Math.round(pose.ears ?? 0);
  for (let r = 0; r < 5; r++) {
    c.rect(X(33 - r), headY - 5 + r + ears, r + 1, 1, pal.main);
  }
  c.rect(X(29), headY - 3 + ears, 3, 3, pal.dark); // far ear behind

  c.outline(pal.out);

  c.rect(X(31), headY - 2 + ears, 2, 2, pal.light); // inner ear

  // eye with a slit pupil
  if ((pose.eyes ?? 'open') === 'blink') {
    c.rect(X(34), headY + 5, 4, 1, pal.out);
  } else {
    c.rect(X(34), headY + 4, 4, 4, pal.accent);
    c.rect(X(36), headY + 4, 1, 4, pal.eyeDark);
    c.px(X(35), headY + 4, pal.eyeWhite);
  }
  // nose + mouth + whiskers
  c.rect(X(43), headY + 5, 2, 2, pal.out);
  c.rect(X(40), headY + 9, 3, 1, pal.out);
  c.rect(X(42), headY + 2, 5, 1, pal.cream);
  c.rect(X(42), headY + 8, 5, 1, pal.cream);
}

export const CAT: PixelCharacter = {
  id: 'mochi',
  palette: CAT_PALETTE,
  draw: drawCat,
  drawSide: drawCatSide,
};

export const CAT_ACCENT: RGBA = CAT_PALETTE.accent;
