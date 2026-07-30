import { Menu, Tray, app, nativeImage, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { userPetsDir } from '@desktop-pets/shared';
import { petMenuEntries, type PetChoice } from './petmenu.js';

export interface TrayDeps {
  isDnd: () => boolean;
  onToggleDnd: () => void;
  /** Every installed pet, so the picker can be rebuilt on demand. */
  listPets: () => PetChoice[];
  activePetId: () => string | undefined;
  onPickPet: (id: string) => void;
  onQuit: () => void;
}

export interface PetTray {
  tray: Tray;
  refresh: () => void;
}

/** Menu-bar presence: character picker, Do Not Disturb, and Quit. */
export function createTray(deps: TrayDeps): PetTray {
  const tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Desktop Pets');

  const build = (): void => {
    tray.setTitle(deps.isDnd() ? '🐾🌙' : '🐾');

    const entries = petMenuEntries(deps.listPets(), deps.activePetId());
    const petItems: MenuItemConstructorOptions[] = entries.map((e) => ({
      label: e.label,
      toolTip: e.tooltip,
      type: 'radio',
      checked: e.checked,
      click: () => deps.onPickPet(e.id),
    }));
    if (petItems.length === 0) {
      petItems.push({ label: 'No pets installed', enabled: false });
    }
    petItems.push(
      { type: 'separator' },
      {
        label: 'Open pets folder…',
        click: () => {
          void shell.openPath(userPetsDir());
        },
      },
    );

    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Desktop Pets', enabled: false },
        { type: 'separator' },
        { label: 'Character', submenu: petItems },
        {
          label: 'Do Not Disturb',
          type: 'checkbox',
          checked: deps.isDnd(),
          click: () => deps.onToggleDnd(),
        },
        { type: 'separator' },
        {
          label: 'Quit Desktop Pets',
          click: () => {
            deps.onQuit();
            app.quit();
          },
        },
      ]),
    );
  };

  build();
  return { tray, refresh: build };
}
