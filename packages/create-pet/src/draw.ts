/**
 * Vector drawing for pets, in the picture-book idiom: smooth closed curves,
 * a heavy black contour on every form, flat colour underneath.
 *
 * A character is a list of shapes in painter's order, authored directly in
 * the 192x208 sprite cell. No grid, no pixels. Every form is built from one
 * of three primitives, which is all this style actually needs:
 *
 *   ellipsePath  heads, muzzles, eyes, cheeks
 *   ribbon       anything with a length and a thickness: ears, arms, legs,
 *                tails, and the body itself, which is a fat tapered capsule
 *   spline       a shape whose outline you want to place by hand
 *
 * The paper grain, the soft inner shading and the slight warmth all arrive
 * later, in paper.ts. What leaves here is clean flat art.
 */

import type { Pose } from './pixel.js';

export interface P {
  x: number;
  y: number;
}

export const p = (x: number, y: number): P => ({ x, y });

/** The sprite cell every character is drawn inside. */
export const FRAME_W = 192;
export const FRAME_H = 208;
/** Where the feet sit. */
export const BASELINE = 196;

// ------------------------------------------------------------------ colour

export interface Hues {
  /** The contour. Near black, never pure, so it sits on warm paper. */
  line: string;
  coat: string;
  /** Ear insides, the underside of a form, anywhere the coat goes deeper. */
  coatDark: string;
  /** Chest, paws, the white of an eye. */
  cream: string;
  /** The muzzle, which belongs to the coat rather than to the chest. */
  muzzle: string;
  nose: string;
  /** Collar, scarf, whatever the character is wearing. */
  accent: string;
  /** Tongue, inner mouth. */
  mouth: string;
}

const hex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

const parse = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];

const mapHues = (h: Hues, f: (c: string) => string): Hues => ({
  // the contour is ink on paper; it does not drain or catch fire with the rest
  line: h.line,
  coat: f(h.coat),
  coatDark: f(h.coatDark),
  cream: f(h.cream),
  muzzle: f(h.muzzle),
  nose: f(h.nose),
  accent: f(h.accent),
  mouth: f(h.mouth),
});

/** "failed": the colour drains out, toward a cool grey. */
export function drained(h: Hues): Hues {
  return mapHues(h, (c) => {
    const [r, g, b] = parse(c);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const v = lum * 0.9 + 18;
    return hex(v, v, v * 1.04);
  });
}

/** "alarm": everything runs hot, in two shades so it can flash. */
export function alarmed(h: Hues, bright: boolean): Hues {
  const amount = bright ? 0.82 : 0.92;
  return mapHues(h, (c) => {
    const [r, g, b] = parse(c);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const t: [number, number, number] = [90 + lum * 165, 18 + lum * 70, 14 + lum * 58];
    return hex(r + (t[0] - r) * amount, g + (t[1] - g) * amount, b + (t[2] - b) * amount);
  });
}

export type PaletteKind = 'normal' | 'grey' | 'alarmA' | 'alarmB';

export function resolveHues(h: Hues, kind: PaletteKind): Hues {
  switch (kind) {
    case 'grey':
      return drained(h);
    case 'alarmA':
      return alarmed(h, true);
    case 'alarmB':
      return alarmed(h, false);
    default:
      return h;
  }
}

// ------------------------------------------------------------------- paths

const f = (n: number): string => (Math.round(n * 10) / 10).toString();

/** Points along a quadratic curve, for a limb or an ear that bends. */
export function bend(a: P, ctrl: P, b: P, steps = 10): P[] {
  const out: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y,
    });
  }
  return out;
}

/** Catmull-Rom through the points, as cubic bezier segments. */
function through(pts: P[], closed: boolean): string {
  const n = pts.length;
  const at = (i: number): P =>
    closed ? pts[((i % n) + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!;
  let d = '';
  const last = closed ? n - 1 : n - 2;
  for (let i = 0; i <= last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = p(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6);
    const c2 = p(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6);
    d += `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/** A closed smooth outline through hand-placed points. */
export function spline(pts: P[]): string {
  if (pts.length < 3) return '';
  return `M${f(pts[0]!.x)} ${f(pts[0]!.y)}` + through(pts, true) + 'Z';
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M${f(cx - rx)} ${f(cy)}` +
    `A${f(rx)} ${f(ry)} 0 0 1 ${f(cx + rx)} ${f(cy)}` +
    `A${f(rx)} ${f(ry)} 0 0 1 ${f(cx - rx)} ${f(cy)}Z`
  );
}

/**
 * The outline of a thickness travelling along a centreline, with round caps.
 *
 * This is the workhorse. An ear, an arm, a leg, a tail and the body itself
 * are all the same thing: a path with a width that changes along it. Giving
 * the two ends different widths is what stops a limb reading as a pipe.
 */
export function ribbon(path: P[], w0: number, w1: number, taper = 1): string {
  if (path.length < 2) return '';
  const n = path.length;
  const widthAt = (i: number): number => {
    const t = i / (n - 1);
    // ease the taper so the thickness does not fall off in a straight line
    const e = taper === 1 ? t : t ** taper;
    return (w0 + (w1 - w0) * e) / 2;
  };
  const normalAt = (i: number): P => {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(n - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return p(dy / len, -dx / len);
  };

  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i < n; i++) {
    const r = widthAt(i);
    const nn = normalAt(i);
    left.push(p(path[i]!.x + nn.x * r, path[i]!.y + nn.y * r));
    right.push(p(path[i]!.x - nn.x * r, path[i]!.y - nn.y * r));
  }

  const rEnd = widthAt(n - 1);
  const rStart = widthAt(0);
  return (
    `M${f(left[0]!.x)} ${f(left[0]!.y)}` +
    through(left, false) +
    `A${f(rEnd)} ${f(rEnd)} 0 0 1 ${f(right[n - 1]!.x)} ${f(right[n - 1]!.y)}` +
    through(right.slice().reverse(), false) +
    `A${f(rStart)} ${f(rStart)} 0 0 1 ${f(left[0]!.x)} ${f(left[0]!.y)}Z`
  );
}

/** An open drawn line: a brow, a whisker tick, a crease. */
export function mark(a: P, b: P, curve = 0): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (dy / len) * curve;
  const cy = my - (dx / len) * curve;
  return `M${f(a.x)} ${f(a.y)}Q${f(cx)} ${f(cy)} ${f(b.x)} ${f(b.y)}`;
}

// ------------------------------------------------------------------ shapes

export interface Shape {
  d: string;
  fill?: string;
  /** Contour weight. Omit for no contour; 0 for a filled detail like an eye. */
  line?: number;
  /** An open stroke rather than a filled form. */
  stroke?: string;
  /** Round the ends of an open stroke. */
  cap?: boolean;
  opacity?: number;
}

export interface Scene {
  shapes: Shape[];
  hues: Hues;
}

/**
 * A drawn character: the same pose vocabulary every pet shares, two
 * viewpoints. It returns shapes rather than painting, so the finishing pass
 * can render the art and its contours separately.
 */
export interface DrawnCharacter {
  id: string;
  hues: Hues;
  /** Front-facing: idle, working, waiting, alarm, … */
  front(pose: Pose, h: Hues): Shape[];
  /** Side profile, facing right, used for the walk cycle. */
  side(pose: Pose, h: Hues): Shape[];
}

/**
 * The weight of the main contour, in frame pixels.
 *
 * Kept deliberately fine. A picture-book line is thin against the figure it
 * encloses; go heavier and the ink stops describing the form and starts
 * being the form, which is what makes a drawing read as a sticker.
 */
export const LINE = 2.9;
/** A lighter line, for forms sitting inside the silhouette. */
export const LINE_IN = 2.3;

export function toSVG(scene: Scene, scale = 2): string {
  const body = scene.shapes
    .map((s) => {
      const bits = [`d="${s.d}"`];
      if (s.stroke) {
        bits.push(`fill="none"`, `stroke="${s.stroke}"`, `stroke-width="${s.line ?? LINE_IN}"`);
        bits.push(`stroke-linecap="${s.cap === false ? 'butt' : 'round'}"`);
      } else {
        bits.push(`fill="${s.fill ?? 'none'}"`);
        if (s.line) {
          bits.push(`stroke="${scene.hues.line}"`, `stroke-width="${s.line}"`);
          bits.push('stroke-linejoin="round"', 'stroke-linecap="round"');
        }
      }
      if (s.opacity !== undefined) bits.push(`opacity="${s.opacity}"`);
      return `<path ${bits.join(' ')}/>`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W * scale}" height="${FRAME_H * scale}" ` +
    `viewBox="0 0 ${FRAME_W} ${FRAME_H}">${body}</svg>`
  );
}
