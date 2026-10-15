/**
 * Eyes and mouth, shared by every build.
 *
 * A face is the one thing an animal and a person draw identically here, and
 * keeping it in one place is what lets the pose vocabulary (blink, wide, x,
 * happy) apply to both without either build knowing about the other.
 */
import type { Palette, PixelCanvas, Pose } from './pixel.js';
import type { EyeKind } from './traits.js';

/** Draw one pair of eyes, centred on `x` positions given by the caller. */
export function drawEyePair(
  c: PixelCanvas,
  left: number,
  right: number,
  ey: number,
  kind: EyeKind,
  pal: Palette,
  style: Pose['eyes'],
): void {
  const put = (x: number): void => {
    if (style === 'blink') {
      c.rect(x, ey + 2, 5, 1, pal.out);
      return;
    }
    if (style === 'x') {
      c.px(x, ey, pal.out);
      c.px(x + 4, ey, pal.out);
      c.px(x + 1, ey + 1, pal.out);
      c.px(x + 3, ey + 1, pal.out);
      c.px(x + 2, ey + 2, pal.out);
      c.px(x + 1, ey + 3, pal.out);
      c.px(x + 3, ey + 3, pal.out);
      c.px(x, ey + 4, pal.out);
      c.px(x + 4, ey + 4, pal.out);
      return;
    }
    if (style === 'happy') {
      c.px(x, ey + 3, pal.out);
      c.px(x + 1, ey + 2, pal.out);
      c.px(x + 2, ey + 1, pal.out);
      c.px(x + 3, ey + 2, pal.out);
      c.px(x + 4, ey + 3, pal.out);
      return;
    }
    // startled always shows whites, so it stays legible on the red alarm coat
    if (style === 'wide') {
      c.rect(x, ey - 1, 5, 6, pal.eyeWhite);
      c.rect(x + 1, ey, 3, 4, pal.eyeDark);
      c.px(x + 1, ey, pal.eyeWhite);
      return;
    }
    switch (kind) {
      case 'slit':
        c.rect(x, ey, 5, 4, pal.accent);
        c.rect(x + 2, ey, 1, 4, pal.eyeDark);
        c.px(x + 1, ey, pal.eyeWhite);
        break;
      case 'beady':
        c.rect(x + 1, ey + 1, 3, 3, pal.eyeDark);
        c.px(x + 1, ey + 1, pal.eyeWhite);
        break;
      case 'screen':
        c.rect(x, ey, 4, 4, pal.accent);
        break;
      case 'round':
      default:
        c.rect(x, ey, 5, 4, pal.eyeWhite);
        c.rect(x + 1, ey, 3, 4, pal.eyeDark);
        c.px(x + 1, ey, pal.eyeWhite);
        break;
    }
  };
  put(left);
  put(right);
}

export function drawMouth(c: PixelCanvas, x: number, my: number, pal: Palette, style: Pose['mouth']): void {
  switch (style) {
    case 'open':
      c.rect(x, my, 4, 3, pal.out);
      break;
    case 'oh':
      c.rect(x + 1, my, 2, 3, pal.out);
      break;
    case 'flat':
      c.rect(x, my + 1, 4, 1, pal.out);
      break;
    case 'frown':
      c.rect(x, my + 1, 4, 1, pal.out);
      c.px(x - 1, my, pal.out);
      c.px(x + 4, my, pal.out);
      break;
    case 'smile':
    default:
      c.px(x, my, pal.out);
      c.px(x + 1, my + 1, pal.out);
      c.px(x + 2, my + 1, pal.out);
      c.px(x + 3, my, pal.out);
      break;
  }
}
