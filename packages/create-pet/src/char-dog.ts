/**
 * "Biscuit" — a tan dog with long drooping ears, a heavy muzzle and a red
 * collar. Original art, drawn as curves in code. CC0.
 *
 * Read at 40px: ears hanging well past the jaw, a muzzle that overhangs the
 * chin, and a pear of a body that is narrow at the shoulder and heavy at the
 * hip, standing on two short legs with a notch between them.
 */
import type { Pose } from './pixel.js';
import {
  BASELINE,
  bend,
  ellipsePath,
  LINE,
  LINE_IN,
  mark,
  p,
  ribbon,
  type DrawnCharacter,
  type Hues,
  type Shape,
} from './draw.js';

const CX = 96;
/** The pose engine speaks in 48x52 logical units; the frame is four times that. */
const U = 4;

export const DOG_HUES: Hues = {
  line: '#17120d',
  coat: '#e8a856',
  coatDark: '#c9872f',
  cream: '#f3dcb4',
  muzzle: '#f0c98c',
  nose: '#2e2119',
  accent: '#c8513c',
  mouth: '#b4594f',
};

// ----------------------------------------------------------------- the face

function eyes(out: Shape[], cx: number, ey: number, style: Pose['eyes'], h: Hues): void {
  const put = (x: number): void => {
    switch (style) {
      case 'blink':
        out.push({ d: mark(p(x - 6, ey), p(x + 6, ey), -3), stroke: h.line, line: 2.6 });
        break;
      case 'happy':
        out.push({ d: mark(p(x - 6, ey + 3), p(x + 6, ey + 3), 5.5), stroke: h.line, line: 2.6 });
        break;
      case 'x':
        out.push({ d: mark(p(x - 5, ey - 5), p(x + 5, ey + 5)), stroke: h.line, line: 2.5 });
        out.push({ d: mark(p(x + 5, ey - 5), p(x - 5, ey + 5)), stroke: h.line, line: 2.5 });
        break;
      case 'wide':
        out.push({ d: ellipsePath(x, ey, 7.5, 8.5), fill: h.cream, line: LINE_IN });
        out.push({ d: ellipsePath(x, ey + 1, 4.2, 4.6), fill: h.line });
        break;
      case 'look':
        out.push({ d: ellipsePath(x, ey, 6.5, 7.5), fill: h.cream, line: LINE_IN });
        out.push({ d: ellipsePath(x + 2.4, ey + 1, 4, 4.4), fill: h.line });
        break;
      case 'open':
      default:
        out.push({ d: ellipsePath(x, ey, 5, 5.5), fill: h.line });
        break;
    }
  };
  put(cx - 13);
  put(cx + 13);
  // brows, the little dashes that give the face its mood
  if (style !== 'x') {
    const tilt = style === 'wide' ? 5 : 3;
    out.push({ d: mark(p(cx - 19, ey - 9), p(cx - 8, ey - 11 - tilt), 2), stroke: h.line, line: 2.4 });
    out.push({ d: mark(p(cx + 8, ey - 11 - tilt), p(cx + 19, ey - 9), 2), stroke: h.line, line: 2.4 });
  }
}

function mouth(out: Shape[], cx: number, my: number, style: Pose['mouth'], h: Hues): void {
  switch (style) {
    case 'open':
      out.push({ d: ellipsePath(cx, my + 3, 8, 6.5), fill: h.line });
      out.push({ d: ellipsePath(cx, my + 6, 4.6, 3.6), fill: h.mouth });
      break;
    case 'oh':
      out.push({ d: ellipsePath(cx, my + 3, 4.6, 5.6), fill: h.line });
      break;
    case 'flat':
      out.push({ d: mark(p(cx - 7, my + 1), p(cx + 7, my + 1)), stroke: h.line, line: 2.5 });
      break;
    case 'frown':
      out.push({ d: mark(p(cx - 8, my + 2), p(cx + 8, my + 2), 3.6), stroke: h.line, line: 2.5 });
      break;
    case 'smile':
    default:
      // the two-lobed dog smile
      out.push({ d: mark(p(cx - 9, my - 1), p(cx, my + 2), -3.4), stroke: h.line, line: 2.5 });
      out.push({ d: mark(p(cx, my + 2), p(cx + 9, my - 1), -3.4), stroke: h.line, line: 2.5 });
      break;
  }
}

/** The three short strokes that stand in for fur on a cheek or a haunch. */
function ticks(out: Shape[], x: number, y: number, dir: number, h: Hues): void {
  for (let i = 0; i < 3; i++) {
    const o = i * 5;
    out.push({
      d: mark(p(x + o * dir, y + i * 1.2), p(x + (o + 6) * dir, y - 6 + i * 1.2)),
      stroke: h.line,
      line: 2,
    });
  }
}

// ---------------------------------------------------------------- the front

function front(pose: Pose, h: Hues): Shape[] {
  const dx = (pose.dx ?? 0) * U;
  const dy = (pose.dy ?? 0) * U;
  const squash = (pose.squash ?? 0) * U;
  const ears = (pose.ears ?? 0) * U;
  const legs = pose.legs ?? 0;
  const X = (v: number): number => v + dx;
  const Y = (v: number): number => v + dy;
  const out: Shape[] = [];

  // Ears first: they hang behind the head.
  const ear = (sideOf: -1 | 1, extra: number): void => {
    const a = p(X(CX + sideOf * 19), Y(50));
    const c = p(X(CX + sideOf * 33), Y(70 + ears * 0.6 + extra));
    const b = p(X(CX + sideOf * 27), Y(92 + ears + extra));
    out.push({ d: ribbon(bend(a, c, b, 12), 17, 12), fill: h.coatDark, line: LINE });
  };
  // the two ears never hang quite alike, which is most of what stops a
  // symmetrical drawing looking stamped out
  ear(-1, 0);
  ear(1, 3);

  // Body: a long pear, narrow at the shoulder and heavy at the hip.
  out.push({
    d: ribbon([p(X(CX), Y(94)), p(X(CX), Y(146))], 42 + squash * 1.4, 58 + squash * 1.8),
    fill: h.coat,
    line: LINE,
  });

  // Legs, set wide enough to leave a notch between them.
  const lift: Record<number, [number, number]> = {
    0: [0, 0],
    1: [-6, 0],
    2: [-10, 0],
    3: [0, -6],
    4: [0, -10],
  };
  const [ll, rl] = lift[legs] ?? [0, 0];
  const leg = (sideOf: -1 | 1, up: number): void => {
    const top = p(X(CX + sideOf * 15), Y(150));
    const foot = p(X(CX + sideOf * 18), Y(BASELINE - 11 + up));
    out.push({ d: ribbon([top, foot], 25, 24), fill: h.coat, line: LINE });
  };
  leg(-1, ll);
  leg(1, rl);

  // Chest.
  out.push({
    d: ellipsePath(X(CX), Y(140), 11 + squash * 0.6, 17 - squash * 0.3),
    fill: h.cream,
    line: LINE_IN,
  });

  // Front paws. A lifted arm swings out as it goes up, and the two never
  // hang at the same height.
  const arm = (sideOf: -1 | 1, raw: number, extra: number): void => {
    const up = raw * U;
    const shoulder = p(X(CX + sideOf * 17), Y(102));
    const hand = p(X(CX + sideOf * (34 + Math.max(0, -up) * 0.32)), Y(152 + up + extra));
    const ctrl = p(X(CX + sideOf * 33), Y(126 + up * 0.5));
    out.push({ d: ribbon(bend(shoulder, ctrl, hand, 10), 20, 16), fill: h.coat, line: LINE });
  };
  arm(-1, pose.armL ?? 0, 0);
  arm(1, pose.armR ?? 0, 4);

  // Collar, just under the chin.
  out.push({
    d: ribbon(bend(p(X(CX - 16), Y(88)), p(X(CX), Y(97)), p(X(CX + 16), Y(88)), 8), 7.5, 7.5),
    fill: h.accent,
    line: LINE_IN,
  });
  out.push({ d: ellipsePath(X(CX), Y(100), 5, 5), fill: h.cream, line: LINE_IN });

  // Head, then the muzzle sitting proud of the chin.
  const hy = Y(64) + squash * 0.4;
  out.push({
    d: ellipsePath(X(CX), hy, 27 + squash * 0.5, 26 - squash * 0.3),
    fill: h.coat,
    line: LINE,
  });
  out.push({ d: ellipsePath(X(CX), hy + 15, 19, 14), fill: h.muzzle, line: LINE_IN });

  // Nose, with the little gloss every drawn nose has.
  out.push({ d: ellipsePath(X(CX), hy + 7, 7.5, 6.3), fill: h.nose, line: LINE_IN });
  out.push({ d: ellipsePath(X(CX) - 2.7, hy + 5, 2.5, 1.8), fill: '#ffffff', opacity: 0.5 });

  eyes(out, X(CX), hy - 6, pose.eyes ?? 'open', h);
  mouth(out, X(CX), hy + 18, pose.mouth ?? 'smile', h);
  ticks(out, X(CX) + 20, hy - 7, 1, h);

  return out;
}

// ----------------------------------------------------------------- the side

function side(pose: Pose, h: Hues): Shape[] {
  const dx = (pose.dx ?? 0) * U;
  const dy = (pose.dy ?? 0) * U;
  const ears = (pose.ears ?? 0) * U;
  const step = pose.legs ?? 0;
  const X = (v: number): number => v + dx;
  const Y = (v: number): number => v + dy;
  const out: Shape[] = [];

  // Four legs on a two-beat trot: the diagonal pairs swing together.
  const swing: Record<number, [number, number]> = {
    0: [0, 0],
    1: [7, -7],
    2: [12, -12],
    3: [-7, 7],
    4: [-12, 12],
  };
  const [fa, ba] = swing[step] ?? [0, 0];
  const paw = (x: number, reach: number, colour: string): void => {
    const foot = p(X(x + reach), Y(BASELINE - 10 + Math.abs(reach) * 0.2));
    out.push({ d: ribbon([p(X(x), Y(146)), foot], 19, 17), fill: colour, line: LINE });
  };
  paw(80, ba * 0.8, h.coatDark);
  paw(124, fa * 0.8, h.coatDark);

  // Tail, up and curling at a trot.
  const tw = (pose.tail ?? 0) * U;
  out.push({
    d: ribbon(bend(p(X(70), Y(128)), p(X(42), Y(110 - tw)), p(X(52), Y(80 - tw)), 12), 17, 8),
    fill: h.coat,
    line: LINE,
  });

  // Barrel of a body.
  out.push({ d: ribbon([p(X(76), Y(132)), p(X(126), Y(128))], 46, 52), fill: h.coat, line: LINE });
  out.push({ d: ellipsePath(X(104), Y(146), 24, 11), fill: h.cream, line: LINE_IN });

  paw(88, ba, h.coat);
  paw(132, fa, h.coat);

  // Ear, head, snout.
  out.push({
    d: ribbon(
      bend(p(X(140), Y(76)), p(X(125), Y(98 + ears * 0.6)), p(X(133), Y(118 + ears)), 10),
      20,
      14,
    ),
    fill: h.coatDark,
    line: LINE,
  });
  const hy = Y(96);
  out.push({ d: ellipsePath(X(142), hy, 24, 23), fill: h.coat, line: LINE });
  out.push({ d: ellipsePath(X(161), hy + 9, 14, 10), fill: h.muzzle, line: LINE_IN });
  out.push({
    d: ribbon(bend(p(X(120), Y(112)), p(X(131), Y(123)), p(X(145), Y(114)), 8), 7.5, 7.5),
    fill: h.accent,
    line: LINE_IN,
  });

  out.push({ d: ellipsePath(X(173), hy + 5, 6, 5.2), fill: h.nose, line: LINE_IN });
  if ((pose.eyes ?? 'open') === 'blink') {
    out.push({ d: mark(p(X(142), hy - 5), p(X(153), hy - 5), -2.4), stroke: h.line, line: 2.5 });
  } else {
    out.push({ d: ellipsePath(X(148), hy - 5, 4.6, 5), fill: h.line });
  }
  out.push({ d: mark(p(X(138), hy - 16), p(X(151), hy - 18), 2.4), stroke: h.line, line: 2.4 });
  out.push({ d: mark(p(X(162), hy + 15), p(X(172), hy + 13), -2.4), stroke: h.line, line: 2.4 });

  return out;
}

export const DOG: DrawnCharacter = {
  id: 'biscuit',
  hues: DOG_HUES,
  front,
  side,
};
