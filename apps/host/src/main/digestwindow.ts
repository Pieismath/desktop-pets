import { BrowserWindow, screen } from 'electron';

/**
 * A small panel showing the "while you were away" digest. Content is
 * host-composed self-contained HTML loaded via a data: URL — no preload, no
 * IPC, no external loads. Closes on blur or Escape; reopened fresh each time
 * so it always reflects current state.
 */
export class DigestWindow {
  private win: BrowserWindow | undefined;

  isOpen(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible();
  }

  toggle(html: string, near: { x: number; y: number }): void {
    if (this.isOpen()) {
      this.close();
      return;
    }
    this.open(html, near);
  }

  open(html: string, near: { x: number; y: number }): void {
    this.close();
    const width = 300;
    const height = 340;
    const display = screen.getDisplayNearestPoint(near);
    const wa = display.workArea;
    const x = Math.min(Math.max(near.x - width / 2, wa.x + 8), wa.x + wa.width - width - 8);
    const y = Math.min(Math.max(near.y - height - 8, wa.y + 8), wa.y + wa.height - height - 8);

    this.win = new BrowserWindow({
      width,
      height,
      x: Math.round(x),
      y: Math.round(y),
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, javascript: false },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    void this.win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    this.win.once('ready-to-show', () => this.win?.show());
    this.win.on('blur', () => this.close());
    this.win.webContents.on('before-input-event', (_e, input) => {
      if (input.key === 'Escape') this.close();
    });
  }

  async capture(): Promise<Buffer | undefined> {
    if (!this.win || this.win.isDestroyed()) return undefined;
    const img = await this.win.webContents.capturePage();
    return img.toPNG();
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = undefined;
  }
}
