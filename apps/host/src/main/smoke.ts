import fs from 'node:fs';
import path from 'node:path';
import { app, powerMonitor } from 'electron';
import { SPRITE_STATES } from '@desktop-pets/shared';
import type { PetViewModel } from '@desktop-pets/shared';
import type { ManagedWindow } from './petmanager.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SmokeReport {
  statesCaptured: string[];
  animationAdvances: boolean;
  idleSeconds: number;
  consoleErrors: string[];
  ok: boolean;
}

/**
 * Launch verification for a machine that can't watch the screen: drive every
 * sprite state, self-capture the (transparent) window to PNGs, prove the
 * steps() animation advances, and fail on any renderer console error.
 */
export async function runSmoke(win: ManagedWindow, outDir: string): Promise<never> {
  fs.mkdirSync(outDir, { recursive: true });
  const captured: string[] = [];

  await win.whenReady;
  await delay(350);

  for (const state of SPRITE_STATES) {
    const vm: PetViewModel = {
      sheetUrl: win.getVM().sheetUrl,
      spriteState: state.name,
    };
    if (state.name === 'waiting') {
      vm.bubble = {
        text: 'Claude needs permission: Bash',
        buttons: [
          { id: 'approve', label: 'Approve', kind: 'approve' },
          { id: 'deny', label: 'Deny', kind: 'deny' },
          { id: 'focus', label: 'Focus', kind: 'focus' },
        ],
        countdownMs: 42000,
      };
      vm.badge = '4m';
    }
    if (state.name === 'alarm') {
      vm.alarm = true;
      vm.bubble = {
        text: 'About to run a destructive command',
        buttons: [
          { id: 'approve', label: 'Allow', kind: 'approve' },
          { id: 'deny', label: 'Deny', kind: 'deny' },
        ],
      };
    }
    win.setVM(vm);
    await delay(300);
    const png = await win.capture();
    fs.writeFileSync(path.join(outDir, `${state.name}.png`), png);
    captured.push(state.name);
  }

  // Animation advance: `working` steps every ~137ms, so two captures 350ms
  // apart must differ if the CSS steps() animation is actually running.
  win.setVM({ sheetUrl: win.getVM().sheetUrl, spriteState: 'working' });
  await delay(200);
  const a = await win.capture();
  await delay(350);
  const b = await win.capture();
  const animationAdvances = !a.equals(b);

  const idleSeconds = powerMonitor.getSystemIdleTime();

  const report: SmokeReport = {
    statesCaptured: captured,
    animationAdvances,
    idleSeconds,
    consoleErrors: win.consoleErrors,
    ok:
      captured.length === SPRITE_STATES.length &&
      animationAdvances &&
      win.consoleErrors.length === 0 &&
      Number.isFinite(idleSeconds),
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`[smoke] ${report.ok ? 'OK' : 'FAILED'}: ${JSON.stringify(report)}`);
  app.exit(report.ok ? 0 : 1);
  return new Promise<never>(() => {});
}
