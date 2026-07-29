import { Menu, Tray, app, nativeImage } from 'electron';

export interface TrayDeps {
  isDnd: () => boolean;
  onToggleDnd: () => void;
  onQuit: () => void;
}

export interface PetTray {
  tray: Tray;
  refresh: () => void;
}

/** Menu-bar presence so a dock-less background app is always reachable. */
export function createTray(deps: TrayDeps): PetTray {
  const tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Desktop Pets');

  const build = (): void => {
    tray.setTitle(deps.isDnd() ? '🐾🌙' : '🐾');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Desktop Pets', enabled: false },
        { type: 'separator' },
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
