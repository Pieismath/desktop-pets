import { describe, expect, it } from 'vitest';
import { findLandmarks, handlesFor, warp, type Art, type Handle } from './rig.js';

/**
 * A synthetic stand-in for a candidate: two ears, a wide head, a narrower
 * body, one arm held out to the picture's left, the other tucked, and two
 * feet. Everything the rig claims to find should be findable here.
 */
function figure(): Art {
  const w = 40;
  const h = 80;
  const data = Buffer.alloc(w * h * 4);
  const put = (x0: number, x1: number, y0: number, y1: number): void => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = (y * w + x) * 4;
        data[o] = 200;
        data[o + 1] = 150;
        data[o + 2] = 90;
        data[o + 3] = 255;
      }
    }
  };
  put(8, 12, 0, 19); // left ear
  put(28, 32, 0, 19); // right ear
  put(6, 34, 18, 40); // head, the widest mass up top
  put(10, 30, 40, 66); // body
  put(0, 10, 46, 52); // arm out to the picture's left
  put(8, 16, 67, 79); // left foot
  put(24, 32, 67, 79); // right foot
  return { data, w, h };
}

const opaque = (a: Art, x: number, y: number): number => a.data[(y * a.w + x) * 4 + 3]!;

describe('rig landmarks', () => {
  const art = figure();
  const lm = findLandmarks(art);

  it('finds ears at the outside of the top band', () => {
    expect(lm.earL.x).toBeLessThan(art.w / 2);
    expect(lm.earR.x).toBeGreaterThan(art.w / 2);
    expect(lm.earL.y).toBeLessThan(art.h * 0.25);
  });

  it('pivots each ear at its base, not at its tip', () => {
    // The base must sit below the tip and inboard of it, or the ear swings
    // from the wrong end and the whole head appears to slide.
    expect(lm.earBaseL.y).toBeGreaterThan(lm.earL.y);
    expect(lm.earBaseR.y).toBeGreaterThan(lm.earR.y);
    expect(lm.earBaseL.x).toBeGreaterThan(lm.earL.x);
    expect(lm.earBaseR.x).toBeLessThan(lm.earR.x);
  });

  it('finds the protruding arm and ignores the tucked one', () => {
    // The real failure this guards: a plain widest-row search puts the
    // "hand" on the cheek of a big-headed character.
    expect(lm.handL).toBeDefined();
    expect(lm.handL!.x).toBeLessThan(6);
    expect(lm.handL!.y).toBeGreaterThan(art.h * 0.3);
    expect(lm.handR).toBeUndefined();
  });

  it('puts the shoulder inboard of and above the hand', () => {
    expect(lm.shoulderL!.x).toBeGreaterThan(lm.handL!.x);
    expect(lm.shoulderL!.y).toBeLessThan(lm.handL!.y);
    expect(lm.shoulderR).toBeUndefined();
  });

  it('separates the two feet', () => {
    expect(lm.footL.x).toBeLessThan(lm.footR.x);
    expect(lm.footR.x - lm.footL.x).toBeGreaterThan(art.w * 0.2);
  });
});

describe('warp', () => {
  const art = figure();

  it('returns the art untouched when nothing moves', () => {
    expect(warp(art, [{ x: 10, y: 10, r: 8, dx: 0, dy: 0 }])).toBe(art);
    expect(warp(art, [])).toBe(art);
  });

  it('moves pixels under a translation handle', () => {
    // x 13..16 at this height is the gap between the ears; pushing the left
    // ear right should carry it into that gap.
    expect(opaque(art, 14, 5)).toBe(0);
    const moved = warp(art, [{ x: 10, y: 4, r: 30, dx: 6, dy: 0 }]);
    expect(opaque(moved, 14, 5)).toBeGreaterThan(0);
  });

  it('sweeps an arc about the pivot when rotating', () => {
    const lm = findLandmarks(art);
    const turned = warp(art, [{ ...lm.earL, r: 24, rot: 0.5, pivot: lm.earBaseL }]);
    // The tip travels...
    let tipMoved = false;
    for (let x = 8; x <= 12; x++) if (opaque(turned, x, 1) !== opaque(art, x, 1)) tipMoved = true;
    expect(tipMoved).toBe(true);
    // ...and the pivot itself does not, which is what makes it an arc rather
    // than a slide. Displacement at the pivot is zero by construction.
    const px = Math.round(lm.earBaseL.x);
    const py = Math.round(lm.earBaseL.y);
    expect(opaque(turned, px, py)).toBe(opaque(art, px, py));
  });

  it('does not tear the figure where two handles overlap', () => {
    // Un-normalised blending doubles the displacement in the overlap and
    // rips a hole; the body should stay solid.
    const both: Handle[] = [
      { x: 20, y: 50, r: 26, dx: 6, dy: 0 },
      { x: 22, y: 52, r: 26, dx: 6, dy: 0 },
    ];
    const out = warp(art, both);
    let solid = 0;
    for (let y = 44; y < 60; y++) for (let x = 16; x < 30; x++) if (opaque(out, x, y) > 0) solid++;
    expect(solid).toBeGreaterThan(14 * 16 * 0.9);
  });
});

describe('rig motion', () => {
  const art = figure();
  const lm = findLandmarks(art);
  const ears = (state: Parameters<typeof handlesFor>[3], i: number, frames: number): number =>
    handlesFor(lm, {}, art.h, state, i, frames).find((k) => k.rot !== undefined)?.rot ?? 0;

  it('droops further into every frame of a failure', () => {
    const seq = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ears('failed', i, 8));
    for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThan(seq[i - 1]!);
  });

  it('streams the ears backwards while running', () => {
    // Averaged over the cycle the ears must sit back, not swing evenly
    // about rest, or the pet looks like it is standing still.
    const mean = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ears('running-right', i, 8)).reduce((a, b) => a + b, 0) / 8;
    expect(mean).toBeLessThan(0);
  });

  it('steps the feet in opposition through a walk', () => {
    const at = (legs: 1 | 2 | 3 | 4) => {
      const hs = handlesFor(lm, { legs }, art.h, 'running-right', 0, 8);
      const l = hs.find((k) => k.x === lm.footL.x && k.y === lm.footL.y);
      const r = hs.find((k) => k.x === lm.footR.x && k.y === lm.footR.y);
      return { l: l?.dx ?? 0, r: r?.dx ?? 0 };
    };
    expect(at(1).l).toBeGreaterThan(0);
    expect(at(1).r).toBeLessThan(0);
    expect(at(3).l).toBeLessThan(0);
    expect(at(3).r).toBeGreaterThan(0);
  });

  it('waves the arm the silhouette actually has', () => {
    // The pose names the character's own right arm, which faces the viewer
    // on the picture's left — the side this figure's arm is on.
    const hs = handlesFor(lm, { armR: -7 }, art.h, 'waving', 2, 4);
    const arm = hs.find((k) => k.pivot && k.pivot.x === lm.shoulderL!.x && k.pivot.y === lm.shoulderL!.y);
    expect(arm).toBeDefined();
    expect(arm!.rot).not.toBe(0);
  });

  it('scales its amplitudes with the figure, not in fixed pixels', () => {
    const small = handlesFor(lm, { legs: 1 }, 80, 'running-right', 0, 8);
    const large = handlesFor(lm, { legs: 1 }, 160, 'running-right', 0, 8);
    const step = (hs: Handle[]) => Math.abs(hs.find((k) => k.dx)?.dx ?? 0);
    expect(step(large)).toBeCloseTo(step(small) * 2, 5);
  });
});
