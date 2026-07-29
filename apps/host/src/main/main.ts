import path from 'node:path';
import { Menu, app, dialog } from 'electron';
import type { PetAction } from '@desktop-pets/shared';
import { resolveActivePet } from './pets.js';
import { PetWindow } from './petwindow.js';
import { runSmoke } from './smoke.js';
import { StateStore } from './store.js';
import { createTray } from './tray.js';

const smokeMode = process.argv.includes('--smoke');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const smokeOut = outArg ? outArg.slice('--out='.length) : path.join(process.cwd(), 'captures');

if (!smokeMode && !app.requestSingleInstanceLock()) {
  app.quit();
}

function onPetAction(win: PetWindow, action: PetAction): void {
  switch (action.type) {
    case 'click':
      win.playOneShot('waving');
      break;
    case 'dismiss-alarm':
      win.setVM({ ...win.getVM(), alarm: false, bubble: undefined, spriteState: 'idle' });
      break;
    case 'button':
      // Wired to real decisions in stage 3+.
      console.log(`[pet] button pressed: ${action.id}`);
      break;
    case 'context-menu':
      Menu.buildFromTemplate([
        { label: 'Wave', click: () => win.playOneShot('waving') },
        { type: 'separator' },
        { label: 'Quit Desktop Pets', click: () => app.quit() },
      ]).popup({ window: win.win });
      break;
  }
}

app.whenReady().then(async () => {
  try {
    if (process.platform === 'darwin') app.dock?.hide();

    const store = new StateStore(smokeMode);
    const active = resolveActivePet(store.get().activePetId);
    console.log(`[pets] active: ${active.pet.displayName} (${active.pet.id}) — ${active.pet.license} by ${active.pet.author}`);

    const win = new PetWindow({
      slot: 'home',
      slotIndex: 0,
      sheetUrl: active.sheetUrl,
      tag: active.pet.displayName,
      store,
      onAction: onPetAction,
    });

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
