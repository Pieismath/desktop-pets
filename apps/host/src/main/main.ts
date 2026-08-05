import fs from 'node:fs';
import path from 'node:path';
import { Menu, app, dialog } from 'electron';
import {
  DEFAULT_REACTION_MAP,
  classifyToolCall,
  resolveReactionMap,
  sanitizeSpeech,
  userPetsDir,
} from '@desktop-pets/shared';
import type { BubbleButton, PetAction, PetViewModel, Reaction, SpriteStateName } from '@desktop-pets/shared';
import { DecisionBroker } from './broker.js';
import { ConfigStore } from './config.js';
import { buildDigest, digestHeight, renderDigestHtml, type LiveBlocked } from './digest.js';
import { DigestWindow } from './digestwindow.js';
import { agentBundleId, computeTier, tierFiresNotification, tierShowsBubble } from './escalation.js';
import { focusApp } from './focusapp.js';
import { HistoryStore } from './history.js';
import { IpcServer } from './ipc-server.js';
import { ElectronNotifier } from './notify.js';
import { Patrol, type WalkDirection } from './patrol.js';
import { petMenuEntries } from './petmenu.js';
import { PetManager, type PetKey } from './petmanager.js';
import { discoverPets, resolveActivePet } from './pets.js';
import { DndController, LsappinfoFocusProvider, PowerMonitorIdleProvider } from './providers.js';
import { RiskConfigStore } from './risk-config.js';
import type { AgentSession, DecisionRequest, SurfaceMoment } from './sessions.js';
import { SessionManager } from './sessions.js';
import { runSmoke } from './smoke.js';
import { StateStore } from './store.js';
import { createTray } from './tray.js';

const smokeMode = process.argv.includes('--smoke');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const smokeOut = outArg ? outArg.slice('--out='.length) : path.join(process.cwd(), 'captures');
const logArg = process.argv.find((a) => a.startsWith('--log-events='));
const alarmCaptureArg = process.argv.find((a) => a.startsWith('--capture-on-alarm='));
const stateCaptureArg = process.argv.find((a) => a.startsWith('--capture-state='));
// Debug: simulate a pet button click on the next held decision (proves the
// approve/deny/focus path without a human clicking).
const autoDecideArg = process.argv.find((a) => a.startsWith('--auto-decide='));
// Debug: write the live pet inventory (one entry per concurrent session pet).
const dumpPetsArg = process.argv.find((a) => a.startsWith('--dump-pets='));
const autoDigestArg = process.argv.find((a) => a.startsWith('--auto-digest='));
const petArg = process.argv.find((a) => a.startsWith('--pet='));
// Debug/support: dump the character picker exactly as the menu bar builds it.
const dumpMenuArg = process.argv.find((a) => a.startsWith('--dump-pet-menu='));
const capturePetsArg = process.argv.find((a) => a.startsWith('--capture-pets='));
const capturePetsDir = capturePetsArg ? capturePetsArg.slice('--capture-pets='.length) : undefined;

// Host-side hold for a blocked-on-permission request. Must stay under the
// PermissionRequest hook timeout (600s in settings); on expiry we release
// 'none' and Claude Code's own prompt takes over.
const MAX_HOLD_MS = 570_000;
const MAX_PETS = 4;

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

/** Blocked-duration urgency: the pet escalates visibly the longer it waits. */
function urgencyFor(blockedMs: number): 0 | 1 | 2 {
  if (blockedMs >= 10 * 60_000) return 2;
  if (blockedMs >= 2 * 60_000) return 1;
  return 0;
}
const RENOTIFY_MS = 5 * 60_000;

app.whenReady().then(async () => {
  try {
    if (process.platform === 'darwin') app.dock?.hide();

    const store = new StateStore(smokeMode);
    const config = new ConfigStore(smokeMode);
    const preferredPetId = petArg ? petArg.slice('--pet='.length) : store.get().activePetId;
    let active = resolveActivePet(preferredPetId);
    console.log(
      `[pets] active: ${active.pet.displayName} (${active.pet.id}) · ${active.pet.license} by ${active.pet.author}`,
    );

    const resolved = resolveReactionMap(config.get().reactionMap);
    for (const issue of resolved.issues) console.warn(`[config] reactionMap: ${issue.problem} ${issue.reaction}`);
    let reactionMap = resolved.map;
    const spriteFor = (reaction: Reaction, session: AgentSession | undefined): SpriteStateName => {
      if (reaction === 'running') return session?.runFlip ? 'running-left' : 'running-right';
      return reactionMap[reaction] ?? DEFAULT_REACTION_MAP[reaction];
    };

    // --- environment (zero-permission, swappable) ---
    let manualDnd = store.get().dndManual === true;
    const focus = new LsappinfoFocusProvider();
    const idle = new PowerMonitorIdleProvider();
    const dnd = new DndController({ autoApps: config.get().dnd.autoApps, isManual: () => manualDnd });
    const notifier = new ElectronNotifier();
    const dndActive = (): boolean => dnd.isActive(focus.current());

    const isAgentFocused = (session: AgentSession): boolean => {
      const front = focus.current();
      const agent = agentBundleId(session);
      return !!front && !!agent && front === agent;
    };

    const tierFor = (session: AgentSession | undefined) =>
      computeTier({
        idleSeconds: idle.seconds(),
        focusedBundleId: focus.current(),
        agentBundleId: session ? agentBundleId(session) : undefined,
        dnd: dndActive(),
        thresholds: config.get().escalation,
      });

    // --- decision broker (the approve/deny/focus payoff) ---
    const broker = new DecisionBroker({
      maxHoldMs: MAX_HOLD_MS,
      onResolved: (key, decision) => {
        const s = sessions.get(key);
        if (s && decision !== 'none') {
          delete s.waitingSince;
          s.status = decision === 'allow' ? 'working' : 'idle';
        }
        renderAll();
      },
    });

    const history = new HistoryStore({ ephemeral: smokeMode });
    const digestWindow = new DigestWindow();
    const capturedNotifications: Array<{ title: string; body: string }> = [];

    const openDigest = (near: { x: number; y: number }): void => {
      const liveBlocked: LiveBlocked[] = sessions
        .list()
        .filter((s) => s.waitingSince || s.alarm)
        .map((s) => ({ project: s.name, since: s.alarm?.since ?? s.waitingSince ?? Date.now(), alarm: !!s.alarm }));
      const summary = buildDigest(history.all(), liveBlocked, Date.now());
      digestWindow.toggle(renderDigestHtml(summary, Date.now()), near, digestHeight(summary));
    };

    // Pets that are currently strolling along the Dock, and which way.
    const walking = new Map<PetKey, WalkDirection>();

    const buildVM = (session: AgentSession): PetViewModel => {
      const tier = tierFor(session);
      const pending = broker.get(session.key);
      const stroll = walking.get(session.key);
      const vm: PetViewModel = {
        sheetUrl: pets.sheetUrl(),
        spriteState: stroll
          ? stroll === 'left'
            ? 'running-left'
            : 'running-right'
          : spriteFor(session.status, session),
        tag: session.name,
        dnd: dndActive(),
      };
      if (session.oneShot && !pending && !session.alarm) {
        vm.oneShot = { state: spriteFor(session.oneShot.reaction, session), nonce: session.oneShot.nonce };
      }

      const decisionButtons: BubbleButton[] = [
        { id: 'approve', label: 'Approve', kind: 'approve' },
        { id: 'deny', label: 'Deny', kind: 'deny' },
        { id: 'focus', label: 'Focus', kind: 'focus' },
      ];

      if (pending) {
        vm.spriteState = 'waiting';
        vm.bubble = {
          text: `Needs permission: ${pending.tool}`,
          buttons: decisionButtons,
          countdownMs: Math.max(0, pending.deadline - Date.now()),
        };
        vm.badge = formatDuration(Date.now() - (session.waitingSince ?? pending.since));
      } else if (session.bubbleText && tierShowsBubble(tier)) {
        vm.bubble = { text: session.bubbleText };
      }

      if (!pending && session.waitingSince) {
        vm.badge = formatDuration(Date.now() - session.waitingSince);
      }

      // Duration escalation: the longer blocked, the more urgent the pet looks.
      const blockedSince = session.waitingSince ?? (pending ? pending.since : undefined);
      if (blockedSince !== undefined) {
        const u = urgencyFor(Date.now() - blockedSince);
        if (u > 0) vm.urgency = u;
      }

      if (session.alarm) {
        // Alarm outranks the ladder and DND; keep decision buttons if one is held.
        vm.spriteState = 'alarm';
        vm.alarm = true;
        vm.bubble = {
          text: session.alarm.detail ? `${session.alarm.reason}: ${session.alarm.detail}` : session.alarm.reason,
          ...(pending ? { buttons: decisionButtons } : {}),
        };
        vm.badge = formatDuration(Date.now() - session.alarm.since);
        delete vm.oneShot;
      }
      return vm;
    };

    const renderAll = (): void => {
      const activeSessions = sessions.list().sort((a, b) => a.firstSeen - b.firstSeen);
      const owned = pets.reconcile(activeSessions.map((s) => s.key));
      if (activeSessions.length === 0) {
        const stroll = walking.get('home');
        // No tag on the lone idle pet — the label would just cover the Dock.
        pets.render('home', {
          sheetUrl: pets.sheetUrl(),
          spriteState: stroll ? (stroll === 'left' ? 'running-left' : 'running-right') : 'idle',
          dnd: dndActive(),
        });
        syncPatrols(['home']);
        return;
      }
      // Identity labels only earn their space once more than one pet is out.
      const showTags = owned.length > 1;
      for (const s of activeSessions) {
        if (!owned.includes(s.key)) continue;
        const vm = buildVM(s);
        if (!showTags && !vm.bubble) delete vm.tag;
        pets.render(s.key, vm);
      }
      syncPatrols(['home', ...owned]);
      if (dumpPetsArg) {
        setTimeout(() => fs.writeFileSync(dumpPetsArg.slice('--dump-pets='.length), JSON.stringify(pets.inventory(), null, 2)), 60);
      }
      if (capturePetsDir) {
        setTimeout(() => {
          for (const s of activeSessions) {
            const win = pets.windowFor(s.key);
            if (win) void win.capture().then((png) => fs.writeFileSync(path.join(capturePetsDir, `${s.name}.png`), png));
          }
        }, 500);
      }
      if (alarmCaptureArg && !alarmCaptured && activeSessions.some((s) => s.alarm)) {
        alarmCaptured = true;
        const alarmed = activeSessions.find((s) => s.alarm)!;
        setTimeout(() => {
          const win = pets.windowFor(alarmed.key);
          if (win) void win.capture().then((png) => fs.writeFileSync(alarmCaptureArg.slice('--capture-on-alarm='.length), png));
        }, 450);
      }
    };
    let alarmCaptured = false;

    const pets = new PetManager({
      sheetUrl: active.sheetUrl,
      store,
      maxPets: MAX_PETS,
      onAction: (key: PetKey, action: PetAction) => handlePetAction(key, action),
    });

    // ---- idle wandering along the Dock ----
    const patrols = new Map<PetKey, Patrol>();

    /** A pet only strolls when it has nothing to show you. */
    const canWalk = (key: PetKey): boolean => {
      const win = pets.windowFor(key);
      if (!win || !win.isVisible()) return false;
      if (key === 'home') return sessions.list().length === 0;
      const s = sessions.get(key);
      if (!s) return false;
      return !s.alarm && !s.waitingSince && !s.bubbleText && !broker.has(key) && s.status === 'idle';
    };

    const syncPatrols = (keys: PetKey[]): void => {
      for (const key of keys) {
        if (patrols.has(key)) continue;
        const p = new Patrol(
          {
            canWalk: () => canWalk(key),
            getX: () => pets.windowFor(key)?.getX() ?? 0,
            setX: (x) => pets.windowFor(key)?.setX(x),
            bounds: () => pets.windowFor(key)?.walkBounds() ?? { minX: 0, maxX: 0 },
            onWalk: (dir) => {
              if (dir) walking.set(key, dir);
              else walking.delete(key);
              renderAll();
            },
          },
          {
            // Env overrides let the wander cadence be tuned (and tested) live.
            ...(process.env['DESKTOP_PETS_PATROL_MIN_MS']
              ? { minPauseMs: Number(process.env['DESKTOP_PETS_PATROL_MIN_MS']) }
              : {}),
            ...(process.env['DESKTOP_PETS_PATROL_MAX_MS']
              ? { maxPauseMs: Number(process.env['DESKTOP_PETS_PATROL_MAX_MS']) }
              : {}),
          },
        );
        p.start();
        patrols.set(key, p);
      }
      for (const [key, p] of [...patrols]) {
        if (!keys.includes(key)) {
          p.stop();
          patrols.delete(key);
          walking.delete(key);
        }
      }
    };

    const handlePetAction = (key: PetKey, action: PetAction): void => {
      const session = key === 'home' ? sessions.displaySession() : sessions.get(key);
      const win = pets.windowFor(key);
      switch (action.type) {
        case 'click':
          // Clicking the pet opens the "while you were away" digest.
          openDigest(win ? win.center() : { x: 0, y: 0 });
          break;
        case 'dismiss-alarm':
          if (session?.alarm) sessions.dismissAlarm(session.key);
          break;
        case 'button':
          if (!session) break;
          if (action.id === 'approve') broker.resolve(session.key, 'allow', 'Approved from desktop pet');
          else if (action.id === 'deny') broker.resolve(session.key, 'deny', 'Denied from desktop pet');
          else if (action.id === 'focus') {
            focusApp(agentBundleId(session));
            broker.resolve(session.key, 'none', 'focused terminal');
          }
          break;
        case 'context-menu':
          Menu.buildFromTemplate([
            { label: 'While you were away…', click: () => openDigest(win ? win.center() : { x: 0, y: 0 }) },
            { label: 'Do Not Disturb', type: 'checkbox', checked: manualDnd, click: () => toggleDnd() },
            { label: 'Wave', click: () => pets.playOneShot(key, 'waving') },
            { type: 'separator' },
            { label: 'Quit Desktop Pets', click: () => app.quit() },
          ]).popup();
          break;
      }
    };

    const onDecisionRequest = (req: DecisionRequest): void => {
      if (req.event !== 'PermissionRequest') {
        // PreToolUse: we only classify/alarm here, never gate (D7).
        req.respond('none');
        return;
      }
      // If the agent's own terminal is frontmost, the native prompt is right
      // there — release immediately (D1). Otherwise hold for the pet.
      if (isAgentFocused(req.session)) req.respond('none', 'agent app focused');
      else broker.hold(req);
      renderAll();
      if (autoDecideArg && broker.has(req.session.key)) {
        const id = autoDecideArg.slice('--auto-decide='.length);
        setTimeout(() => handlePetAction(req.session.key, { type: 'button', id }), 800);
      }
    };

    const onSurface = (moment: SurfaceMoment): void => {
      history.add({ kind: moment.kind, project: moment.session.name, detail: moment.body, sessionKey: moment.session.key });
      const tier = tierFor(moment.session);
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
      }
      if (notified) capturedNotifications.push({ title: moment.title, body: moment.body });
      if (stateCaptureArg) {
        setTimeout(() => {
          const key = moment.session.key;
          const win = pets.windowFor(key) ?? pets.homeWindow();
          fs.writeFileSync(
            stateCaptureArg.slice('--capture-state='.length),
            JSON.stringify({ tier, notified, vm: win.getVM(), notifications: capturedNotifications, moment: { kind: moment.kind } }, null, 2),
          );
        }, 80);
      }
    };

    const riskConfig = new RiskConfigStore();
    const sessions = new SessionManager({
      sanitize: (t) => sanitizeSpeech(t),
      onChange: renderAll,
      classify: (call) => classifyToolCall(call, riskConfig.get()),
      onDecisionRequest,
      onSurface,
    });

    const toggleDnd = (): void => {
      manualDnd = !manualDnd;
      store.update({ dndManual: manualDnd });
      renderAll();
      refreshTray();
    };

    const petChoices = () => discoverPets().pets.map((p) => ({ pet: p.pet, bundled: p.bundled }));

    if (dumpMenuArg) {
      fs.writeFileSync(
        dumpMenuArg.slice('--dump-pet-menu='.length),
        JSON.stringify(petMenuEntries(petChoices(), active.pet.id), null, 2),
      );
    }

    /** Swap the character live — no restart, and the choice sticks. */
    const switchPet = (id: string): void => {
      if (id === active.pet.id) return;
      const next = discoverPets().pets.find((p) => p.pet.id === id);
      if (!next) {
        console.warn(`[pets] cannot switch to "${id}": not installed or failed validation`);
        refreshTray();
        return;
      }
      active = next;
      pets.setSheetUrl(next.sheetUrl);
      store.update({ activePetId: id });
      console.log(`[pets] active: ${next.pet.displayName} (${id}) · ${next.pet.license} by ${next.pet.author}`);
      renderAll();
      refreshTray();
    };

    // Focus changes: re-render, and auto-release any hold whose terminal is now front.
    focus.start(() => {
      for (const key of broker.keys()) {
        const s = sessions.get(key);
        if (s && isAgentFocused(s)) broker.resolve(key, 'none', 'focused terminal');
      }
      renderAll();
    });
    config.watch((next) => {
      dnd.setAutoApps(next.dnd.autoApps);
      reactionMap = resolveReactionMap(next.reactionMap).map;
      renderAll();
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

    const lastRenotify = new Map<string, number>();
    setInterval(() => {
      sessions.sweepStale(30 * 60_000);
      const now = Date.now();
      // Duration escalation: re-notify a still-blocked session while the user
      // is away, at most once per RENOTIFY_MS, with the growing wait time.
      for (const s of sessions.list()) {
        if (!s.waitingSince) {
          lastRenotify.delete(s.key);
          continue;
        }
        const tier = tierFor(s);
        if (!tierFiresNotification(tier)) continue;
        const waited = now - s.waitingSince;
        if (waited < RENOTIFY_MS) continue;
        const last = lastRenotify.get(s.key) ?? s.waitingSince;
        if (now - last >= RENOTIFY_MS) {
          lastRenotify.set(s.key, now);
          notifier.fire(`${s.name} still blocked`, `Waiting ${formatDuration(waited)} for permission`);
        }
      }
      if (sessions.list().some((s) => s.waitingSince || s.alarm) || broker.keys().length > 0) renderAll();
    }, 5_000);

    app.on('will-quit', () => {
      broker.releaseAll('host quitting');
      for (const p of patrols.values()) p.stop();
      digestWindow.close();
      focus.stop();
      ipc.stop();
    });

    let refreshTray = (): void => {};
    if (smokeMode) {
      await runSmoke(pets.homeWindow(), smokeOut);
    } else {
      renderAll();
      const tray = createTray({
        isDnd: () => manualDnd,
        onToggleDnd: toggleDnd,
        listPets: () => discoverPets().pets.map((p) => ({ pet: p.pet, bundled: p.bundled })),
        activePetId: () => active.pet.id,
        onPickPet: switchPet,
        onQuit: () => pets.destroyAll(),
      });
      refreshTray = () => tray.refresh();

      // Drop a new pet folder in and it shows up in the picker straight away.
      try {
        fs.mkdirSync(userPetsDir(), { recursive: true });
        let debounce: NodeJS.Timeout | undefined;
        fs.watch(userPetsDir(), () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => refreshTray(), 400);
        });
      } catch {
        // watching is a convenience; the picker still works without it
      }
      if (autoDigestArg) {
        setTimeout(() => {
          openDigest({ x: 500, y: 500 });
          setTimeout(() => void digestWindow.capture().then((png) => png && fs.writeFileSync(autoDigestArg.slice('--auto-digest='.length), png)), 500);
        }, 7000);
      }
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
