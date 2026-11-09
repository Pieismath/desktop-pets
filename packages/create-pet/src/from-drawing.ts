/**
 * Turn one finished drawing into a pet, at full resolution.
 *
 * This is the sibling of `from-image.ts` and exists because that one
 * deliberately throws detail away: it reduces its input to a 34x38 grid so a
 * photo comes out looking like the chunky bundled pets. Run illustrated
 * artwork through it and the illustration is what you lose.
 *
 * Here the art is kept whole and only ever moved, scaled and tinted. The
 * poses come from the same engine every other pet uses, so a drawn pet
 * answers the same ten states on the same ground line; what it cannot do is
 * bend a limb, because a single drawing has no limbs to bend. Whole-body
 * motion is all a flat image can honestly offer, and the renderer's motion
 * layer carries the rest at display framerate.
 */
import sharp from 'sharp';
import { SPRITE_STATES } from '@desktop-pets/shared';
import type { SpriteStateName } from '@desktop-pets/shared';
import { LOGICAL_BASELINE, LOGICAL_W, desaturate, towardRed, type RGBA } from './pixel.js';
import { frameFor } from './poses.js';
import { findLandmarks, handlesFor, loadArt, warp, type Art, type Landmarks } from './rig.js';
import { composeSheetWebp, type FrameCell } from './sheet.js';

const FRAME_W = 192;
const FRAME_H = 208;
/** Frame pixels per logical unit, so poses written for the grid still apply. */
const SCALE = FRAME_W / LOGICAL_W;

/** Matched to `from-image.ts` so a drawn pet is not a different size. */
const MAX_W = 34 * SCALE;
const MAX_H = 38 * SCALE;
const BASELINE = LOGICAL_BASELINE * SCALE;
const CX = 24 * SCALE;

function recolourFor(kind: string): ((c: RGBA) => RGBA) | undefined {
  if (kind === 'grey') return (c) => desaturate(c);
  if (kind === 'alarmA') return (c) => towardRed(c, 0.82);
  if (kind === 'alarmB') return (c) => towardRed(c, 0.92);
  return undefined;
}

/** Apply a palette wash in place, leaving alpha alone. */
function tint(buf: Buffer, fn: (c: RGBA) => RGBA): Buffer {
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue;
    const [r, g, b] = fn([buf[i]!, buf[i + 1]!, buf[i + 2]!, buf[i + 3]!]);
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
  }
  return buf;
}

async function renderFrame(
  art: Art,
  lm: Landmarks,
  state: SpriteStateName,
  i: number,
): Promise<Buffer> {
  const f = frameFor(state, i);
  const pose = f.pose;

  // Deform first, at full size: ears swing, feet step, a raised arm lifts.
  // This is what stops a drawn pet being a sticker that only slides about.
  const frames = SPRITE_STATES.find((s) => s.name === state)?.frames ?? 1;
  const posed = warp(art, handlesFor(lm, pose, art.h, state, i, frames));

  // Then squash and stretch the whole figure, which reads as weight.
  const squash = pose.squash ?? 0;
  const w = Math.max(1, Math.round(posed.w * (1 + squash * 0.03)));
  const h = Math.max(1, Math.round(posed.h * (1 - squash * 0.03)));

  let body: Buffer<ArrayBufferLike> = await sharp(posed.data, {
    raw: { width: posed.w, height: posed.h, channels: 4 },
  })
    .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer();

  const recolour = recolourFor(f.palette);
  if (recolour) body = tint(body, recolour);

  // No legs to swing, so a walk becomes a hop: lift on the mid-stride frames
  // and it reads as travel rather than a slide. Same trick as from-image.
  const midStride = f.side && (pose.legs === 2 || pose.legs === 4);
  const left = Math.round(CX - w / 2 + (pose.dx ?? 0) * SCALE);
  const top = Math.round(BASELINE - h + (pose.dy ?? 0) * SCALE + (midStride ? -2 * SCALE : 0));

  const frame = sharp({
    create: { width: FRAME_W, height: FRAME_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: body, raw: { width: w, height: h, channels: 4 }, left, top }]);

  // Face the direction of travel, exactly as every other pet does.
  return f.mirror ? frame.png().toBuffer().then((b) => sharp(b).flop().png().toBuffer()) : frame.png().toBuffer();
}

/**
 * Compose a conformant 8x10 sheet from one drawing.
 *
 * Encoded lossy: illustrated art carries paper grain, which is
 * high-frequency noise that lossless WebP cannot compress, and the
 * difference is invisible at the size a pet is shown.
 */
export async function composeSheetFromDrawing(input: Buffer | string): Promise<Buffer> {
  const art = await loadArt(input, MAX_W, MAX_H);
  // Landmarks come from the rest pose and are reused for all eighty frames,
  // so a part cannot drift to a different place from one frame to the next.
  const lm = findLandmarks(art);
  const cells: FrameCell[] = [];
  for (const state of SPRITE_STATES) {
    for (let col = 0; col < state.frames; col++) {
      cells.push({ row: state.row, col, input: await renderFrame(art, lm, state.name, col) });
    }
  }
  return composeSheetWebp(cells, { lossless: false });
}
