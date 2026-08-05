/**
 * A tiny pixel-art engine: everything is drawn on a low-resolution logical
 * grid (48x52) and upscaled 4x with nearest-neighbour into the locked
 * 192x208 frame. That keeps the sprite format unchanged while giving real,
 * chunky pixel art. Every pet in the app is built through here — hand-drawn
 * characters and image-derived ones alike — so they share one look.
 */

export type RGBA = readonly [number, number, number, number];

export const T: RGBA = [0, 0, 0, 0];

export interface Palette {
  out: RGBA;
  dark: RGBA;
  main: RGBA;
  light: RGBA;
  cream: RGBA;
  eyeWhite: RGBA;
  eyeDark: RGBA;
  /** Iris / detail colour. */
  accent: RGBA;
}

export const LOGICAL_W = 48;
export const LOGICAL_H = 52;
export const UPSCALE = 4;

/** Where every character's feet sit on the logical grid. */
export const LOGICAL_BASELINE = 46;

// ------------------------------------------------------------ colour maths

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Drain the colour out of a pixel, keeping its brightness. */
export function desaturate(c: RGBA, amount = 1): RGBA {
  const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  // nudge toward a cool grey so "failed" reads as drained, not just flat
  const g = lum * 0.9 + 18;
  return [clamp(c[0] + (g - c[0]) * amount), clamp(c[1] + (g - c[1]) * amount), clamp(c[2] + (g * 1.04 - c[2]) * amount), c[3]];
}

/** Push a pixel toward alarm red, keeping its relative brightness. */
export function towardRed(c: RGBA, amount = 0.75): RGBA {
  const lum = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  const target: RGBA = [clamp(90 + lum * 165), clamp(18 + lum * 70), clamp(14 + lum * 58), c[3]];
  return [
    clamp(c[0] + (target[0] - c[0]) * amount),
    clamp(c[1] + (target[1] - c[1]) * amount),
    clamp(c[2] + (target[2] - c[2]) * amount),
    c[3],
  ];
}

const mapPalette = (p: Palette, f: (c: RGBA) => RGBA): Palette => ({
  out: f(p.out),
  dark: f(p.dark),
  main: f(p.main),
  light: f(p.light),
  cream: f(p.cream),
  eyeWhite: f(p.eyeWhite),
  eyeDark: f(p.eyeDark),
  accent: f(p.accent),
});

/** "failed": the colour drains out of whatever the character normally is. */
export function greyPalette(p: Palette): Palette {
  return mapPalette(p, (c) => desaturate(c));
}

/** "alarm": hot red, in two shades so the sprite can flash between frames. */
export function alarmPalette(p: Palette, bright: boolean): Palette {
  return mapPalette(p, (c) => towardRed(c, bright ? 0.82 : 0.92));
}

export type PaletteKind = 'normal' | 'grey' | 'alarmA' | 'alarmB';

export function resolvePalette(normal: Palette, kind: PaletteKind): Palette {
  switch (kind) {
    case 'grey':
      return greyPalette(normal);
    case 'alarmA':
      return alarmPalette(normal, true);
    case 'alarmB':
      return alarmPalette(normal, false);
    default:
      return normal;
  }
}

// ------------------------------------------------------------------ canvas

/** Indexed pixel canvas with an automatic silhouette outline pass. */
export class PixelCanvas {
  readonly w: number;
  readonly h: number;
  private readonly buf: (RGBA | null)[];

  constructor(w = LOGICAL_W, h = LOGICAL_H) {
    this.w = w;
    this.h = h;
    this.buf = new Array<RGBA | null>(w * h).fill(null);
  }

  px(x: number, y: number, c: RGBA | null): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    this.buf[yi * this.w + xi] = c;
  }

  get(x: number, y: number): RGBA | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.buf[y * this.w + x] ?? null;
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA | null): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  /** Rect with the four corner pixels removed — reads as rounded at this scale. */
  round(x: number, y: number, w: number, h: number, c: RGBA | null): void {
    this.rect(x, y, w, h, c);
    this.px(x, y, null);
    this.px(x + w - 1, y, null);
    this.px(x, y + h - 1, null);
    this.px(x + w - 1, y + h - 1, null);
  }

  /** Filled ellipse, useful for shadows. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA | null): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
    }
  }

  /**
   * Blit raw RGBA pixels (an already-pixelated image) at a position, skipping
   * near-transparent pixels and optionally recolouring each one.
   */
  blitRaw(
    data: Buffer | Uint8Array,
    srcW: number,
    srcH: number,
    left: number,
    top: number,
    recolour?: (c: RGBA) => RGBA,
  ): void {
    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < srcW; x++) {
        const o = (y * srcW + x) * 4;
        const a = data[o + 3] ?? 0;
        if (a < 40) continue;
        let c: RGBA = [data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0, 255];
        if (recolour) c = recolour(c);
        this.px(left + x, top + y, c);
      }
    }
  }

  /** Add a 1px outline around every filled region. Run before drawing features. */
  outline(c: RGBA): void {
    const edges: Array<[number, number]> = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        const near =
          this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1);
        if (near) edges.push([x, y]);
      }
    }
    for (const [x, y] of edges) this.px(x, y, c);
  }

  /** Mirror the canvas horizontally (running-left from running-right). */
  mirrored(): PixelCanvas {
    const out = new PixelCanvas(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) out.px(this.w - 1 - x, y, this.get(x, y));
    }
    return out;
  }

  /** Nearest-neighbour upscale into a raw RGBA buffer. */
  toRawRGBA(scale = UPSCALE): { data: Buffer; width: number; height: number } {
    const width = this.w * scale;
    const height = this.h * scale;
    const data = Buffer.alloc(width * height * 4, 0);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        for (let j = 0; j < scale; j++) {
          for (let i = 0; i < scale; i++) {
            const o = ((y * scale + j) * width + (x * scale + i)) * 4;
            data[o] = c[0];
            data[o + 1] = c[1];
            data[o + 2] = c[2];
            data[o + 3] = c[3];
          }
        }
      }
    }
    return { data, width, height };
  }
}

// ------------------------------------------------------------------- poses

export type EyeStyle = 'open' | 'blink' | 'x' | 'wide' | 'happy' | 'look';
export type MouthStyle = 'smile' | 'open' | 'flat' | 'frown' | 'oh';

export interface Pose {
  /** Whole-body vertical offset, in logical pixels. */
  dy?: number;
  dx?: number;
  /** Leg animation phase: 0 = stand, 1..4 = walk cycle steps. */
  legs?: 0 | 1 | 2 | 3 | 4;
  /** Limb lift in pixels; negative raises. */
  armL?: number;
  armR?: number;
  /** Ears droop (positive) or perk (negative). */
  ears?: number;
  tail?: number;
  eyes?: EyeStyle;
  mouth?: MouthStyle;
  /** Squash factor applied to the body block only. */
  squash?: number;
}

/** A drawable character: the same pose vocabulary, two viewpoints. */
export interface PixelCharacter {
  id: string;
  palette: Palette;
  /** Front-facing: idle, working, waiting, alarm, … */
  draw(c: PixelCanvas, pose: Pose, pal: Palette): void;
  /** Side profile, facing right — used for the walk cycle. */
  drawSide(c: PixelCanvas, pose: Pose, pal: Palette): void;
}

// ---------------------------------------------------------------- overlays

export function drawGear(c: PixelCanvas, x: number, y: number, phase: number): void {
  const body: RGBA = [150, 160, 172, 255];
  const edge: RGBA = [92, 102, 114, 255];
  c.round(x, y, 7, 7, body);
  const teeth = phase % 2 === 0
    ? [[3, -1], [3, 7], [-1, 3], [7, 3]]
    : [[0, 0], [6, 0], [0, 6], [6, 6]];
  for (const [tx, ty] of teeth) c.px(x + (tx as number), y + (ty as number), edge);
  c.rect(x + 3, y + 3, 1, 1, edge);
}

export function drawMagnifier(c: PixelCanvas, x: number, y: number): void {
  const rim: RGBA = [96, 106, 120, 255];
  const glass: RGBA = [186, 226, 240, 200];
  c.round(x, y, 8, 8, rim);
  c.rect(x + 1, y + 1, 6, 6, glass);
  c.rect(x + 7, y + 7, 3, 3, rim);
}

export function drawWarning(c: PixelCanvas, x: number, y: number, bright: boolean): void {
  const fill: RGBA = bright ? [255, 214, 64, 255] : [206, 160, 30, 255];
  const edge: RGBA = [70, 44, 0, 255];
  for (let r = 0; r < 6; r++) c.rect(x + 5 - r, y + r, 1 + r * 2, 1, fill);
  c.rect(x, y + 6, 11, 1, fill);
  c.rect(x + 5, y + 2, 1, 2, edge);
  c.px(x + 5, y + 5, edge);
}

export function drawCloud(c: PixelCanvas, x: number, y: number, rain: boolean): void {
  const g: RGBA = [138, 150, 162, 255];
  c.rect(x + 2, y + 2, 12, 4, g);
  c.rect(x, y + 4, 16, 3, g);
  c.rect(x + 5, y, 6, 3, g);
  if (rain) {
    c.rect(x + 3, y + 8, 1, 2, [110, 150, 200, 255]);
    c.rect(x + 9, y + 9, 1, 2, [110, 150, 200, 255]);
  }
}

export function drawSparkle(c: PixelCanvas, x: number, y: number): void {
  const s: RGBA = [255, 226, 120, 255];
  c.px(x, y - 2, s);
  c.px(x, y + 2, s);
  c.px(x - 2, y, s);
  c.px(x + 2, y, s);
  c.px(x, y, s);
}

export function drawDots(c: PixelCanvas, x: number, y: number, active: number): void {
  for (let i = 0; i < 3; i++) {
    const on = i === active;
    c.rect(x + i * 4, y - (on ? 1 : 0), 2, 2, on ? [246, 166, 95, 255] : [150, 120, 96, 200]);
  }
}

