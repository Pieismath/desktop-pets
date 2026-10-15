/**
 * Draw a pictograph onto the logical grid.
 *
 * Drawn from Twemoji artwork shipped with this package — no network, no key —
 * then reduced to hard pixels and dropped onto the same 48x52 canvas every
 * other pet is drawn on, so it animates through the shared motion vocabulary
 * like anything else.
 *
 * **Provenance.** Shipping the artwork is what makes these pets publishable.
 * Twemoji is CC-BY 4.0, so a pet drawn from it carries a real licence and an
 * attribution line instead of a warning. The system emoji font remains a
 * fallback for glyphs Twemoji lacks, and that path is still reported as having
 * artwork whose licence we cannot determine — the text renderer chooses a font
 * per character and falls back silently, which is not observable from here.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { PixelCanvas, LOGICAL_BASELINE, type RGBA } from './pixel.js';

/** Matched to the hand-drawn characters so a pictograph pet is not smaller. */
const MAX_W = 34;
const MAX_H = 36;
const CX = 24;

/**
 * Where the artwork came from, which decides what may be done with the pet.
 *
 * `twemoji` means we rasterised a file we shipped ourselves, so the licence is
 * known and the pet can be published with attribution. `font` means the system
 * emoji font drew it: fine locally, but the renderer picks a font per character
 * and falls back silently, so which artwork it used — and therefore its licence
 * — cannot be determined from here.
 */
export type ArtSource = 'twemoji' | 'font';

/** What a Twemoji-derived pet must say about itself. */
export const TWEMOJI_ATTRIBUTION = 'Twemoji by Twitter, Inc and other contributors, CC-BY 4.0';

export interface PictographArt {
  canvas: PixelCanvas;
  source: ArtSource;
  /** Set only for `twemoji`: the licence the artwork actually carries. */
  licence?: string;
  attribution?: string;
}

/**
 * Twemoji names each file after its codepoints.
 *
 * The variation selector is dropped, which is why the plain and emoji-presented
 * forms of a character resolve to the same file, and sequences are joined with
 * hyphens.
 */
export function twemojiFile(glyph: string): string {
  const points = [...glyph]
    .map((ch) => ch.codePointAt(0)!)
    .filter((cp) => cp !== 0xfe0f)
    .map((cp) => cp.toString(16));
  return `${points.join('-')}.svg`;
}

let twemojiDir: string | undefined | null;
/** Locate the bundled artwork, once. `null` once we know it is not installed. */
function findTwemoji(): string | undefined {
  if (twemojiDir === undefined) {
    try {
      const pkg = createRequire(import.meta.url).resolve('@discordapp/twemoji/package.json');
      twemojiDir = path.join(path.dirname(pkg), 'dist', 'svg');
    } catch {
      twemojiDir = null;
    }
  }
  return twemojiDir ?? undefined;
}

/** Reduce a rendered image to a small, hard-edged sprite on the ground line. */
async function reduce(rendered: Buffer): Promise<{ data: Buffer; w: number; h: number } | undefined> {
  try {
    const { data, info } = await sharp(rendered)
      .ensureAlpha()
      .trim({ threshold: 8 })
      .resize(MAX_W, MAX_H, {
        fit: 'inside',
        kernel: 'nearest',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height };
  } catch {
    return undefined;
  }
}

/**
 * Reduce to a small palette so it sits closer to the app's chunky look than a
 * smooth emoji gradient does.
 */
function quantise(c: RGBA, steps = 6): RGBA {
  const q = (v: number): number => Math.min(255, Math.round((v / 255) * (steps - 1)) * Math.round(255 / (steps - 1)));
  return [q(c[0]), q(c[1]), q(c[2]), 255];
}

/**
 * Render a pictograph, standing on the ground line.
 *
 * Prefers the artwork we ship, because that is the only path whose licence we
 * can state. Falls back to the system emoji font for anything Twemoji has no
 * file for, and says which was used so the caller can be honest about it.
 */
export async function drawPictograph(glyph: string, requested?: string): Promise<PictographArt | undefined> {
  let sprite: { data: Buffer; w: number; h: number } | undefined;
  let source: ArtSource = 'font';

  const dir = findTwemoji();
  if (dir && !requested) {
    const file = path.join(dir, twemojiFile(glyph));
    if (existsSync(file)) {
      // an SVG scales cleanly to any size, so render straight to the target
      sprite = await reduce(await sharp(file, { density: 384 }).png().toBuffer()).catch(() => undefined);
      if (sprite) source = 'twemoji';
    }
  }
  if (!sprite) {
    sprite = await reduce(
      await sharp({ text: { text: glyph, font: requested ?? 'emoji', dpi: 700, rgba: true } })
        .png()
        .toBuffer()
        .catch(() => Buffer.alloc(0)),
    );
    source = 'font';
  }
  if (!sprite || sprite.w < 6 || sprite.h < 6) return undefined;

  const canvas = new PixelCanvas();
  const left = CX - Math.floor(sprite.w / 2);
  const top = LOGICAL_BASELINE - sprite.h;
  const seen = new Set<string>();
  let painted = 0;
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      const o = (y * sprite.w + x) * 4;
      const a = sprite.data[o + 3] ?? 0;
      if (a < 90) continue;
      const c = quantise([sprite.data[o] ?? 0, sprite.data[o + 1] ?? 0, sprite.data[o + 2] ?? 0, 255]);
      canvas.px(left + x, top + y, c);
      seen.add(c.join(','));
      painted++;
    }
  }
  // A font without the glyph draws a "tofu" box: plenty of pixels, but one
  // flat colour. Real pictographs are never monochrome.
  if (painted < 40 || seen.size < 3) return undefined;

  return source === 'twemoji'
    ? { canvas, source, licence: 'CC-BY-4.0', attribution: TWEMOJI_ATTRIBUTION }
    : { canvas, source };
}
