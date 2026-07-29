import sharp from 'sharp';
import { SPRITE_SHEET } from '@desktop-pets/shared';

export interface FrameCell {
  row: number;
  col: number;
  /** PNG or SVG buffer sized exactly frameWidth x frameHeight. */
  input: Buffer;
}

/** Compose frame cells onto the locked 8x10 grid and encode lossless WebP. */
export async function composeSheetWebp(cells: FrameCell[]): Promise<Buffer> {
  const { width, height, frameWidth, frameHeight, columns, rows } = SPRITE_SHEET;
  for (const c of cells) {
    if (c.row < 0 || c.row >= rows || c.col < 0 || c.col >= columns) {
      throw new Error(`cell out of grid: row ${c.row}, col ${c.col}`);
    }
  }
  const composites = await Promise.all(
    cells.map(async (c) => {
      const png = await sharp(c.input).resize(frameWidth, frameHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      return { input: png, left: c.col * frameWidth, top: c.row * frameHeight };
    }),
  );
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .webp({ lossless: true })
    .toBuffer();
}

/** Assert a sheet buffer has the locked geometry (also re-checked by the host). */
export async function assertSheetGeometry(webp: Buffer): Promise<void> {
  const meta = await sharp(webp).metadata();
  if (meta.width !== SPRITE_SHEET.width || meta.height !== SPRITE_SHEET.height) {
    throw new Error(
      `spritesheet must be ${SPRITE_SHEET.width}x${SPRITE_SHEET.height}, got ${meta.width}x${meta.height}`,
    );
  }
  if (meta.format !== 'webp') throw new Error(`spritesheet must be webp, got ${meta.format}`);
}
