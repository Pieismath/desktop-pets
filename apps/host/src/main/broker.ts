import type { Decision } from '@desktop-pets/shared';
import type { DecisionRequest } from './sessions.js';

export interface PendingDecision {
  tool: string;
  since: number;
  deadline: number;
  respond: (decision: Decision, reason?: string) => void;
  timer: NodeJS.Timeout;
}

export interface BrokerOptions {
  /** Host-side max hold; must stay under the PermissionRequest hook timeout. */
  maxHoldMs: number;
  onResolved: (key: string, decision: Decision) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (t: NodeJS.Timeout) => void;
}

/**
 * Holds blocked-on-permission requests so the user can answer from the pet.
 * A held request resolves in exactly one way: the user clicks approve/deny,
 * the user focuses the terminal (release 'none' → native prompt appears), or
 * the hold times out (release 'none'). Resolving is idempotent and always
 * answers the waiting hook exactly once.
 */
export class DecisionBroker {
  private readonly pending = new Map<string, PendingDecision>();
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearTimer: (t: NodeJS.Timeout) => void;

  constructor(private readonly opts: BrokerOptions) {
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t));
  }

  /** Begin holding a PermissionRequest. Supersedes any earlier hold for the key. */
  hold(req: DecisionRequest): void {
    const key = req.session.key;
    this.resolve(key, 'none', 'superseded'); // clear any prior hold cleanly
    const since = this.now();
    const timer = this.setTimer(() => this.resolve(key, 'none', 'timeout'), this.opts.maxHoldMs);
    this.pending.set(key, {
      tool: req.payload.tool_name ?? 'a tool',
      since,
      deadline: since + this.opts.maxHoldMs,
      respond: req.respond,
      timer,
    });
  }

  has(key: string): boolean {
    return this.pending.has(key);
  }

  get(key: string): PendingDecision | undefined {
    return this.pending.get(key);
  }

  keys(): string[] {
    return [...this.pending.keys()];
  }

  /** Answer the waiting hook. No-op if nothing is held for this key. */
  resolve(key: string, decision: Decision, reason?: string): boolean {
    const p = this.pending.get(key);
    if (!p) return false;
    this.pending.delete(key);
    this.clearTimer(p.timer);
    p.respond(decision, reason);
    this.opts.onResolved(key, decision);
    return true;
  }

  /** Release every hold as 'none' (host shutting down). */
  releaseAll(reason: string): void {
    for (const key of this.keys()) this.resolve(key, 'none', reason);
  }
}
