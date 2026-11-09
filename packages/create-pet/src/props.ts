/**
 * The things a pet holds or stands under: the gear it turns while working,
 * the magnifier it reviews with, the rain cloud over a failure.
 *
 * The pose engine names a prop and where it goes; each renderer draws it in
 * its own idiom. These are the drawn ones, in the same ink-and-paper style as
 * the characters, so a pet and its props never look like they came from two
 * different hands.
 */
import { ellipsePath, LINE_IN, mark, p, ribbon, spline, type Shape } from './draw.js';

export type PropKind = 'gear' | 'magnifier' | 'warning' | 'cloud' | 'sparkles' | 'dots';

export interface Prop {
  kind: PropKind;
  /** Position in the pose engine's logical units. */
  x: number;
  y: number;
  /** Animation step, for a gear's teeth or which dot is lit. */
  phase: number;
  bright?: boolean;
  rain?: boolean;
}

/** Logical units to frame pixels. */
const U = 4;
const INK = '#17120d';

export function propShapes(prop: Prop): Shape[] {
  const x = prop.x * U;
  const y = prop.y * U;
  switch (prop.kind) {
    case 'gear':
      return gear(x + 14, y + 14, prop.phase);
    case 'magnifier':
      return magnifier(x + 16, y + 16);
    case 'warning':
      return warning(x + 22, y + 14, prop.bright ?? true);
    case 'cloud':
      return cloud(x + 32, y + 20, prop.rain ?? false);
    case 'sparkles':
      return sparkles(x, y);
    case 'dots':
      return dots(x, y, prop.phase);
  }
}

function gear(cx: number, cy: number, phase: number): Shape[] {
  const r = 13;
  const teeth = 8;
  const turn = (phase % 2) * (Math.PI / teeth);
  const pts = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = turn + (i / (teeth * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? r + 5 : r;
    pts.push(p(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad));
  }
  return [
    { d: spline(pts), fill: '#9aa5b1', line: LINE_IN },
    { d: ellipsePath(cx, cy, 4.5, 4.5), fill: '#6b7682', line: 0 },
  ];
}

function magnifier(cx: number, cy: number): Shape[] {
  return [
    {
      d: ribbon([p(cx + 9, cy + 9), p(cx + 20, cy + 20)], 8, 8),
      fill: '#7b654e',
      line: LINE_IN,
    },
    { d: ellipsePath(cx, cy, 15, 15), fill: '#cfe8f2', line: 4 },
    { d: mark(p(cx - 8, cy - 4), p(cx - 3, cy - 9)), stroke: '#ffffff', line: 3.4 },
  ];
}

function warning(cx: number, cy: number, bright: boolean): Shape[] {
  const w = 22;
  const h = 18;
  return [
    {
      d: spline([
        p(cx, cy - h),
        p(cx + w * 0.55, cy - h * 0.1),
        p(cx + w, cy + h),
        p(cx, cy + h * 1.08),
        p(cx - w, cy + h),
        p(cx - w * 0.55, cy - h * 0.1),
      ]),
      fill: bright ? '#f5c73f' : '#c89a1e',
      line: LINE_IN,
    },
    { d: ribbon([p(cx, cy - 5), p(cx, cy + 4)], 5, 4), fill: INK },
    { d: ellipsePath(cx, cy + 10, 2.6, 2.6), fill: INK },
  ];
}

function cloud(cx: number, cy: number, rain: boolean): Shape[] {
  const out: Shape[] = [
    {
      d: spline([
        p(cx - 34, cy + 10),
        p(cx - 32, cy - 2),
        p(cx - 21, cy - 11),
        p(cx - 9, cy - 5),
        p(cx + 1, cy - 17),
        p(cx + 16, cy - 9),
        p(cx + 29, cy - 3),
        p(cx + 34, cy + 10),
        p(cx + 12, cy + 15),
        p(cx - 13, cy + 15),
      ]),
      fill: '#9fa9b4',
      line: LINE_IN,
    },
  ];
  if (rain) {
    for (const dx of [-14, 0, 14]) {
      out.push({
        d: mark(p(cx + dx, cy + 18), p(cx + dx - 2, cy + 29)),
        stroke: '#6f93bd',
        line: 3.4,
      });
    }
  }
  return out;
}

function sparkles(cx: number, cy: number): Shape[] {
  const one = (x: number, y: number, r: number): Shape => ({
    d: spline([
      p(x, y - r),
      p(x + r * 0.3, y - r * 0.3),
      p(x + r, y),
      p(x + r * 0.3, y + r * 0.3),
      p(x, y + r),
      p(x - r * 0.3, y + r * 0.3),
      p(x - r, y),
      p(x - r * 0.3, y - r * 0.3),
    ]),
    fill: '#f7d774',
    line: 2.6,
  });
  return [one(cx, cy, 13), one(cx + 56, cy - 18, 10), one(cx - 38, cy + 14, 9)];
}

function dots(cx: number, cy: number, active: number): Shape[] {
  return [0, 1, 2].map((i) => ({
    d: ellipsePath(cx + i * 19, cy - (i === active ? 6 : 0), 6.5, 6.5),
    fill: i === active ? '#e8a856' : '#bdae9b',
    line: LINE_IN,
  }));
}
