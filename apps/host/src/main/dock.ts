import { screen } from 'electron';
import type { Display } from 'electron';

export type DockEdge = 'bottom' | 'left' | 'right' | 'none';

export interface DockStrip {
  edge: DockEdge;
  /** Thickness of the reserved strip in px (0 when hidden/absent). */
  thickness: number;
  /** Screen y of the Dock's top edge (bottom docks only). */
  top: number;
  /** Horizontal range the pet may patrol along. */
  minX: number;
  maxX: number;
}

/**
 * Locate the Dock with no extra permissions: `workArea` is `bounds` minus the
 * menu bar and the Dock, so the leftover strip is the Dock itself. An
 * auto-hidden Dock reserves ~0px, which we report as `none` and fall back to
 * standing on the bottom edge of the work area.
 */
export function dockStrip(display: Display): DockStrip {
  const b = display.bounds;
  const w = display.workArea;

  const bottom = b.y + b.height - (w.y + w.height);
  const left = w.x - b.x;
  const right = b.x + b.width - (w.x + w.width);

  const base = { minX: w.x + 8, maxX: w.x + w.width - 8 };

  if (bottom > 12) {
    return { edge: 'bottom', thickness: bottom, top: b.y + b.height - bottom, ...base };
  }
  if (left > 12) {
    return { edge: 'left', thickness: left, top: w.y + w.height, ...base };
  }
  if (right > 12) {
    return { edge: 'right', thickness: right, top: w.y + w.height, ...base };
  }
  // Auto-hidden or no Dock: stand on the bottom of the usable area.
  return { edge: 'none', thickness: 0, top: w.y + w.height, ...base };
}

export function dockStripForPoint(point: { x: number; y: number }): DockStrip {
  return dockStrip(screen.getDisplayNearestPoint(point));
}
