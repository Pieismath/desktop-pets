/**
 * A tiny pixel-art engine: everything is drawn on a low-resolution logical
 * grid (48x52) and upscaled 4x with nearest-neighbour into the locked
 * 192x208 frame. That keeps the sprite format unchanged while giving real,
 * chunky pixel art instead of smooth vector shapes.
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
}

/** Ember's normal coat: a warm ember orange. */
export const PAL_NORMAL: Palette = {
  out: [96, 42, 18, 255],
  dark: [178, 88, 34, 255],
  main: [226, 124, 57, 255],
  light: [246, 166, 95, 255],
  cream: [250, 226, 195, 255],
  eyeWhite: [255, 250, 242, 255],
  eyeDark: [43, 26, 16, 255],
};

/** "failed": the colour drains out. */
export const PAL_GREY: Palette = {
  out: [58, 62, 66, 255],
  dark: [116, 124, 130, 255],
  main: [150, 158, 165, 255],
  light: [182, 190, 196, 255],
  cream: [222, 226, 230, 255],
  eyeWhite: [245, 247, 248, 255],
  eyeDark: [45, 50, 54, 255],
};

/** "alarm": hot red. Two variants so the sprite can flash between frames. */
export const PAL_ALARM_A: Palette = {
  out: [110, 20, 14, 255],
  dark: [200, 46, 34, 255],
  main: [240, 74, 58, 255],
  light: [255, 128, 110, 255],
  cream: [255, 214, 205, 255],
  eyeWhite: [255, 250, 245, 255],
  eyeDark: [60, 12, 8, 255],
};

export const PAL_ALARM_B: Palette = {
  ...PAL_ALARM_A,
  dark: [168, 32, 22, 255],
  main: [212, 52, 38, 255],
  light: [240, 96, 78, 255],
};

export const LOGICAL_W = 48;
export const LOGICAL_H = 52;
export const UPSCALE = 4;

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

// ---------------------------------------------------------------- character

export type EyeStyle = 'open' | 'blink' | 'x' | 'wide' | 'happy' | 'look';
export type MouthStyle = 'smile' | 'open' | 'flat' | 'frown' | 'oh';

export interface Pose {
  /** Whole-body vertical offset, in logical pixels. */
  dy?: number;
  dx?: number;
  /** Leg animation phase: 0 = stand, 1..4 = walk cycle steps. */
  legs?: 0 | 1 | 2 | 3 | 4;
  /** Arm lift in pixels; negative raises the arm. */
  armL?: number;
  armR?: number;
  /** Ears droop (positive) or perk (negative). */
  ears?: number;
  tail?: number;
  eyes?: EyeStyle;
  mouth?: MouthStyle;
  /** Squash factor applied to the body block only. */
  squash?: number;
  shadow?: number;
}

const CX = 24;
const FEET_Y = 46;

/**
 * Draw Ember: a small fox-ish ember-orange critter. Body first (solid
 * silhouette), then one outline pass, then facial features on top so they
 * stay crisp.
 */
export function drawEmber(c: PixelCanvas, pose: Pose, pal: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const legs = pose.legs ?? 0;
  const ears = Math.round(pose.ears ?? 0);
  const squash = pose.squash ?? 0;

  // ground shadow (drawn first, never outlined)
  const sh = pose.shadow ?? 1;
  if (sh > 0) {
    c.ellipse(CX + dx * 0.5, FEET_Y + 2, 11 * sh, 2 * sh, [0, 0, 0, 46]);
  }

  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;

  // ---- legs (behind the body) ----
  const legPose: Record<number, [number, number, number, number]> = {
    // [leftXOff, leftLen, rightXOff, rightLen]
    0: [0, 7, 0, 7],
    1: [-2, 5, 2, 7],
    2: [-3, 4, 3, 6],
    3: [2, 7, -2, 5],
    4: [3, 6, -3, 4],
  };
  const [lx, ll, rx, rl] = legPose[legs] ?? legPose[0]!;
  c.rect(X(19 + lx), Y(FEET_Y - ll), 4, ll, pal.dark);
  c.rect(X(25 + rx), Y(FEET_Y - rl), 4, rl, pal.dark);
  // feet
  c.rect(X(18 + lx), Y(FEET_Y - 1), 6, 1, pal.out);
  c.rect(X(24 + rx), Y(FEET_Y - 1), 6, 1, pal.out);

  // ---- tail ----
  const tw = Math.round(pose.tail ?? 0);
  c.rect(X(30), Y(33), 3, 3, pal.dark);
  c.rect(X(32), Y(31 + tw), 3, 3, pal.dark);
  c.rect(X(34), Y(28 + tw * 2), 3, 4, pal.main);
  c.rect(X(35), Y(26 + tw * 2), 3, 3, pal.light);

  // ---- body ----
  const bw = 14 + squash;
  const bh = 13 - squash;
  c.round(X(CX - Math.floor(bw / 2)), Y(FEET_Y - 7 - bh), bw, bh, pal.main);
  // belly
  c.rect(X(CX - 4), Y(FEET_Y - 7 - bh + 4), 8, bh - 5, pal.cream);

  // ---- arms ----
  const al = Math.round(pose.armL ?? 0);
  const ar = Math.round(pose.armR ?? 0);
  c.rect(X(14), Y(FEET_Y - 18 + al), 3, 7 - Math.min(0, al), pal.dark);
  c.rect(X(31), Y(FEET_Y - 18 + ar), 3, 7 - Math.min(0, ar), pal.dark);

  // ---- head ----
  const headY = Y(11);
  c.round(X(15), headY, 18, 16, pal.main);
  // cheek shading
  c.rect(X(16), headY + 12, 16, 3, pal.dark);
  c.round(X(15), headY, 18, 16, null); // clear, then redraw so shading sits inside
  c.round(X(15), headY, 18, 16, pal.main);
  c.rect(X(17), headY + 11, 14, 3, pal.dark);
  // muzzle
  c.round(X(20), headY + 8, 8, 6, pal.cream);

  // ---- ears (short and pointed, not rabbit-tall) ----
  c.rect(X(16), headY - 4 + ears, 5, 5, pal.main);
  c.rect(X(17), headY - 5 + ears, 3, 2, pal.main);
  c.rect(X(27), headY - 4 + ears, 5, 5, pal.main);
  c.rect(X(28), headY - 5 + ears, 3, 2, pal.main);

  // one outline pass over the whole silhouette
  c.outline(pal.out);

  // inner ear (after outline so it stays inside)
  c.rect(X(17), headY - 4 + ears, 3, 4, pal.light);
  c.rect(X(28), headY - 4 + ears, 3, 4, pal.light);

  // ---- face ----
  drawEyes(c, X(0), headY, pose.eyes ?? 'open', pal);
  drawMouth(c, X(0), headY, pose.mouth ?? 'smile', pal);
}

function drawEyes(c: PixelCanvas, ox: number, headY: number, style: EyeStyle, pal: Palette): void {
  const ey = headY + 5;
  const put = (x: number) => {
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

function drawMouth(c: PixelCanvas, ox: number, headY: number, style: MouthStyle, pal: Palette): void {
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
  // nose
  c.rect(ox + 23, headY + 8, 2, 2, pal.out);
}

/**
 * Side profile, facing right — used for the walk cycle so the pet reads as
 * travelling along the Dock rather than shuffling on the spot. Mirror the
 * canvas for the leftward walk.
 */
export function drawEmberSide(c: PixelCanvas, pose: Pose, pal: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const step = pose.legs ?? 0;
  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;

  const sh = pose.shadow ?? 1;
  if (sh > 0) c.ellipse(CX + dx * 0.5, FEET_Y + 2, 12 * sh, 2 * sh, [0, 0, 0, 46]);

  // legs: front pair and back pair, swinging in opposition
  const swing: Record<number, [number, number, number, number]> = {
    //  [frontX, frontLen, backX, backLen] — longer legs, deeper swing
    0: [0, 9, 0, 9],
    1: [2, 8, -2, 9],
    2: [4, 5, -4, 8],
    3: [-2, 9, 2, 8],
    4: [-4, 8, 4, 5],
  };
  const [fx, fl, bx, bl] = swing[step] ?? swing[0]!;
  // back legs (darker, behind)
  c.rect(X(18 + bx), Y(FEET_Y - bl), 4, bl, pal.dark);
  c.rect(X(29 + bx), Y(FEET_Y - bl), 4, bl, pal.dark);
  // front legs
  c.rect(X(20 + fx), Y(FEET_Y - fl), 4, fl, pal.main);
  c.rect(X(31 + fx), Y(FEET_Y - fl), 4, fl, pal.main);

  // tail, sweeping up behind
  const tw = Math.round(pose.tail ?? 0);
  c.rect(X(12), Y(31 - tw), 4, 4, pal.dark);
  c.rect(X(9), Y(27 - tw * 2), 4, 5, pal.main);
  c.rect(X(8), Y(24 - tw * 2), 4, 4, pal.light);

  // body: a long horizontal block, sitting high enough that legs read
  c.round(X(15), Y(29), 20, 10, pal.main);
  c.rect(X(18), Y(34), 14, 4, pal.cream);

  // head in profile, at the right
  const headY = Y(18);
  c.round(X(28), headY, 13, 12, pal.main);
  // snout
  c.rect(X(39), headY + 5, 5, 5, pal.main);
  c.rect(X(40), headY + 4, 3, 2, pal.main);

  // ears
  const ears = Math.round(pose.ears ?? 0);
  c.rect(X(30), headY - 4 + ears, 5, 5, pal.main);
  c.rect(X(31), headY - 5 + ears, 3, 2, pal.main);
  c.rect(X(35), headY - 3 + ears, 4, 4, pal.dark);

  c.outline(pal.out);

  // inner ear + face details, after the outline pass
  c.rect(X(31), headY - 3 + ears, 3, 3, pal.light);

  // one visible eye
  if ((pose.eyes ?? 'open') === 'blink') {
    c.rect(X(34), headY + 5, 4, 1, pal.out);
  } else {
    c.rect(X(34), headY + 3, 4, 4, pal.eyeWhite);
    c.rect(X(35), headY + 4, 3, 3, pal.eyeDark);
    c.px(X(35), headY + 4, pal.eyeWhite);
  }
  // nose tip + mouth line
  c.rect(X(43), headY + 5, 2, 2, pal.out);
  c.rect(X(40), headY + 9, 3, 1, pal.out);
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
