import { exec } from 'node:child_process';
import { powerMonitor } from 'electron';

/**
 * Environment providers, each behind an interface so the zero-permission
 * macOS implementations (D2–D4) can be swapped for a native addon later
 * without touching the escalation engine.
 */

export interface FocusProvider {
  start(onChange: (bundleId: string | undefined) => void): void;
  current(): string | undefined;
  stop(): void;
}

export interface IdleProvider {
  seconds(): number;
}

/**
 * Frontmost app via `lsappinfo` — no Accessibility or Screen Recording
 * permission, ~10 ms, app identity only (never window titles). Polls because
 * there is no permission-free change event.
 */
export class LsappinfoFocusProvider implements FocusProvider {
  private timer: NodeJS.Timeout | undefined;
  private bundleId: string | undefined;

  constructor(private readonly intervalMs = 1500) {}

  start(onChange: (bundleId: string | undefined) => void): void {
    // Test seam: pin the frontmost app so the escalation ladder can be driven
    // deterministically in a live capture. Only read when explicitly set.
    const fake = process.env['DESKTOP_PETS_FAKE_FOCUS'];
    if (fake) {
      this.bundleId = fake;
      onChange(fake);
      return;
    }
    const poll = (): void => {
      exec('lsappinfo info -only bundleid "$(lsappinfo front)"', { timeout: 1000 }, (err, stdout) => {
        if (err) return;
        const match = /"CFBundleIdentifier"\s*=\s*"([^"]+)"/.exec(stdout);
        const next = match?.[1];
        if (next !== this.bundleId) {
          this.bundleId = next;
          onChange(next);
        }
      });
    };
    poll();
    this.timer = setInterval(poll, this.intervalMs);
  }

  current(): string | undefined {
    return this.bundleId;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** System idle seconds via Electron's powerMonitor — no permissions (D3). */
export class PowerMonitorIdleProvider implements IdleProvider {
  seconds(): number {
    const fake = process.env['DESKTOP_PETS_FAKE_IDLE'];
    if (fake !== undefined) return Number(fake) || 0;
    try {
      return powerMonitor.getSystemIdleTime();
    } catch {
      return 0;
    }
  }
}

export interface DndProviderOptions {
  /** Conferencing bundle ids that auto-enable DND while frontmost. */
  autoApps: string[];
  isManual: () => boolean;
}

/**
 * DND (D4): no clean macOS API for "screen is being shared / call active",
 * so DND is a manual toggle PLUS a conservative heuristic — a known
 * conferencing app being *frontmost* auto-enables it. Never disables a
 * manual DND.
 */
export class DndController {
  private autoApps: Set<string>;

  constructor(private readonly opts: DndProviderOptions) {
    this.autoApps = new Set(opts.autoApps);
  }

  setAutoApps(apps: string[]): void {
    this.autoApps = new Set(apps);
  }

  isActive(focusedBundleId: string | undefined): boolean {
    if (this.opts.isManual()) return true;
    return focusedBundleId !== undefined && this.autoApps.has(focusedBundleId);
  }
}

export const DEFAULT_CONFERENCING_APPS = [
  'us.zoom.xos',
  'com.microsoft.teams2',
  'com.microsoft.teams',
  'Cisco-Systems.Spark', // Webex
  'com.cisco.webexmeetingsapp',
  'com.apple.FaceTime',
  'com.google.Chrome.app.kjgfgldnnfoeklkmfkjfagphfepbbdan', // Meet PWA
  'com.hnc.Discord',
];
