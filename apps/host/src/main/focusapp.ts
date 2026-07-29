import { execFile } from 'node:child_process';

/**
 * Bring an app to the front by bundle id — app-level activation only, which
 * needs no permissions. Window/tab-level focus (the exact session tab) has no
 * permission-free API on macOS, so this jumps to the app (D5).
 */
export function focusApp(bundleId: string | undefined): void {
  if (!bundleId) return;
  // execFile (no shell) so the bundle id can never be interpreted as a command.
  execFile('open', ['-b', bundleId], (err) => {
    if (err) console.warn(`[focus] could not activate ${bundleId}: ${err.message}`);
  });
}
