/**
 * The finishing pass: what turns flat vector art into something that looks
 * drawn on paper.
 *
 * Three things do nearly all the work, and they are the three things you can
 * see in any picture-book illustration if you zoom in far enough:
 *
 *   grain       the fill is never flat. Fine speckle from the paper tooth,
 *               plus a slower mottle from uneven pigment.
 *   occlusion   colour goes deeper where it meets a line. Blurring the
 *               contour layer and multiplying it back in gives every form a
 *               soft inner shadow, including the ones inside the silhouette,
 *               which is what stops flat colour reading as a decal.
 *   warmth      a touch of the paper's own tone pulled through the fills.
 *
 * All of it is deterministic: the noise is hashed from a seed, so a pet
 * regenerates byte for byte.
 */
import sharp from 'sharp';
import { FRAME_H, FRAME_W, toSVG, type Scene } from './draw.js';

/** Supersample, then come back down. Keeps the contour clean at 192px. */
const SS = 3;

export interface PaperStyle {
  /** Depth of the inner shadow under every contour, 0..1. */
  occlusion: number;
  /** How far that shadow reaches, in frame pixels. */
  spread: number;
  /** Where the light is. The shadow gathers on the opposite side. */
  light: { x: number; y: number };
  /** Strength of the fine paper tooth, 0..1. */
  tooth: number;
  /** Strength of the slower pigment mottle, 0..1. */
  mottle: number;
}

export const DEFAULT_PAPER: PaperStyle = {
  occlusion: 0.13,
  spread: 9,
  light: { x: -0.5, y: -1 },
  tooth: 0.055,
  mottle: 0.045,
};

// ------------------------------------------------------------------- noise

function hash01(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x1f1f1f1f) ^ Math.imul(y | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise at a given cell size. */
function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash01(ix, iy, seed);
  const b = hash01(ix + 1, iy, seed);
  const c = hash01(ix, iy + 1, seed);
  const d = hash01(ix + 1, iy + 1, seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

// -------------------------------------------------------------------- blur

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  let cur = src;
  for (let pass = 0; pass < 3; pass++) {
    cur = blurAxis(cur, w, h, r, true);
    cur = blurAxis(cur, w, h, r, false);
  }
  return cur;
}

function blurAxis(src: Float32Array, w: number, h: number, r: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  const outer = horizontal ? h : w;
  const inner = horizontal ? w : h;
  const clamp = (v: number): number => Math.min(inner - 1, Math.max(0, v));
  for (let a = 0; a < outer; a++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) {
      const b = clamp(k);
      sum += (horizontal ? src[a * w + b] : src[b * w + a]) ?? 0;
    }
    for (let b = 0; b < inner; b++) {
      if (horizontal) out[a * w + b] = sum / n;
      else out[b * w + a] = sum / n;
      const drop = clamp(b - r);
      const add = clamp(b + r + 1);
      sum +=
        ((horizontal ? src[a * w + add] : src[add * w + a]) ?? 0) -
        ((horizontal ? src[a * w + drop] : src[drop * w + a]) ?? 0);
    }
  }
  return out;
}

// ------------------------------------------------------------------ finish

/**
 * Render a scene to a finished 192x208 PNG frame.
 *
 * `seed` fixes the grain. Pass the same one for every frame of a pet so the
 * paper does not crawl between frames of an animation.
 */
export async function renderScene(
  scene: Scene,
  seed = 1,
  style: PaperStyle = DEFAULT_PAPER,
): Promise<Buffer> {
  const W = FRAME_W * SS;
  const H = FRAME_H * SS;

  // the art, and a second pass with the contours alone, which is what the
  // inner shadow is built from
  const lines: Scene = {
    hues: scene.hues,
    shapes: scene.shapes
      .filter((s) => s.line || s.stroke)
      .map((s) => ({ ...s, fill: undefined, stroke: s.stroke ?? scene.hues.line })),
  };

  const [art, ink] = await Promise.all([
    sharp(Buffer.from(toSVG(scene, SS))).raw().toBuffer({ resolveWithObject: true }),
    sharp(Buffer.from(toSVG(lines, SS))).raw().toBuffer({ resolveWithObject: true }),
  ]);

  const px = art.data;
  const inkAlpha = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) inkAlpha[i] = (ink.data[i * 4 + 3] ?? 0) / 255;

  const occ = boxBlur(inkAlpha, W, H, Math.max(1, Math.round((style.spread * SS) / 3)));
  const ox = Math.round(style.light.x * style.spread * SS * 0.5);
  const oy = Math.round(style.light.y * style.spread * SS * 0.5);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const a = px[i * 4 + 3] ?? 0;
      if (a === 0) continue;

      // deeper colour where a contour is near, and on the shaded side
      const sx = Math.min(W - 1, Math.max(0, x + ox));
      const sy = Math.min(H - 1, Math.max(0, y + oy));
      const shade = Math.min(1, (occ[sy * W + sx] ?? 0) * 1.7) * style.occlusion;

      // paper tooth, plus a slower mottle of uneven pigment
      const tooth = (valueNoise(x, y, 3 * SS, seed) - 0.5) * 2 * style.tooth;
      const mottle = (valueNoise(x, y, 14 * SS, seed + 77) - 0.5) * 2 * style.mottle;
      const grain = 1 + tooth + mottle;

      for (let k = 0; k < 3; k++) {
        const v = px[i * 4 + k] ?? 0;
        // the shadow cools as it deepens, the way graphite over colour does
        const cool = k === 2 ? 1.04 : 1;
        px[i * 4 + k] = Math.max(0, Math.min(255, v * (1 - shade) * cool * grain));
      }
    }
  }

  return sharp(px, { raw: { width: W, height: H, channels: 4 } })
    .resize(FRAME_W, FRAME_H, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
}
