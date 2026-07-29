import type { SpriteStateName } from './reactions.js';

/** Button rendered inside a speech bubble. */
export interface BubbleButton {
  id: string;
  label: string;
  kind: 'approve' | 'deny' | 'focus' | 'plain';
}

export interface BubbleVM {
  /** Already sanitised by the host — the renderer never sees raw agent text. */
  text: string;
  buttons?: BubbleButton[];
  /** Seconds remaining on a pending decision, if any. */
  countdownMs?: number;
}

/** One-shot reaction playback layered over the persistent state. */
export interface OneShotVM {
  state: SpriteStateName;
  /** Changes on every trigger so the renderer replays identical states. */
  nonce: number;
}

/** Renderer → main actions. */
export type PetAction =
  | { type: 'click' }
  | { type: 'button'; id: string }
  | { type: 'dismiss-alarm' }
  | { type: 'context-menu' };

/**
 * Window layout constants — single source of truth for both the main
 * process (hover hot-rects for click-through) and the renderer (CSS vars).
 */
export const PET_WINDOW = {
  width: 260,
  height: 330,
  sprite: { x: 34, y: 98, w: 192, h: 208 },
  bubble: { x: 4, y: 2, w: 252, h: 118 },
  tag: { y: 310, h: 20 },
} as const;

/** Everything the pet window needs to render. Pushed whole; renderer is dumb. */
export interface PetViewModel {
  /** file:// URL of the active spritesheet. */
  sheetUrl: string;
  /** Persistent sprite state (loops indefinitely until replaced). */
  spriteState: SpriteStateName;
  oneShot?: OneShotVM;
  /** Identity pill under the pet (session/project name). */
  tag?: string;
  bubble?: BubbleVM;
  /** Small status badge, e.g. blocked duration ("4m"). */
  badge?: string;
  dnd?: boolean;
  /** True while an alarm is undismissed — renderer adds the shake/urgency layer. */
  alarm?: boolean;
  /** Blocked-duration urgency (0 none, 1 waiting a while, 2 waiting a long time). */
  urgency?: 0 | 1 | 2;
}
