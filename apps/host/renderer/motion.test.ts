import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPRITE_BASELINE_Y, SPRITE_SHEET, SPRITE_STATES } from '@desktop-pets/shared';
import {
  BASELINE_Y,
  FRAME_H,
  MOTION_KEYFRAMES,
  MOTION_ORIGIN,
  motionFor,
  motionKeyframeRules,
} from './motion.js';

const byName = (name: string) => SPRITE_STATES.find((s) => s.name === name)!;

/** The animation shorthands a state produces, as one searchable string. */
const allLayers = (name: string, iterations: number | 'infinite') =>
  Object.values(motionFor(byName(name), iterations)).join(' | ');

describe('motion layer', () => {
  it('gives every sprite state something to do', () => {
    for (const spec of SPRITE_STATES) {
      const iterations = typeof spec.loop === 'number' ? spec.loop : 'infinite';
      const layers = motionFor(spec, iterations);
      const moving = Object.values(layers).filter(Boolean);
      expect(moving.length, `${spec.name} has no motion`).toBeGreaterThan(0);
    }
  });

  it('only references keyframes that exist', () => {
    // A typo here would silently drop a layer, which is invisible in review
    // and easy to miss in the app.
    const defined = new Set(Object.keys(MOTION_KEYFRAMES));
    for (const spec of SPRITE_STATES) {
      const iterations = typeof spec.loop === 'number' ? spec.loop : 'infinite';
      for (const shorthand of Object.values(motionFor(spec, iterations))) {
        if (!shorthand) continue;
        const name = shorthand.split(' ')[0]!;
        expect(defined, `${spec.name} -> ${name}`).toContain(name);
      }
    }
  });

  it('emits a keyframe rule for every definition', () => {
    const rules = motionKeyframeRules();
    expect(rules).toHaveLength(Object.keys(MOTION_KEYFRAMES).length);
    for (const rule of rules) expect(rule).toMatch(/^@keyframes m-[a-z-]+ \{ .+ \}$/);
  });

  it('loops persistent states forever', () => {
    expect(allLayers('idle', 'infinite')).toContain('infinite');
    expect(allLayers('alarm', 'infinite')).toContain('infinite');
  });

  it('matches a one-shot to the sheet duration and loop count', () => {
    // jumping is 840ms x 2, so the arc should land with the last drawing
    // rather than drifting past it.
    const jump = motionFor(byName('jumping'), 2);
    expect(jump.bob).toContain('840ms');
    expect(jump.bob).toMatch(/\b2\b/);
    expect(jump.bob).not.toContain('forwards');
  });

  it('plays a held state once across the whole run and keeps the end pose', () => {
    // failed is 1220ms x 2 and holds its final frame: one slump over 2440ms,
    // not two slumps.
    const failed = motionFor(byName('failed'), 2);
    expect(failed.bob).toContain('2440ms');
    expect(failed.bob).toContain('forwards');
    expect(failed.bob).toMatch(/\b1 forwards$/);
  });

  it('leans each way when running', () => {
    expect(allLayers('running-right', 1)).toContain('m-lean-r');
    expect(allLayers('running-left', 1)).toContain('m-lean-l');
  });

  it('keeps motion periods off the frame cycle so the loop does not lock', () => {
    // Shared factors make pose and drawing recur together, which reads as a
    // metronome. Idle is the one a user stares at longest.
    const idle = byName('idle');
    for (const shorthand of Object.values(motionFor(idle, 'infinite'))) {
      const period = Number(/ (\d+)ms/.exec(shorthand)?.[1]);
      expect(idle.durationMs % period).not.toBe(0);
    }
  });

  it('pivots on the feet, not the middle of the frame', () => {
    expect(MOTION_ORIGIN).toBe('50% 88.46%');
  });

  it('keeps its copied geometry in step with the shared constants', () => {
    // motion.ts cannot import the shared package: the renderer is sandboxed
    // over file:// with no module resolver. Catch any drift here instead.
    expect(BASELINE_Y).toBe(SPRITE_BASELINE_Y);
    expect(FRAME_H).toBe(SPRITE_SHEET.frameHeight);
  });

  it('imports nothing at runtime, so the sandboxed renderer can load it', () => {
    // A value import would emit a bare specifier and break the whole renderer.
    const src = readFileSync(new URL('./motion.ts', import.meta.url), 'utf8');
    const valueImports = src.match(/^import(?! type)[^;]+;/gm) ?? [];
    expect(valueImports).toEqual([]);
  });
});
