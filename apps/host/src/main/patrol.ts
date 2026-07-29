/**
 * Idle wandering: every so often the pet strolls a short distance along the
 * Dock and then settles again. It only ever walks when there is nothing to
 * report — a blocked, alarmed or speaking pet stays put so you always know
 * where to click.
 */

export type WalkDirection = 'left' | 'right';

export interface PatrolHooks {
  /** May the pet wander right now? (idle, not dragged, not blocked/alarmed) */
  canWalk: () => boolean;
  getX: () => number;
  setX: (x: number) => void;
  bounds: () => { minX: number; maxX: number };
  /** null when the pet stops walking. */
  onWalk: (dir: WalkDirection | null) => void;
}

export interface PatrolOptions {
  speedPxPerSec?: number;
  minPauseMs?: number;
  maxPauseMs?: number;
  minDistance?: number;
  maxDistance?: number;
  /** Injectable for tests. */
  random?: () => number;
}

const FRAME_MS = 33; // ~30fps is plenty for a strolling sprite

export class Patrol {
  private tickTimer: NodeJS.Timeout | undefined;
  private stepTimer: NodeJS.Timeout | undefined;
  private walking = false;
  private readonly rand: () => number;
  private readonly speed: number;
  private readonly minPause: number;
  private readonly maxPause: number;
  private readonly minDist: number;
  private readonly maxDist: number;

  constructor(
    private readonly hooks: PatrolHooks,
    opts: PatrolOptions = {},
  ) {
    this.rand = opts.random ?? Math.random;
    this.speed = opts.speedPxPerSec ?? 46;
    this.minPause = opts.minPauseMs ?? 7000;
    this.maxPause = opts.maxPauseMs ?? 20000;
    this.minDist = opts.minDistance ?? 60;
    this.maxDist = opts.maxDistance ?? 260;
  }

  start(): void {
    this.scheduleNext();
  }

  private scheduleNext(): void {
    const wait = this.minPause + this.rand() * (this.maxPause - this.minPause);
    this.tickTimer = setTimeout(() => this.maybeWalk(), wait);
  }

  private maybeWalk(): void {
    if (this.walking || !this.hooks.canWalk()) {
      this.scheduleNext();
      return;
    }
    const { minX, maxX } = this.hooks.bounds();
    if (maxX <= minX) {
      this.scheduleNext();
      return;
    }
    const from = this.hooks.getX();
    const distance = this.minDist + this.rand() * (this.maxDist - this.minDist);
    // Prefer a direction with room; bounce off the ends of the Dock.
    let dir: WalkDirection = this.rand() < 0.5 ? 'left' : 'right';
    if (from - distance < minX) dir = 'right';
    if (from + distance > maxX) dir = 'left';
    const target = Math.max(minX, Math.min(maxX, dir === 'left' ? from - distance : from + distance));
    if (Math.abs(target - from) < 12) {
      this.scheduleNext();
      return;
    }
    this.walk(from, target, dir);
  }

  private walk(from: number, target: number, dir: WalkDirection): void {
    this.walking = true;
    this.hooks.onWalk(dir);
    const stepPx = (this.speed * FRAME_MS) / 1000;
    let x = from;

    const step = (): void => {
      // Anything worth showing interrupts the stroll immediately.
      if (!this.hooks.canWalk()) return this.finish();
      const remaining = target - x;
      if (Math.abs(remaining) <= stepPx) {
        this.hooks.setX(target);
        return this.finish();
      }
      x += Math.sign(remaining) * stepPx;
      this.hooks.setX(x);
      this.stepTimer = setTimeout(step, FRAME_MS);
    };
    step();
  }

  private finish(): void {
    this.walking = false;
    if (this.stepTimer) clearTimeout(this.stepTimer);
    this.stepTimer = undefined;
    this.hooks.onWalk(null);
    this.scheduleNext();
  }

  isWalking(): boolean {
    return this.walking;
  }

  stop(): void {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    if (this.stepTimer) clearTimeout(this.stepTimer);
    this.tickTimer = undefined;
    this.stepTimer = undefined;
    this.walking = false;
  }
}
