import { describe, expect, it, vi } from 'vitest';
import { Patrol, type WalkDirection } from './patrol.js';

interface Harness {
  patrol: Patrol;
  x: { value: number };
  walks: Array<WalkDirection | null>;
  allow: { value: boolean };
}

function harness(opts: { random?: () => number; minX?: number; maxX?: number; startX?: number } = {}): Harness {
  const x = { value: opts.startX ?? 500 };
  const walks: Array<WalkDirection | null> = [];
  const allow = { value: true };
  const patrol = new Patrol(
    {
      canWalk: () => allow.value,
      getX: () => x.value,
      setX: (v) => (x.value = v),
      bounds: () => ({ minX: opts.minX ?? 0, maxX: opts.maxX ?? 1000 }),
      onWalk: (d) => walks.push(d),
    },
    { random: opts.random ?? (() => 0.5), minPauseMs: 1000, maxPauseMs: 1000, speedPxPerSec: 100 },
  );
  return { patrol, x, walks, allow };
}

describe('Patrol', () => {
  it('strolls to a new position and reports start/stop', () => {
    vi.useFakeTimers();
    try {
      const h = harness({ random: () => 0.5, startX: 500 });
      h.patrol.start();
      vi.advanceTimersByTime(1000); // pause elapses -> walk begins
      expect(h.walks[0]).toBeTruthy();
      expect(h.patrol.isWalking()).toBe(true);

      vi.advanceTimersByTime(10000); // long enough to arrive
      expect(h.walks.at(-1)).toBeNull();
      expect(h.patrol.isWalking()).toBe(false);
      expect(h.x.value).not.toBe(500);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never walks while the pet has something to show', () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      h.allow.value = false;
      h.patrol.start();
      vi.advanceTimersByTime(20000);
      expect(h.walks).toHaveLength(0);
      expect(h.x.value).toBe(500);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops mid-stroll the moment the pet has something to say', () => {
    vi.useFakeTimers();
    try {
      const h = harness({ startX: 500 });
      h.patrol.start();
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(200);
      const partway = h.x.value;
      expect(partway).not.toBe(500);

      h.allow.value = false;
      vi.advanceTimersByTime(500);
      expect(h.walks.at(-1)).toBeNull();
      expect(h.patrol.isWalking()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns around rather than walking off the end of the Dock', () => {
    vi.useFakeTimers();
    try {
      // hard against the left edge, and random() picks "left" first
      const h = harness({ random: () => 0.1, startX: 10, minX: 0, maxX: 1000 });
      h.patrol.start();
      vi.advanceTimersByTime(1000);
      expect(h.walks[0]).toBe('right');
      vi.advanceTimersByTime(20000);
      expect(h.x.value).toBeGreaterThan(10);
      expect(h.x.value).toBeLessThanOrEqual(1000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays inside the walkable bounds', () => {
    vi.useFakeTimers();
    try {
      const h = harness({ random: () => 0.99, startX: 300, minX: 250, maxX: 360 });
      h.patrol.start();
      for (let i = 0; i < 8; i++) vi.advanceTimersByTime(12000);
      expect(h.x.value).toBeGreaterThanOrEqual(250);
      expect(h.x.value).toBeLessThanOrEqual(360);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop() cancels everything pending', () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      h.patrol.start();
      h.patrol.stop();
      vi.advanceTimersByTime(30000);
      expect(h.walks).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
