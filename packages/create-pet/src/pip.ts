/**
 * "Pip" — the bundled default pet. Drawn entirely in code: parametric SVG
 * per state/frame, no reference images, no third-party IP. Art is CC0.
 */
import { SPRITE_SHEET } from '@desktop-pets/shared';
import type { SpriteStateName } from '@desktop-pets/shared';

const W = SPRITE_SHEET.frameWidth;
const H = SPRITE_SHEET.frameHeight;
const CX = 96;
const BASE_Y = 176;
const TAU = Math.PI * 2;

interface Palette {
  light: string;
  dark: string;
  stroke: string;
}

const TEAL: Palette = { light: '#8ef2df', dark: '#2fbfae', stroke: '#1b8577' };
const SLATE: Palette = { light: '#c3cdd8', dark: '#6b7b8d', stroke: '#46545f' };
const RED_A: Palette = { light: '#ffb3a6', dark: '#ff5546', stroke: '#c22b1d' };
const RED_B: Palette = { light: '#ff8d7a', dark: '#e03826', stroke: '#a01f10' };

type EyeStyle = 'normal' | 'happy' | 'x' | 'wide' | 'squint';
type MouthStyle = 'smile' | 'open' | 'o' | 'flat' | 'frown';

interface Face {
  eyes: EyeStyle;
  mouth: MouthStyle;
  blink?: number; // 0..1
  lookX?: number;
  lookY?: number;
  blush?: boolean;
}

interface Pose {
  dx?: number;
  dy?: number;
  lean?: number; // degrees, pivot at base
  squashX?: number;
  squashY?: number;
  palette?: Palette;
  face: Face;
  shadowScale?: number; // 1 = grounded
  extras?: string; // svg fragments drawn inside the body group (moves with pet)
  overlay?: string; // svg fragments in frame space (fixed)
}

function bodyPath(w: number, h: number): string {
  const hw = w / 2;
  return [
    `M ${CX - hw} ${BASE_Y}`,
    `C ${CX - hw} ${BASE_Y - h * 0.86} ${CX - w * 0.3} ${BASE_Y - h} ${CX} ${BASE_Y - h}`,
    `C ${CX + w * 0.3} ${BASE_Y - h} ${CX + hw} ${BASE_Y - h * 0.86} ${CX + hw} ${BASE_Y}`,
    `Q ${CX} ${BASE_Y + 7} ${CX - hw} ${BASE_Y}`,
    'Z',
  ].join(' ');
}

function eye(x: number, y: number, style: EyeStyle, blink: number, lookX: number, lookY: number, stroke: string): string {
  if (style === 'x') {
    const s = 6;
    return (
      `<path d="M ${x - s} ${y - s} L ${x + s} ${y + s} M ${x + s} ${y - s} L ${x - s} ${y + s}"` +
      ` stroke="${stroke}" stroke-width="4" stroke-linecap="round" fill="none"/>`
    );
  }
  if (style === 'happy') {
    return (
      `<path d="M ${x - 7} ${y + 2} Q ${x} ${y - 8} ${x + 7} ${y + 2}"` +
      ` stroke="${stroke}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`
    );
  }
  const wide = style === 'wide';
  const squint = style === 'squint';
  const rx = wide ? 8 : 6.4;
  let ry = wide ? 9.4 : 7.4;
  if (squint) ry *= 0.45;
  ry *= 1 - 0.9 * blink;
  ry = Math.max(ry, 0.9);
  const pupilR = wide ? 2.2 : 2.9;
  const closed = blink > 0.6;
  const pupil = closed
    ? ''
    : `<circle cx="${x + lookX}" cy="${y + lookY}" r="${pupilR}" fill="#233"/>` +
      `<circle cx="${x + lookX - 1.3}" cy="${y + lookY - 1.6}" r="1" fill="#fff"/>`;
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" stroke="${stroke}" stroke-width="2"/>${pupil}`;
}

function mouth(style: MouthStyle, stroke: string): string {
  const y = 139;
  switch (style) {
    case 'smile':
      return `<path d="M 87 ${y} Q ${CX} ${y + 7} 105 ${y}" stroke="${stroke}" stroke-width="4" stroke-linecap="round" fill="none"/>`;
    case 'open':
      return `<path d="M 86 ${y - 1} Q ${CX} ${y + 13} 106 ${y - 1} Z" fill="#233" stroke="${stroke}" stroke-width="2"/>`;
    case 'o':
      return `<ellipse cx="${CX}" cy="${y + 2}" rx="4.4" ry="5.4" fill="#233"/>`;
    case 'flat':
      return `<path d="M 89 ${y + 1} L 103 ${y + 1}" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>`;
    case 'frown':
      return `<path d="M 88 ${y + 4} Q ${CX} ${y - 3} 104 ${y + 4}" stroke="${stroke}" stroke-width="4" stroke-linecap="round" fill="none"/>`;
  }
}

function face(f: Face, pal: Palette): string {
  const blink = f.blink ?? 0;
  const lookX = f.lookX ?? 0;
  const lookY = f.lookY ?? 0;
  const parts = [
    eye(CX - 17, 120, f.eyes, blink, lookX, lookY, pal.stroke),
    eye(CX + 17, 120, f.eyes, blink, lookX, lookY, pal.stroke),
    mouth(f.mouth, pal.stroke),
  ];
  if (f.blush) {
    parts.push(
      `<ellipse cx="${CX - 27}" cy="131" rx="6" ry="3.6" fill="#ff9aa0" opacity="0.55"/>`,
      `<ellipse cx="${CX + 27}" cy="131" rx="6" ry="3.6" fill="#ff9aa0" opacity="0.55"/>`,
    );
  }
  return parts.join('');
}

// ---- overlay pieces (all drawn, no fonts) ----

function star(x: number, y: number, r: number, fill = '#ffd75e'): string {
  const k = r * 0.28;
  return (
    `<path d="M ${x} ${y - r} Q ${x + k} ${y - k} ${x + r} ${y} Q ${x + k} ${y + k} ${x} ${y + r}` +
    ` Q ${x - k} ${y + k} ${x - r} ${y} Q ${x - k} ${y - k} ${x} ${y - r} Z" fill="${fill}" opacity="0.95"/>`
  );
}

function gear(x: number, y: number, r: number, angle: number): string {
  const teeth: string[] = [];
  for (let k = 0; k < 8; k++) {
    teeth.push(
      `<rect x="${x - 3.4}" y="${y - r - 5}" width="6.8" height="9" rx="2.4" fill="#8a94a6" transform="rotate(${angle + k * 45} ${x} ${y})"/>`,
    );
  }
  const ring =
    `<path fill-rule="evenodd" fill="#8a94a6" d="M ${x + r} ${y} A ${r} ${r} 0 1 0 ${x - r} ${y} A ${r} ${r} 0 1 0 ${x + r} ${y} Z ` +
    `M ${x + r * 0.42} ${y} A ${r * 0.42} ${r * 0.42} 0 1 1 ${x - r * 0.42} ${y} A ${r * 0.42} ${r * 0.42} 0 1 1 ${x + r * 0.42} ${y} Z"/>`;
  return `<g>${teeth.join('')}${ring}</g>`;
}

function warningSign(x: number, y: number, on: boolean): string {
  const op = on ? 1 : 0.3;
  return (
    `<g opacity="${op}">` +
    `<path d="M ${x} ${y - 16} L ${x + 15} ${y + 10} Q ${x + 18} ${y + 16} ${x + 11} ${y + 16} L ${x - 11} ${y + 16} Q ${x - 18} ${y + 16} ${x - 15} ${y + 10} Z"` +
    ` fill="#ffcf33" stroke="#a26e00" stroke-width="3" stroke-linejoin="round"/>` +
    `<rect x="${x - 2.4}" y="${y - 7}" width="4.8" height="12" rx="2.4" fill="#4a3200"/>` +
    `<circle cx="${x}" cy="${y + 10.5}" r="2.6" fill="#4a3200"/>` +
    `</g>`
  );
}

function cloud(x: number, y: number, drip: boolean): string {
  return (
    `<g>` +
    `<circle cx="${x - 14}" cy="${y}" r="10" fill="#8b98a5"/>` +
    `<circle cx="${x}" cy="${y - 6}" r="13" fill="#8b98a5"/>` +
    `<circle cx="${x + 14}" cy="${y}" r="10" fill="#8b98a5"/>` +
    `<rect x="${x - 18}" y="${y - 2}" width="36" height="9" rx="4" fill="#8b98a5"/>` +
    (drip
      ? `<path d="M ${x - 8} ${y + 12} q -2.5 5 0 7 q 3 -2 0 -7 Z" fill="#5f86b8"/>` +
        `<path d="M ${x + 7} ${y + 16} q -2.5 5 0 7 q 3 -2 0 -7 Z" fill="#5f86b8"/>`
      : '') +
    `</g>`
  );
}

function magnifier(x: number, y: number, pupilOffset: number): string {
  return (
    `<g>` +
    `<line x1="${x + 16}" y1="${y + 16}" x2="${x + 30}" y2="${y + 32}" stroke="#5b6673" stroke-width="7" stroke-linecap="round"/>` +
    `<circle cx="${x}" cy="${y}" r="21" fill="#cfeeff" opacity="0.45"/>` +
    `<circle cx="${x}" cy="${y}" r="21" fill="none" stroke="#5b6673" stroke-width="5"/>` +
    `<circle cx="${x + pupilOffset}" cy="${y + 1}" r="6.5" fill="#233"/>` +
    `<circle cx="${x + pupilOffset - 2}" cy="${y - 2}" r="2" fill="#fff"/>` +
    `</g>`
  );
}

function dashes(side: 'left' | 'right', phase: number): string {
  const xs = side === 'left' ? [16, 10, 20] : [W - 16, W - 10, W - 20];
  const dir = side === 'left' ? 1 : -1;
  const rows = [104, 126, 148];
  return rows
    .map((y, k) => {
      const len = 18 + ((phase + k) % 2) * 8;
      const op = 0.25 + 0.35 * ((phase + k) % 2);
      const x0 = xs[k] ?? 16;
      return `<rect x="${Math.min(x0, x0 + dir * len)}" y="${y}" width="${len}" height="5" rx="2.5" fill="#9adfd4" opacity="${op}"/>`;
    })
    .join('');
}

function thinkDots(active: number): string {
  const pts: Array<[number, number]> = [
    [CX - 18, 62],
    [CX, 52],
    [CX + 18, 62],
  ];
  return pts
    .map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="4.6" fill="#7dd4c8" opacity="${k === active ? 1 : 0.28}"/>`)
    .join('');
}

function sweat(x: number, y: number, op: number): string {
  return `<path d="M ${x} ${y} q -4.5 8 0 11.5 q 5.5 -3.5 0 -11.5 Z" fill="#6fc3ff" opacity="${op}"/>`;
}

function arm(angle: number, pal: Palette): string {
  return (
    `<g transform="rotate(${angle} ${CX + 48} 118)">` +
    `<ellipse cx="${CX + 56}" cy="102" rx="10" ry="17" fill="${pal.dark}" stroke="${pal.stroke}" stroke-width="4.5"/>` +
    `</g>`
  );
}

// ---- per-state pose functions ----

function poseFor(state: SpriteStateName, i: number, frames: number): Pose {
  const t = frames > 1 ? i / frames : 0;
  switch (state) {
    case 'idle': {
      const dy = 2.6 * Math.sin(TAU * t);
      return {
        dy,
        squashY: 1 + 0.018 * Math.sin(TAU * t),
        face: {
          eyes: 'normal',
          mouth: 'smile',
          blink: i === 4 ? 1 : 0,
          lookX: i === 2 ? 3 : 0,
          blush: true,
        },
      };
    }
    case 'running-right':
    case 'running-left': {
      const right = state === 'running-right';
      const hop = Math.abs(Math.sin(TAU * t * 2));
      return {
        dy: -7 * hop,
        dx: right ? 2 : -2,
        lean: right ? 11 : -11,
        squashY: 1 + 0.07 * hop,
        squashX: 1 - 0.045 * hop,
        face: { eyes: 'squint', mouth: 'open', lookX: right ? 4 : -4 },
        overlay: dashes(right ? 'left' : 'right', i % 2),
        shadowScale: 1 - 0.3 * hop,
      };
    }
    case 'waving': {
      const angles = [-26, -2, 22, -2];
      return {
        lean: [-2, 0, 2, 0][i] ?? 0,
        face: { eyes: 'happy', mouth: 'open', blush: true },
        extras: arm(angles[i] ?? 0, TEAL),
      };
    }
    case 'jumping': {
      const dy = [2, -14, -26, -12, 3][i] ?? 0;
      const sy = [0.86, 1.1, 1.04, 1.08, 0.88][i] ?? 1;
      const peak = i === 2;
      return {
        dy,
        squashY: sy,
        squashX: 2 - sy,
        face: { eyes: peak ? 'happy' : 'normal', mouth: 'open', blush: true },
        shadowScale: 1 + dy / 60,
        overlay: peak ? star(52, 58, 8) + star(140, 46, 7) + star(96, 26, 6) : '',
      };
    }
    case 'failed': {
      const sink = Math.min(i, 5) * 0.8;
      return {
        dy: sink,
        squashY: 1 - 0.015 * Math.min(i, 5),
        palette: SLATE,
        face: { eyes: 'x', mouth: 'frown' },
        overlay: cloud(CX, 44, i >= 3),
      };
    }
    case 'waiting': {
      return {
        dy: 1.2 * Math.sin(TAU * t),
        face: { eyes: 'wide', mouth: 'o', lookX: -2, lookY: -3 },
        overlay: thinkDots(Math.floor(t * 3) % 3),
        extras:
          i % 2 === 1
            ? `<ellipse cx="${CX + 36}" cy="171" rx="9" ry="6" fill="${TEAL.dark}" stroke="${TEAL.stroke}" stroke-width="3.6"/>`
            : '',
      };
    }
    case 'working': {
      const bounce = Math.abs(Math.sin(TAU * t * 2));
      return {
        dy: -2.5 * bounce,
        face: { eyes: 'normal', mouth: 'flat', lookX: -4, lookY: 3, blink: 0.15 },
        overlay: gear(CX + 44, 58, 13, i * 22.5) + (i >= 4 ? sweat(CX - 42, 96, 0.85) : ''),
      };
    }
    case 'review': {
      const lensX = 72 + (120 - 72) * (i / 5);
      return {
        lean: 2,
        face: { eyes: 'normal', mouth: 'o', lookX: 2 },
        overlay: magnifier(lensX, 118, (i % 3) - 1),
      };
    }
    case 'alarm': {
      const shake = [0, -4, 4, -3, 3, 0][i] ?? 0;
      return {
        dx: shake,
        palette: i % 2 === 0 ? RED_A : RED_B,
        face: { eyes: 'wide', mouth: 'o' },
        overlay:
          warningSign(CX, 44, i % 2 === 0) +
          (i % 2 === 0
            ? `<path d="M ${CX - 34} 30 L ${CX - 42} 20 M ${CX + 34} 30 L ${CX + 42} 20" stroke="#ff5546" stroke-width="4" stroke-linecap="round"/>`
            : ''),
      };
    }
  }
}

/** Render one 192x208 SVG frame of Pip. */
export function renderPipFrameSvg(state: SpriteStateName, frameIndex: number, frames: number): string {
  const pose = poseFor(state, frameIndex, frames);
  const pal = pose.palette ?? TEAL;
  const sx = pose.squashX ?? 1;
  const sy = pose.squashY ?? 1;
  const w = 124 * sx;
  const h = 104 * sy;
  const dx = pose.dx ?? 0;
  const dy = pose.dy ?? 0;
  const lean = pose.lean ?? 0;
  const shadowScale = Math.max(0.35, Math.min(1.15, pose.shadowScale ?? 1));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><radialGradient id="g" cx="35%" cy="22%" r="85%">` +
    `<stop offset="0%" stop-color="${pal.light}"/><stop offset="100%" stop-color="${pal.dark}"/>` +
    `</radialGradient></defs>` +
    `<ellipse cx="${CX}" cy="187" rx="${44 * shadowScale}" ry="${6.5 * shadowScale}" fill="#000" opacity="${0.16 * shadowScale}"/>` +
    `<g transform="translate(${dx} ${dy}) rotate(${lean} ${CX} ${BASE_Y})">` +
    `<path d="${bodyPath(w, h)}" fill="url(#g)" stroke="${pal.stroke}" stroke-width="5.5" stroke-linejoin="round"/>` +
    `<ellipse cx="${CX - 26}" cy="${BASE_Y - h + 26}" rx="14" ry="8" fill="#ffffff" opacity="0.35" transform="rotate(-18 ${CX - 26} ${BASE_Y - h + 26})"/>` +
    (pose.extras ?? '') +
    face(pose.face, pal) +
    `</g>` +
    (pose.overlay ?? '') +
    `</svg>`
  );
}
