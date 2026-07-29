import fs from 'node:fs';
import path from 'node:path';
import { Menu, app, dialog } from 'electron';
import { DEFAULT_REACTION_MAP, classifyToolCall, resolveReactionMap, sanitizeSpeech } from '@desktop-pets/shared';
import type { PetAction, PetViewModel, Reaction, SpriteStateName } from '@desktop-pets/shared';
import { ConfigStore } from './config.js';
import {
  computeTier,
  tierFiresNotification,
  tierQueuesDigest,
  tierShowsBubble,
  agentBundleId,
} from './escalation.js';
import { IpcServer } from './ipc-server.js';
import { ElectronNotifier } from './notify.js';
import { resolveActivePet } from './pets.js';
import { PetWindow } from './petwindow.js';
import { DndController, LsappinfoFocusProvider, PowerMonitorIdleProvider } from './providers.js';
import { RiskConfigStore } from './risk-config.js';
import type { AgentSession, SurfaceMoment } from './sessions.js';
import { SessionManager } from './sessions.js';
import { runSmoke } from './smoke.js';
import { StateStore } from './store.js';
import { createTray } from './tray.js';

const smokeMode = process.argv.includes('--smoke');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const smokeOut = outArg ? outArg.slice('--out='.length) : path.join(process.cwd(), 'captures');
const logArg = process.argv.find((a) => a.startsWith('--log-events='));
const alarmCaptureArg = process.argv.find((a) => a.startsWith('--capture-on-alarm='));
// Debug: after the first surfaced moment, dump {vm, tier, notified} to a file.
const stateCaptureArg = process.argv.find((a) => a.startsWith('--capture-state='));

if (!smokeMode && !app.requestSingleInstanceLock()) {
  app.quit();
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
    const config = new ConfigStore(smokeMode);
    const active = resolveActivePet(store.get().activePetId);
    console.log(
      `[pets] active: ${active.pet.displayName} (${active.pet.id}) — ${active.pet.license} by ${active.pet.author}`,
    );

    // Reaction → sprite-state map, user overrides validated against known names.
    const resolved = resolveReactionMap(config.get().reactionMap);
    for (const issue of resolved.issues) console.warn(`[config] reactionMap: ${issue.problem} ${issue.reaction}`);
    let reactionMap = resolved.map;
    const spriteFor = (reaction: Reaction, session: AgentSession | undefined): SpriteStateName => {
      if (reaction === 'running') return session?.runFlip ? 'running-left' : 'running-right';
      return reactionMap[reaction] ?? DEFAULT_REACTION_MAP[reaction];
    };

    // --- environment (all zero-permission, behind swappable interfaces) ---
    let manualDnd = store.get().dndManual === true;
    const focus = new LsappinfoFocusProvider();
    const idle = new PowerMonitorIdleProvider();
    const dnd = new DndController({ autoApps: config.get().dnd.autoApps, isManual: () => manualDnd });
    const notifier = new ElectronNotifier();

    const dndActive = (): boolean => dnd.isActive(focus.current());
    const currentTier = () =>
      computeTier({
        idleSeconds: idle.seconds(),
        focusedBundleId: focus.current(),
        agentBundleId: agentBundleId(sessions.displaySession() ?? {}),
        dnd: dndActive(),
        thresholds: config.get().escalation,
      });

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
              { label: `Do Not Disturb`, type: 'checkbox', checked: manualDnd, click: () => toggleDnd() },
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
      const tier = currentTier();
      const vm: PetViewModel = {
        sheetUrl: active.sheetUrl,
        spriteState: session ? spriteFor(session.status, session) : 'idle',
        tag: session ? session.name : active.pet.displayName,
        dnd: dndActive(),
      };
      if (session?.oneShot) {
        vm.oneShot = { state: spriteFor(session.oneShot.reaction, session), nonce: session.oneShot.nonce };
      }
      // Escalation gates the bubble: silent animation when the agent's own app
      // is focused (or DND); a bubble only once we're allowed to be louder.
      if (session?.bubbleText && tierShowsBubble(tier)) {
        vm.bubble = { text: session.bubbleText };
      }
      if (session?.waitingSince) {
        vm.badge = formatDuration(Date.now() - session.waitingSince);
      }
      if (session?.alarm) {
        // Alarm outranks the ladder and DND: always maximally visible.
        vm.spriteState = 'alarm';
        vm.alarm = true;
        vm.bubble = {
          text: session.alarm.detail ? `${session.alarm.reason} — ${session.alarm.detail}` : session.alarm.reason,
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

    const notifications: Array<{ title: string; body: string }> = [];
    const onSurface = (moment: SurfaceMoment): void => {
      // Alarms are surfaced on-screen already; still notify when the user is away.
      const tier = currentTier();
      let notified = false;
      if (moment.kind === 'risky') {
        if (tierFiresNotification(tier) || tier === 'silent') {
          notifier.fire(moment.title, moment.body);
          notified = true;
        }
      } else {
        if (tierFiresNotification(tier)) {
          notifier.fire(moment.title, moment.body);
          notified = true;
        }
        if (tierQueuesDigest(tier)) digest.push({ at: Date.now(), ...moment, session: undefined });
      }
      if (notified) notifications.push({ title: moment.title, body: moment.body });
      if (stateCaptureArg) {
        // renderHome() runs right after this via onChange; capture the settled VM.
        setTimeout(() => {
          fs.writeFileSync(
            stateCaptureArg.slice('--capture-state='.length),
            JSON.stringify({ tier, notified, vm: win.getVM(), notifications, moment: { kind: moment.kind } }, null, 2),
          );
        }, 60);
      }
    };

    // Minimal in-memory digest collector; stage 7 replaces with bounded history.
    const digest: Array<{ at: number; kind: string; title: string; body: string; session: undefined }> = [];

    const riskConfig = new RiskConfigStore();
    const sessions = new SessionManager({
      sanitize: (t) => sanitizeSpeech(t),
      onChange: renderHome,
      classify: (call) => classifyToolCall(call, riskConfig.get()),
      onSurface,
    });

    const toggleDnd = (): void => {
      manualDnd = !manualDnd;
      store.update({ dndManual: manualDnd });
      console.log(`[dnd] manual ${manualDnd ? 'on' : 'off'}`);
      renderHome();
      refreshTray();
    };

    focus.start(() => renderHome());
    config.watch((next) => {
      dnd.setAutoApps(next.dnd.autoApps);
      const r = resolveReactionMap(next.reactionMap);
      reactionMap = r.map;
      renderHome();
    });

    const eventLog = logArg ? logArg.slice('--log-events='.length) : undefined;
    const ipc = new IpcServer({
      onMessage: (conn, msg) => {
        if (eventLog) {
          fs.appendFileSync(eventLog, JSON.stringify({ at: new Date().toISOString(), role: conn.role, msg }) + '\n');
        }
        sessions.handleMessage(conn, msg);
      },
      onDisconnect: (conn) => sessions.onDisconnect(conn),
    });
    await ipc.start();
    console.log('[ipc] listening');

    setInterval(() => {
      sessions.sweepStale(30 * 60_000);
      if (sessions.displaySession()?.waitingSince || sessions.displaySession()?.alarm) renderHome();
    }, 10_000);

    app.on('will-quit', () => {
      focus.stop();
      ipc.stop();
    });

    let refreshTray = (): void => {};
    if (smokeMode) {
      await runSmoke(win, smokeOut);
    } else {
      const tray = createTray({
        isDnd: () => manualDnd,
        onToggleDnd: toggleDnd,
        onQuit: () => win.destroy(),
      });
      refreshTray = () => tray.refresh();
    }
  } catch (err) {
    console.error(err);
    if (!smokeMode) dialog.showErrorBox('Desktop Pets failed to start', (err as Error).message);
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  if (smokeMode) app.quit();
});
