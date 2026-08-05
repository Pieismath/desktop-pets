import { SPRITE_BASELINE_Y } from './petspec.js';
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
 * process (hover hot-rects, Dock parking) and the renderer (CSS vars).
 *
 * The sprite is drawn at half the sheet's native frame size: art is authored
 * as pixels upscaled 4x into the 192x208 frame, so displaying at 0.5 lands on
 * an exact 2x pixel grid — crisp, and small enough to sit on the Dock.
 */
export const PET_SCALE = 0.25;

const SPRITE_W = Math.round(192 * PET_SCALE);
const SPRITE_H = Math.round(208 * PET_SCALE);
/** Room reserved above the sprite for the speech bubble. */
const SPRITE_TOP = 92;
const WINDOW_W = 220;

export const PET_WINDOW = {
  width: WINDOW_W,
  // Everything below the bubble follows the sprite, so changing PET_SCALE
  // resizes the window correctly without any other edits.
  height: SPRITE_TOP + SPRITE_H + 24,
  scale: PET_SCALE,
  sprite: { x: Math.round((WINDOW_W - SPRITE_W) / 2), y: SPRITE_TOP, w: SPRITE_W, h: SPRITE_H },
  bubble: { x: 2, y: 0, w: WINDOW_W - 4, h: 86 },
  tag: { y: SPRITE_TOP + SPRITE_H + 3, h: 18 },
  /** Distance from the window's top to the shared ground line. */
  feetOffset: SPRITE_TOP + Math.round(SPRITE_BASELINE_Y * PET_SCALE),
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
