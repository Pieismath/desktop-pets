/**
 * A rig for a flat drawing: find the parts worth moving, then move them.
 *
 * A single illustration has no limbs to pose, so `from-drawing.ts` could only
 * ever slide and scale the whole figure, which reads as a sticker being
 * shoved around rather than a character. This finds a character's extremities
 * from its own silhouette and deforms them, so ears swing, arms wave, feet
 * step and arms swing while the drawing stays the drawing.
 *
 * Handles come in two kinds and it matters which. A translation drags a
 * region in a straight line, which is right for a foot taking a step. A
 * rotation turns it about a pivot, which is the only way an ear or an arm
 * looks attached to anything: real ones sweep an arc from a fixed base, and
 * sliding the tip sideways instead reads as rubber.
 *
 * The face is deliberately never deformed. A warped face stops looking like
 * the character immediately, and no amount of liveliness is worth that, so
 * the head only ever moves as a whole and expression stays the pose engine's
 * business.
 */
import sharp from 'sharp';
import type { SpriteStateName } from '@desktop-pets/shared';
import type { Pose } from './pixel.js';

export interface Art {
  data: Buffer;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Landmarks {
  crown: Point;
  headC: Point;
  earL: Point;
  earR: Point;
  earBaseL: Point;
  earBaseR: Point;
  /** Absent when the arm is tucked against the body and never protrudes. */
  handL?: Point;
  handR?: Point;
  shoulderL?: Point;
  shoulderR?: Point;
  footL: Point;
  footR: Point;
  waist: Point;
}

/** A region pushed in a straight line, or turned about `pivot`. */
export interface Handle extends Point {
  /** Radius of influence, in art pixels. */
  r: number;
  dx?: number;
  dy?: number;
  /** Radians; requires `pivot`. */
  rot?: number;
  pivot?: Point;
}

interface RowSpan {
  l: number;
  r: number;
  n: number;
}

const ALPHA = 80;
const DEG = Math.PI / 180;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function rowSpans(art: Art): RowSpan[] {
  const { data, w, h } = art;
  const rows: RowSpan[] = [];
  for (let y = 0; y < h; y++) {
    let l = -1;
    let r = -1;
    let n = 0;
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! > ALPHA) {
        if (l < 0) l = x;
        r = x;
        n++;
      }
    }
    rows.push({ l: l < 0 ? 0 : l, r: r < 0 ? 0 : r, n });
  }
  return rows;
}

/** Contiguous opaque runs on one row, used to tell two feet from one. */
function runsOn(art: Art, y: number, minLen = 2): Array<{ x0: number; x1: number }> {
  const { data, w } = art;
  const runs: Array<{ x0: number; x1: number }> = [];
  let start = -1;
  for (let x = 0; x <= w; x++) {
    const on = x < w && data[(y * w + x) * 4 + 3]! > ALPHA;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      if (x - start >= minLen) runs.push({ x0: start, x1: x - 1 });
      start = -1;
    }
  }
  return runs;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/**
 * Locate the movable parts, and the pivots they turn about, from the
 * silhouette alone.
 *
 * Every candidate was briefed to stand square to the viewer, which is what
 * makes this tractable: ears in the top fifth, feet along the floor, and a
 * hand wherever the outline juts clear of the body's own column. That last
 * test is why a tucked arm reports nothing rather than reporting the cheek,
 * which is what a plain widest-row search does on a big-headed character.
 */
export function findLandmarks(art: Art): Landmarks {
  const { w, h } = art;
  const rows = rowSpans(art);

  const earBand = Math.max(2, Math.floor(h * 0.22));
  let earRow = 0;
  for (let y = 0; y < earBand; y++) if (rows[y]!.n > rows[earRow]!.n) earRow = y;
  const ear = rows[earRow]!;

  const topY = Math.max(0, rows.findIndex((r) => r.n > 0));
  const top = rows[topY]!;

  // The head is the widest mass in the upper half; its centre is the anchor
  // ears pivot from and the point the whole head nods about.
  const headBand = Math.floor(h * 0.45);
  let headRow = 0;
  for (let y = 0; y < headBand; y++) if (rows[y]!.n > rows[headRow]!.n) headRow = y;
  const head = rows[headRow]!;
  const headC = { x: (head.l + head.r) / 2, y: headRow };

  const earL = { x: ear.l, y: Math.max(2, earRow) };
  const earR = { x: ear.r, y: Math.max(2, earRow) };
  // An ear turns about where it meets the head, not about its own tip.
  const base = (tip: Point): Point => ({
    x: lerp(tip.x, headC.x, 0.7),
    y: lerp(tip.y, headC.y, 0.8),
  });

  // Hands: the outline's furthest excursion past the body's median edge. A
  // limb held against the side never clears the threshold, and is left out.
  const bodyLo = Math.floor(h * 0.3);
  const bodyHi = Math.floor(h * 0.92);
  const band = rows.slice(bodyLo, bodyHi);
  const midL = median(band.map((r) => r.l));
  const midR = median(band.map((r) => r.r));
  const reach = w * 0.1;
  let handL: Point | undefined;
  let handR: Point | undefined;
  let bestL = midL - reach;
  let bestR = midR + reach;
  for (let y = bodyLo; y < bodyHi; y++) {
    const row = rows[y]!;
    if (row.n === 0) continue;
    if (row.l < bestL) {
      bestL = row.l;
      handL = { x: row.l, y };
    }
    if (row.r > bestR) {
      bestR = row.r;
      handR = { x: row.r, y };
    }
  }
  // Shoulders sit inboard of the hand and a little above it, which is close
  // enough for an arc that reads right at pet size.
  const shoulderL = handL ? { x: lerp(handL.x, midL, 0.85), y: handL.y - h * 0.07 } : undefined;
  const shoulderR = handR ? { x: lerp(handR.x, midR, 0.85), y: handR.y - h * 0.07 } : undefined;

  // Feet: the two lowest separate runs; one run means they are joined.
  let runs = runsOn(art, h - 3);
  for (let y = h - 3; y > h * 0.86 && runs.length < 2; y--) runs = runsOn(art, y);
  let footL: Point;
  let footR: Point;
  if (runs.length >= 2) {
    runs.sort((a, b) => a.x0 - b.x0);
    const a = runs[0]!;
    const b = runs[runs.length - 1]!;
    footL = { x: (a.x0 + a.x1) / 2, y: h - 2 };
    footR = { x: (b.x0 + b.x1) / 2, y: h - 2 };
  } else {
    const r = rows[Math.max(0, h - 3)]!;
    footL = { x: r.l + (r.r - r.l) * 0.3, y: h - 2 };
    footR = { x: r.l + (r.r - r.l) * 0.7, y: h - 2 };
  }

  return {
    crown: { x: (top.l + top.r) / 2, y: topY },
    headC,
    earL,
    earR,
    earBaseL: base(earL),
    earBaseR: base(earR),
    handL,
    handR,
    shoulderL,
    shoulderR,
    footL,
    footR,
    waist: { x: w / 2, y: Math.floor(h * 0.72) },
  };
}

/** 1 at the handle, easing to 0 at its radius. */
const falloff = (t: number): number => (t <= 0 ? 1 : t >= 1 ? 0 : 1 - t * t * (3 - 2 * t));

/**
 * Warp the art by a set of handles.
 *
 * Each handle defines a displacement field; they are blended by influence and
 * normalised where they overlap. Without that normalisation a point reached
 * by two handles travels twice as far and the figure pulls apart. Inverse
 * mapped and bilinear sampled, so the result never tears or leaves holes.
 */
export function warp(art: Art, handles: Handle[]): Art {
  const { data, w, h } = art;
  const live = handles.filter((k) => k.dx || k.dy || k.rot);
  if (live.length === 0) return art;

  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let wx = 0;
      let wy = 0;
      let tot = 0;
      for (const k of live) {
        const weight = falloff(Math.hypot(x - k.x, y - k.y) / k.r);
        if (weight <= 0) continue;
        if (k.rot && k.pivot) {
          const px = x - k.pivot.x;
          const py = y - k.pivot.y;
          const c = Math.cos(k.rot);
          const s = Math.sin(k.rot);
          wx += weight * (px * c - py * s - px);
          wy += weight * (px * s + py * c - py);
        } else {
          wx += weight * (k.dx ?? 0);
          wy += weight * (k.dy ?? 0);
        }
        tot += weight;
      }
      const scale = tot > 1 ? 1 / tot : 1;
      const sx = x - wx * scale;
      const sy = y - wy * scale;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = data[(y0 * w + x0) * 4 + c]!;
        const p10 = data[(y0 * w + x1) * 4 + c]!;
        const p01 = data[(y1 * w + x0) * 4 + c]!;
        const p11 = data[(y1 * w + x1) * 4 + c]!;
        out[o + c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
      }
    }
  }
  return { data: out, w, h };
}

/** Degrees of ear swing and arm lift for one frame of one state. */
interface Beat {
  /** Ear rotation, degrees. */
  ear: number;
  /** Ear swing lags the head, so the second ear trails the first. */
  earLag?: number;
  /** Arm rotation, degrees; positive lifts. */
  arm?: number;
}

/**
 * The movement curve for one frame of one state.
 *
 * These are continuous functions of the frame index rather than readings off
 * the pose, because the pose's own values were written for grid characters
 * and only step between whole pixels — an ear that can be "up" or "down" and
 * nothing between. A rig can hold any angle, so it is worth describing the
 * motion properly and letting the pose supply only what it alone knows: which
 * leg leads, and how far an arm is raised.
 */
function beatFor(state: SpriteStateName, i: number, frames: number): Beat {
  const t = (i / frames) * Math.PI * 2;
  const wave = Math.sin(t);
  const lag = Math.sin(t - 0.9);

  switch (state) {
    case 'idle':
      return { ear: wave * 5, earLag: lag * 6.5 };
    case 'waiting':
      return { ear: wave * 8, earLag: lag * 10 };
    case 'working':
      return { ear: wave * 4.5, earLag: lag * 6 };
    case 'review':
      return { ear: wave * 5, earLag: lag * 6 };
    case 'running-right':
    case 'running-left':
      // Ears stream backwards and bounce with the gait.
      return { ear: -9 + Math.sin(t * 2) * 5, earLag: -11 + lag * 5 };
    case 'waving':
      return { ear: wave * 9, earLag: lag * 12 };
    case 'jumping': {
      // Ears fly up off the ground and trail on the way down.
      const air = [0.1, -0.9, -1, -0.5, 0.3][i] ?? 0;
      return { ear: air * 14, earLag: air * 18 };
    }
    case 'failed': {
      // One slow droop that keeps going; the sheet holds the last frame.
      const k = i / Math.max(1, frames - 1);
      return { ear: 16 * k, earLag: 20 * k };
    }
    case 'alarm': {
      const buzz = i % 2 === 0 ? 1 : -1;
      return { ear: buzz * 9, earLag: -buzz * 11 };
    }
    default:
      return { ear: 0 };
  }
}

/**
 * Turn one frame into handle displacements.
 *
 * Amplitudes are fractions of the figure's height, so a tall thin character
 * and a squat one move by the same proportion rather than the same pixels.
 */
export function handlesFor(
  lm: Landmarks,
  pose: Pose,
  h: number,
  state: SpriteStateName,
  i: number,
  frames: number,
): Handle[] {
  const out: Handle[] = [];
  const beat = beatFor(state, i, frames);
  const earR = h * 0.2;
  const limbR = h * 0.17;

  // Ears swing about their base. The two carry different phases so they never
  // move as one rigid lump, which is the thing that looks mechanical.
  if (beat.ear || beat.earLag) {
    out.push({ ...lm.earL, r: earR, rot: beat.ear * DEG, pivot: lm.earBaseL });
    out.push({ ...lm.earR, r: earR, rot: (beat.earLag ?? beat.ear) * DEG, pivot: lm.earBaseR });
  }

  // Head tilt and nod are deliberately not baked here. They are whole-body
  // moves, and the renderer's motion layer already does them at display
  // framerate without resampling the art; doing them twice only softens the
  // drawing and fights the layer that does it better.

  // A walk: feet swing in opposition and lift on the forward half. The pose
  // owns this, because it owns which leg is leading.
  const legs = pose.legs ?? 0;
  if (legs > 0) {
    const phase = ((legs - 1) / 4) * Math.PI * 2;
    const swing = Math.cos(phase) * h * 0.075;
    const lift = (s: number): number => -Math.max(0, s) * 0.6;
    out.push({ ...lm.footL, r: limbR, dx: swing, dy: lift(swing) });
    out.push({ ...lm.footR, r: limbR, dx: -swing, dy: lift(-swing) });
  }

  // Arms rotate from the shoulder. The pose names the character's own left
  // and right, so they cross over: facing the viewer, its right arm is the
  // one on the left of the picture.
  const armImageL = pose.armR ?? 0;
  const armImageR = pose.armL ?? 0;
  const armDeg = (v: number): number => -v * 3.4;
  if (lm.handL && lm.shoulderL && armImageL !== 0) {
    out.push({ ...lm.handL, r: limbR, rot: -armDeg(armImageL) * DEG, pivot: lm.shoulderL });
  }
  if (lm.handR && lm.shoulderR && armImageR !== 0) {
    out.push({ ...lm.handR, r: limbR, rot: armDeg(armImageR) * DEG, pivot: lm.shoulderR });
  }
  // A raised arm the silhouette never showed still deserves to move, so the
  // wave is carried by the ears rather than lost.
  if ((armImageL || armImageR) && !lm.handL && !lm.handR) {
    const v = armImageL || armImageR;
    out.push({ ...lm.earR, r: earR, rot: v * 1.6 * DEG, pivot: lm.earBaseR });
  }

  return out;
}

export async function loadArt(input: Buffer | string, maxW: number, maxH: number): Promise<Art> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .resize(Math.round(maxW), Math.round(maxH), {
      fit: 'inside',
      kernel: 'lanczos3',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
