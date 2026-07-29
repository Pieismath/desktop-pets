import sharp, { type OverlayOptions } from 'sharp';
import { SPRITE_STATES } from '@desktop-pets/shared';
import type { SpriteStateName } from '@desktop-pets/shared';
import { FRAME_GEO, frameAnimation, overlaySvgDoc, shadowSvgDoc } from './pip.js';
import { composeSheetWebp, type FrameCell } from './sheet.js';

const { W, H, CX, baseY } = FRAME_GEO;

// The character occupies roughly this box; motion transforms move it around.
const CHAR_W = 150;
const CHAR_H = 150;

async function normalizeCharacter(input: Buffer | string): Promise<Buffer> {
  // Trim surrounding transparency/border, fit into the character box on a
  // transparent canvas so any input (photo, PNG, logo) lands consistently.
  return sharp(input)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .resize(CHAR_W, CHAR_H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function renderFrame(base: Buffer, state: SpriteStateName, frameIndex: number, frames: number): Promise<Buffer> {
  const anim = frameAnimation(state, frameIndex, frames);

  // Tint the character per state (grey when "failed", red wash when "alarm").
  let charPipe = sharp(base);
  if (anim.tint === 'gray') {
    charPipe = charPipe.grayscale();
  } else if (anim.tint === 'alarm') {
    charPipe = charPipe.tint({ r: 255, g: 120, b: 105 });
  }
  let char = await charPipe.png().toBuffer();

  // Squash/stretch, then lean (rotate about the character's own centre).
  const w = Math.max(1, Math.round(CHAR_W * anim.scaleX));
  const h = Math.max(1, Math.round(CHAR_H * anim.scaleY));
  char = await sharp(char).resize(w, h, { fit: 'fill' }).toBuffer();
  if (anim.lean !== 0) {
    char = await sharp(char).rotate(anim.lean, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  }
  const meta = await sharp(char).metadata();
  const cw = meta.width ?? w;
  const ch = meta.height ?? h;

  // Place feet near the baseline, horizontally centred, then apply the frame
  // offset. Clamp so nothing spills outside the cell.
  const left = Math.round(CX - cw / 2 + anim.dx);
  const top = Math.round(baseY - ch + anim.dy);
  const clampedLeft = Math.max(0, Math.min(W - cw, left));
  const clampedTop = Math.max(0, Math.min(H - ch, top));

  const layers: OverlayOptions[] = [
    { input: Buffer.from(shadowSvgDoc(anim.shadowScale)), left: 0, top: 0 },
    { input: char, left: clampedLeft, top: clampedTop },
  ];
  if (anim.overlaySvg) layers.push({ input: Buffer.from(overlaySvgDoc(anim.overlaySvg)), left: 0, top: 0 });

  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .png()
    .toBuffer();
}

/**
 * Turn a single character image into a conformant 8×10 spritesheet by applying
 * the shared motion vocabulary (the same offsets/lean/squash/overlays the
 * default pet uses) to every state's frames. This is the hard part the CLI
 * exists to solve — hand-assembling 80 frames at exact dimensions is why these
 * libraries stay tiny.
 */
export async function composeSheetFromImage(input: Buffer | string): Promise<Buffer> {
  const base = await normalizeCharacter(input);
  const cells: FrameCell[] = [];
  for (const state of SPRITE_STATES) {
    for (let col = 0; col < state.frames; col++) {
      cells.push({ row: state.row, col, input: await renderFrame(base, state.name, col, state.frames) });
    }
  }
  return composeSheetWebp(cells);
}
