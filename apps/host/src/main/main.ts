import fs from 'node:fs';
import path from 'node:path';
import { Menu, app, dialog } from 'electron';
import {
  DEFAULT_REACTION_MAP,
  classifyToolCall,
  sanitizeSpeech,
} from '@desktop-pets/shared';
import type { PetAction, PetViewModel, Reaction, SpriteStateName } from '@desktop-pets/shared';
import { IpcServer } from './ipc-server.js';
import { resolveActivePet } from './pets.js';
import { PetWindow } from './petwindow.js';
import { RiskConfigStore } from './risk-config.js';
import type { AgentSession } from './sessions.js';
import { SessionManager } from './sessions.js';
import { runSmoke } from './smoke.js';
import { StateStore } from './store.js';
import { createTray } from './tray.js';

const smokeMode = process.argv.includes('--smoke');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const smokeOut = outArg ? outArg.slice('--out='.length) : path.join(process.cwd(), 'captures');
const logArg = process.argv.find((a) => a.startsWith('--log-events='));
// Debug: self-capture the pet window the first time an alarm renders.
const alarmCaptureArg = process.argv.find((a) => a.startsWith('--capture-on-alarm='));

if (!smokeMode && !app.requestSingleInstanceLock()) {
  app.quit();
}

function spriteFor(reaction: Reaction, session: AgentSession | undefined): SpriteStateName {
  if (reaction === 'running') return session?.runFlip ? 'running-left' : 'running-right';
  return DEFAULT_REACTION_MAP[reaction];
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
}

app.whenReady().then(async () => {
  try {
    if (process.platform === 'darwin') app.dock?.hide();

    const store = new StateStore(smokeMode);
    const active = resolveActivePet(store.get().activePetId);
    console.log(
      `[pets] active: ${active.pet.displayName} (${active.pet.id}) — ${active.pet.license} by ${active.pet.author}`,
    );

    const win = new PetWindow({
      slot: 'home',
      slotIndex: 0,
      sheetUrl: active.sheetUrl,
      tag: active.pet.displayName,
      store,
      onAction: (w, action: PetAction) => {
        switch (action.type) {
          case 'click':
            w.playOneShot('waving');
            break;
          case 'dismiss-alarm': {
            const session = sessions.displaySession();
            if (session?.alarm) sessions.dismissAlarm(session.key);
            else w.patchVM({ alarm: false, bubble: undefined });
            break;
          }
          case 'button':
            console.log(`[pet] button pressed: ${action.id}`);
            break;
          case 'context-menu':
            Menu.buildFromTemplate([
              { label: 'Wave', click: () => w.playOneShot('waving') },
              { type: 'separator' },
              { label: 'Quit Desktop Pets', click: () => app.quit() },
            ]).popup({ window: w.win });
            break;
        }
      },
    });

    const renderHome = (): void => {
      const session = sessions.displaySession();
      const vm: PetViewModel = {
        sheetUrl: active.sheetUrl,
        spriteState: session ? spriteFor(session.status, session) : 'idle',
        tag: session ? session.name : active.pet.displayName,
      };
      if (session?.oneShot) {
        vm.oneShot = { state: spriteFor(session.oneShot.reaction, session), nonce: session.oneShot.nonce };
      }
      if (session?.bubbleText) {
        vm.bubble = { text: session.bubbleText };
      }
      if (session?.waitingSince) {
        vm.badge = formatDuration(Date.now() - session.waitingSince);
      }
      if (session?.alarm) {
        // Risk alarm outranks everything else on screen (sticky until dismissed).
        vm.spriteState = 'alarm';
        vm.alarm = true;
        vm.bubble = {
          text: session.alarm.detail
            ? `${session.alarm.reason} — ${session.alarm.detail}`
            : session.alarm.reason,
        };
        vm.badge = formatDuration(Date.now() - session.alarm.since);
        delete vm.oneShot;
      }
      win.setVM(vm);
      if (vm.alarm && alarmCaptureArg && !alarmCaptured) {
        alarmCaptured = true;
        setTimeout(() => {
          void win.capture().then((png) => fs.writeFileSync(alarmCaptureArg.slice('--capture-on-alarm='.length), png));
        }, 450);
      }
    };
    let alarmCaptured = false;

    const riskConfig = new RiskConfigStore();
    const sessions = new SessionManager({
      sanitize: (t) => sanitizeSpeech(t),
      onChange: renderHome,
      classify: (call) => classifyToolCall(call, riskConfig.get()),
    });

    const eventLog = logArg ? logArg.slice('--log-events='.length) : undefined;
    const ipc = new IpcServer({
      onMessage: (conn, msg) => {
        if (eventLog) {
          fs.appendFileSync(
            eventLog,
            JSON.stringify({ at: new Date().toISOString(), role: conn.role, msg }) + '\n',
          );
        }
        sessions.handleMessage(conn, msg);
      },
      onDisconnect: (conn) => sessions.onDisconnect(conn),
    });
    await ipc.start();
    console.log('[ipc] listening');

    // Refresh blocked-duration badges + drop dead sessions.
    setInterval(() => {
      sessions.sweepStale(30 * 60_000);
      if (sessions.displaySession()?.waitingSince) renderHome();
    }, 10_000);

    app.on('will-quit', () => ipc.stop());

    if (smokeMode) {
      await runSmoke(win, smokeOut);
    } else {
      createTray({ onQuit: () => win.destroy() });
    }
  } catch (err) {
    console.error(err);
    if (!smokeMode) {
      dialog.showErrorBox('Desktop Pets failed to start', (err as Error).message);
    }
    app.exit(1);
  }
});

// Background/tray app: closing every window must not quit outside smoke mode.
app.on('window-all-closed', () => {
  if (smokeMode) app.quit();
});
