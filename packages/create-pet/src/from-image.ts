/**
 * Turn one ordinary picture into a pixel-art pet.
 *
 * The image is trimmed, reduced to a small logical sprite with
 * nearest-neighbour sampling, then driven through the *same* pose engine and
 * overlays the hand-drawn characters use. So a pet you make from a photo or a
 * doodle animates identically to the bundled ones and shares their look —
 * chunky pixels, the same ground line, the same grey "failed" wash and red
 * "alarm" flash.
 */
import sharp from 'sharp';
import { SPRITE_STATES } from '@desktop-pets/shared';
import type { SpriteStateName } from '@desktop-pets/shared';
import {
  LOGICAL_BASELINE,
  PixelCanvas,
  desaturate,
  drawShadow,
  towardRed,
  type RGBA,
} from './pixel.js';
import { frameFor } from './poses.js';
import { composeSheetWebp, type FrameCell } from './sheet.js';

const CX = 24;
/** How much of the logical grid the character may occupy — matched to the
 *  hand-drawn characters so an image pet isn't noticeably smaller. */
const MAX_W = 34;
const MAX_H = 38;

interface Sprite {
  data: Buffer;
  w: number;
  h: number;
}

/** Reduce the source art to a small sprite, hard pixels, alpha preserved. */
async function pixelate(input: Buffer | string): Promise<Sprite> {
  const base = sharp(input).ensureAlpha().trim({ threshold: 10 });
  const { data, info } = await base
    .resize(MAX_W, MAX_H, {
      fit: 'inside',
      kernel: 'nearest',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Squash/stretch the sprite, still nearest-neighbour. */
async function scaled(sprite: Sprite, w: number, h: number): Promise<Sprite> {
  if (w === sprite.w && h === sprite.h) return sprite;
  const { data, info } = await sharp(sprite.data, { raw: { width: sprite.w, height: sprite.h, channels: 4 } })
    .resize(Math.max(1, w), Math.max(1, h), { fit: 'fill', kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function recolourFor(kind: string): ((c: RGBA) => RGBA) | undefined {
  if (kind === 'grey') return (c) => desaturate(c);
  if (kind === 'alarmA') return (c) => towardRed(c, 0.82);
  if (kind === 'alarmB') return (c) => towardRed(c, 0.92);
  return undefined;
}

async function renderFrame(sprite: Sprite, state: SpriteStateName, i: number): Promise<Buffer> {
  const f = frameFor(state, i);
  const pose = f.pose;
  const c = new PixelCanvas();

  drawShadow(c, CX, pose.dx ?? 0, pose.shadow ?? 1);

  // Only the whole-body parts of the pose apply to an arbitrary image; limb
  // and ear offsets belong to characters that were drawn with limbs.
  const squash = pose.squash ?? 0;
  const w = Math.round(sprite.w * (1 + squash * 0.03));
  const h = Math.round(sprite.h * (1 - squash * 0.03));
  const art = await scaled(sprite, w, h);

  // An image has no legs to swing, so the walk gets a hop instead: lift on
  // the mid-stride frames so it still reads as movement, not a slide.
  const midStride = f.side && (pose.legs === 2 || pose.legs === 4);
  const left = Math.round(CX - art.w / 2 + (pose.dx ?? 0));
  const top = Math.round(LOGICAL_BASELINE - art.h + (pose.dy ?? 0) + (midStride ? -2 : 0));
  c.blitRaw(art.data, art.w, art.h, left, top, recolourFor(f.palette));

  // Mirror the walk so it faces its direction of travel, exactly as the
  // hand-drawn characters do.
  const out = f.mirror ? c.mirrored() : c;
  f.overlay?.(out);

  const raw = out.toRawRGBA();
  return sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } }).png().toBuffer();
}

/**
 * Compose a conformant 8×10 pixel-art spritesheet from a single image.
 * This is the hard part the CLI exists to solve — hand-assembling 80 frames
 * at exact dimensions is why these pet libraries stay tiny.
 */
export async function composeSheetFromImage(input: Buffer | string): Promise<Buffer> {
  const sprite = await pixelate(input);
  const cells: FrameCell[] = [];
  for (const state of SPRITE_STATES) {
    for (let col = 0; col < state.frames; col++) {
      cells.push({ row: state.row, col, input: await renderFrame(sprite, state.name, col) });
    }
  }
  return composeSheetWebp(cells);
}
