import { Menu, Tray, app, nativeImage } from 'electron';

export interface TrayDeps {
  onQuit: () => void;
}

/** Minimal menu-bar presence so a dock-less background app is always quittable. */
export function createTray(deps: TrayDeps): Tray {
  const tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('🐾');
  tray.setToolTip('Desktop Pets');
  const menu = Menu.buildFromTemplate([
    { label: 'Desktop Pets', enabled: false },
    { type: 'separator' },
    {
      label: 'Quit Desktop Pets',
      click: () => {
        deps.onQuit();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  return tray;
}
