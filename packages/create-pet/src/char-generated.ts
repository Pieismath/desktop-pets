/**
 * Build a drawable character from traits — the engine behind
 * `create-pet from-prompt`.
 *
 * The hand-drawn pets (cat, dog, robot, fox) all turned out to share the same
 * skeleton: legs, tail, body, limbs, head, ears, face. This generalises that
 * skeleton so every part is a variant, which is what lets an arbitrary
 * description become a pet with no art and no AI service involved.
 */
import {
  LOGICAL_BASELINE,
  type Palette,
  type PixelCanvas,
  type PixelCharacter,
  type Pose,
  type RGBA,
} from './pixel.js';
import { paletteFromTraits, type Traits } from './traits.js';

const CX = 24;
const FEET_Y = LOGICAL_BASELINE;

const BODY: Record<Traits['body'], { w: number; h: number; boxy: boolean }> = {
  round: { w: 16, h: 12, boxy: false },
  tall: { w: 14, h: 15, boxy: false },
  boxy: { w: 17, h: 13, boxy: true },
};

// ------------------------------------------------------------------- parts

function drawEars(c: PixelCanvas, X: (v: number) => number, headY: number, t: Traits, pal: Palette, off: number): void {
  switch (t.ears) {
    case 'pointed':
      for (let r = 0; r < 5; r++) {
        c.rect(X(19 - r), headY - 5 + r + off, r + 1, 1, pal.main);
        c.rect(X(29), headY - 5 + r + off, r + 1, 1, pal.main);
      }
      break;
    case 'tall':
      c.rect(X(17), headY - 10 + off, 4, 12, pal.main);
      c.rect(X(28), headY - 10 + off, 4, 12, pal.main);
      break;
    case 'floppy':
      c.rect(X(12), headY + 1 + off, 4, 9, pal.dark);
      c.rect(X(13), headY + 9 + off, 3, 2, pal.dark);
      c.rect(X(33), headY + 1 + off, 4, 9, pal.dark);
      c.rect(X(33), headY + 9 + off, 3, 2, pal.dark);
      break;
    case 'round':
      c.round(X(14), headY - 4 + off, 6, 6, pal.main);
      c.round(X(29), headY - 4 + off, 6, 6, pal.main);
      break;
    case 'horns':
      for (let r = 0; r < 4; r++) {
        c.rect(X(17 - r), headY - 4 + r + off, 2, 1, pal.light);
        c.rect(X(30 + r), headY - 4 + r + off, 2, 1, pal.light);
      }
      break;
    case 'antenna':
      c.rect(X(23), headY - 5 + off, 2, 5, pal.dark);
      c.rect(X(22), headY - 8 + off, 4, 3, pal.accent);
      break;
    case 'none':
      break;
  }
}

function drawInnerEars(c: PixelCanvas, X: (v: number) => number, headY: number, t: Traits, pal: Palette, off: number): void {
  if (t.ears === 'pointed') {
    c.rect(X(17), headY - 2 + off, 2, 2, pal.light);
    c.rect(X(30), headY - 2 + off, 2, 2, pal.light);
  } else if (t.ears === 'tall') {
    c.rect(X(18), headY - 8 + off, 2, 8, pal.light);
    c.rect(X(29), headY - 8 + off, 2, 8, pal.light);
  } else if (t.ears === 'round') {
    c.rect(X(16), headY - 2 + off, 2, 2, pal.light);
    c.rect(X(31), headY - 2 + off, 2, 2, pal.light);
  }
}

function drawTailFront(c: PixelCanvas, X: (v: number) => number, Y: (v: number) => number, t: Traits, pal: Palette, tw: number): void {
  switch (t.tail) {
    case 'long':
      c.rect(X(30), Y(36), 4, 3, pal.main);
      c.rect(X(33), Y(31 - tw), 3, 6, pal.main);
      c.rect(X(34), Y(26 - tw * 2), 3, 6, pal.main);
      c.rect(X(34), Y(23 - tw * 2), 4, 4, pal.light);
      break;
    case 'bushy':
      c.rect(X(30), Y(34), 4, 4, pal.dark);
      c.rect(X(33), Y(29 - tw), 5, 7, pal.main);
      c.rect(X(33), Y(25 - tw * 2), 5, 5, pal.light);
      break;
    case 'curled':
      c.rect(X(31), Y(33 - tw), 4, 3, pal.main);
      c.rect(X(34), Y(29 - tw), 3, 5, pal.main);
      c.rect(X(33), Y(26 - tw), 4, 3, pal.light);
      break;
    case 'puff':
      c.round(X(31), Y(33 - tw), 6, 6, pal.cream);
      break;
    case 'stub':
      c.rect(X(31), Y(34 - tw), 4, 4, pal.main);
      break;
    case 'none':
      break;
  }
}

function drawMuzzle(c: PixelCanvas, X: (v: number) => number, headY: number, t: Traits, pal: Palette): void {
  switch (t.muzzle) {
    case 'small':
      c.round(X(20), headY + 9, 8, 6, pal.cream);
      break;
    case 'snout':
      c.round(X(19), headY + 9, 11, 6, pal.cream);
      break;
    case 'beak':
      for (let r = 0; r < 4; r++) c.rect(X(21 + r), headY + 10 + r, 6 - r * 2, 1, [240, 178, 62, 255]);
      break;
    case 'none':
      break;
  }
}

function drawEyes(c: PixelCanvas, X: (v: number) => number, headY: number, t: Traits, pal: Palette, style: Pose['eyes']): void {
  const ey = headY + 6;
  const put = (x: number): void => {
    if (style === 'blink') {
      c.rect(X(x), ey + 2, 5, 1, pal.out);
      return;
    }
    if (style === 'x') {
      c.px(X(x), ey, pal.out);
      c.px(X(x + 4), ey, pal.out);
      c.px(X(x + 1), ey + 1, pal.out);
      c.px(X(x + 3), ey + 1, pal.out);
      c.px(X(x + 2), ey + 2, pal.out);
      c.px(X(x + 1), ey + 3, pal.out);
      c.px(X(x + 3), ey + 3, pal.out);
      c.px(X(x), ey + 4, pal.out);
      c.px(X(x + 4), ey + 4, pal.out);
      return;
    }
    if (style === 'happy') {
      c.px(X(x), ey + 3, pal.out);
      c.px(X(x + 1), ey + 2, pal.out);
      c.px(X(x + 2), ey + 1, pal.out);
      c.px(X(x + 3), ey + 2, pal.out);
      c.px(X(x + 4), ey + 3, pal.out);
      return;
    }
    // startled always shows whites, so it stays legible on the red alarm coat
    if (style === 'wide') {
      c.rect(X(x), ey - 1, 5, 6, pal.eyeWhite);
      c.rect(X(x + 1), ey, 3, 4, pal.eyeDark);
      c.px(X(x + 1), ey, pal.eyeWhite);
      return;
    }
    switch (t.eyes) {
      case 'slit':
        c.rect(X(x), ey, 5, 4, pal.accent);
        c.rect(X(x + 2), ey, 1, 4, pal.eyeDark);
        c.px(X(x + 1), ey, pal.eyeWhite);
        break;
      case 'beady':
        c.rect(X(x + 1), ey + 1, 3, 3, pal.eyeDark);
        c.px(X(x + 1), ey + 1, pal.eyeWhite);
        break;
      case 'screen':
        c.rect(X(x), ey, 4, 4, pal.accent);
        break;
      case 'round':
      default:
        c.rect(X(x), ey, 5, 4, pal.eyeWhite);
        c.rect(X(x + 1), ey, 3, 4, pal.eyeDark);
        c.px(X(x + 1), ey, pal.eyeWhite);
        break;
    }
  };
  put(17);
  put(26);
}

function drawMouth(c: PixelCanvas, X: (v: number) => number, headY: number, pal: Palette, style: Pose['mouth']): void {
  const my = headY + 13;
  switch (style) {
    case 'open':
      c.rect(X(22), my, 4, 3, pal.out);
      break;
    case 'oh':
      c.rect(X(23), my, 2, 3, pal.out);
      break;
    case 'flat':
      c.rect(X(22), my + 1, 4, 1, pal.out);
      break;
    case 'frown':
      c.rect(X(22), my + 1, 4, 1, pal.out);
      c.px(X(21), my, pal.out);
      c.px(X(26), my, pal.out);
      break;
    case 'smile':
    default:
      c.px(X(22), my, pal.out);
      c.px(X(23), my + 1, pal.out);
      c.px(X(24), my + 1, pal.out);
      c.px(X(25), my, pal.out);
      break;
  }
}

// ------------------------------------------------------------------ builder

/** Compose a full PixelCharacter from traits. */
export function buildCharacter(id: string, traits: Traits): PixelCharacter {
  const pal = paletteFromTraits(traits);
  const shape = BODY[traits.body];

  const draw = (c: PixelCanvas, pose: Pose, p: Palette): void => {
    const dy = Math.round(pose.dy ?? 0);
    const dx = Math.round(pose.dx ?? 0);
    const legs = pose.legs ?? 0;
    const earOff = Math.round(pose.ears ?? 0);
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
    c.rect(X(18 + lx), Y(FEET_Y - ll), 5, ll, p.main);
    c.rect(X(25 + rx), Y(FEET_Y - rl), 5, rl, p.main);
    c.rect(X(18 + lx), Y(FEET_Y - 2), 5, 2, p.cream);
    c.rect(X(25 + rx), Y(FEET_Y - 2), 5, 2, p.cream);

    drawTailFront(c, X, Y, traits, p, Math.round(pose.tail ?? 0));

    const bw = shape.w + squash;
    const bh = shape.h - squash;
    const bx = CX - Math.floor(bw / 2);
    const by = FEET_Y - 6 - bh;
    if (shape.boxy) c.rect(X(bx), Y(by), bw, bh, p.main);
    else c.round(X(bx), Y(by), bw, bh, p.main);
    c.rect(X(CX - 4), Y(by + 4), 8, Math.max(2, bh - 5), p.cream);

    const al = Math.round(pose.armL ?? 0);
    const ar = Math.round(pose.armR ?? 0);
    c.rect(X(bx - 3), Y(FEET_Y - 16 + al), 4, 6 - Math.min(0, al), p.main);
    c.rect(X(bx + bw - 1), Y(FEET_Y - 16 + ar), 4, 6 - Math.min(0, ar), p.main);

    const headY = Y(12);
    if (shape.boxy) c.rect(X(15), headY, 18, 14, p.main);
    else c.round(X(15), headY, 18, 15, p.main);
    drawEars(c, X, headY, traits, p, earOff);
    drawMuzzle(c, X, headY, traits, p);
    if (traits.eyes === 'screen') c.rect(X(17), headY + 3, 14, 9, p.eyeDark);

    c.outline(p.out);

    drawInnerEars(c, X, headY, traits, p, earOff);
    drawEyes(c, X, headY, traits, p, pose.eyes ?? 'open');
    if (traits.muzzle !== 'beak' && traits.muzzle !== 'none') c.rect(X(23), headY + 10, 2, 2, p.out);
    drawMouth(c, X, headY, p, pose.mouth ?? 'smile');

    if (traits.whiskers) {
      const wy = headY + 14;
      c.rect(X(10), wy - 1, 5, 1, p.cream);
      c.rect(X(10), wy + 2, 5, 1, p.cream);
      c.rect(X(33), wy - 1, 5, 1, p.cream);
      c.rect(X(33), wy + 2, 5, 1, p.cream);
    }
  };

  const drawSide = (c: PixelCanvas, pose: Pose, p: Palette): void => {
    const dy = Math.round(pose.dy ?? 0);
    const dx = Math.round(pose.dx ?? 0);
    const step = pose.legs ?? 0;
    const earOff = Math.round(pose.ears ?? 0);
    const X = (v: number) => v + dx;
    const Y = (v: number) => v + dy;

    const swing: Record<number, [number, number, number, number]> = {
      0: [0, 9, 0, 9],
      1: [2, 8, -2, 9],
      2: [4, 5, -4, 8],
      3: [-2, 9, 2, 8],
      4: [-4, 8, 4, 5],
    };
    const [fx, fl, bx2, bl] = swing[step] ?? swing[0]!;

    if (traits.gait === 'quadruped') {
      c.rect(X(17 + bx2), Y(FEET_Y - bl), 4, bl, p.dark);
      c.rect(X(28 + bx2), Y(FEET_Y - bl), 4, bl, p.dark);
      c.rect(X(19 + fx), Y(FEET_Y - fl), 4, fl, p.main);
      c.rect(X(30 + fx), Y(FEET_Y - fl), 4, fl, p.main);
    } else {
      c.rect(X(22 + bx2), Y(FEET_Y - bl), 5, bl, p.dark);
      c.rect(X(21 + bx2), Y(FEET_Y - 2), 7, 2, p.dark);
      c.rect(X(24 + fx), Y(FEET_Y - fl), 5, fl, p.main);
      c.rect(X(23 + fx), Y(FEET_Y - 2), 7, 2, p.main);
    }

    // Tail trails behind (to the left when facing right). A biped's body sits
    // further right, so the tail has to start there too or it floats free.
    const quad = traits.gait === 'quadruped';
    const tw = Math.round(pose.tail ?? 0);
    if (traits.tail !== 'none') {
      const thick = traits.tail === 'bushy' ? 5 : 4;
      const tx = quad ? 11 : 16;
      c.rect(X(tx), Y(30 - tw), thick, 4, p.dark);
      if (traits.tail !== 'stub') {
        c.rect(X(tx - 3), Y(25 - tw), thick, 6, p.main);
        c.rect(X(tx - 4), Y(20 - tw * 2), thick, 6, traits.tail === 'puff' ? p.cream : p.light);
      }
    }

    if (quad) {
      c.round(X(14), Y(29), 21, 10, p.main);
      c.rect(X(17), Y(35), 15, 3, p.cream);
    } else {
      if (shape.boxy) c.rect(X(19), Y(26), 14, 12, p.main);
      else c.round(X(19), Y(26), 14, 12, p.main);
      c.rect(X(22), Y(31), 9, 3, p.cream);
    }

    const headY = quad ? Y(18) : Y(13);
    const hx = quad ? 28 : 20;
    if (shape.boxy) c.rect(X(hx), headY, 14, 13, p.main);
    else c.round(X(hx), headY, 13, 12, p.main);

    // snout / beak points right
    if (traits.muzzle === 'beak') {
      for (let r = 0; r < 4; r++) c.rect(X(hx + 12), headY + 4 + r, 6 - r, 1, [240, 178, 62, 255]);
    } else if (traits.muzzle !== 'none') {
      c.rect(X(hx + 11), headY + 5, 5, 5, p.cream);
      c.rect(X(hx + 12), headY + 4, 3, 2, p.cream);
    }

    // one visible ear
    switch (traits.ears) {
      case 'pointed':
        for (let r = 0; r < 5; r++) c.rect(X(hx + 5 - r), headY - 5 + r + earOff, r + 1, 1, p.main);
        break;
      case 'tall':
        c.rect(X(hx + 3), headY - 10 + earOff, 4, 12, p.main);
        break;
      case 'floppy':
        c.rect(X(hx + 1), headY + 1 + earOff, 5, 9, p.dark);
        break;
      case 'round':
        c.round(X(hx + 2), headY - 4 + earOff, 6, 6, p.main);
        break;
      case 'horns':
        for (let r = 0; r < 4; r++) c.rect(X(hx + 4 - r), headY - 4 + r + earOff, 2, 1, p.light);
        break;
      case 'antenna':
        c.rect(X(hx + 4), headY - 5 + earOff, 2, 5, p.dark);
        c.rect(X(hx + 3), headY - 8 + earOff, 4, 3, p.accent);
        break;
      case 'none':
        break;
    }

    if (traits.eyes === 'screen') c.rect(X(hx + 5), headY + 3, 8, 7, p.eyeDark);

    c.outline(p.out);

    // eye
    const ex = hx + 6;
    if ((pose.eyes ?? 'open') === 'blink') {
      c.rect(X(ex), headY + 6, 4, 1, p.out);
    } else if (traits.eyes === 'screen') {
      c.rect(X(ex), headY + 5, 5, 4, p.accent);
    } else if (traits.eyes === 'slit') {
      c.rect(X(ex), headY + 4, 4, 4, p.accent);
      c.rect(X(ex + 2), headY + 4, 1, 4, p.eyeDark);
    } else if (traits.eyes === 'beady') {
      c.rect(X(ex + 1), headY + 5, 3, 3, p.eyeDark);
    } else {
      c.rect(X(ex), headY + 4, 4, 4, p.eyeWhite);
      c.rect(X(ex + 1), headY + 4, 3, 4, p.eyeDark);
    }

    if (traits.muzzle !== 'none' && traits.muzzle !== 'beak') {
      c.rect(X(hx + 15), headY + 5, 2, 2, p.out);
    }
    if (traits.whiskers) {
      c.rect(X(hx + 13), headY + 2, 5, 1, p.cream);
      c.rect(X(hx + 13), headY + 9, 5, 1, p.cream);
    }
  };

  return { id, palette: pal, draw, drawSide };
}

/** Convenience: prompt → character, in one call. */
export function characterFromTraits(id: string, traits: Traits): PixelCharacter {
  return buildCharacter(id, traits);
}

export type { RGBA };
