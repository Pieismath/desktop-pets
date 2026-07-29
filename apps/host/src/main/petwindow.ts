import path from 'node:path';
import { BrowserWindow, app, ipcMain, screen } from 'electron';
import { PET_WINDOW, SPRITE_STATES } from '@desktop-pets/shared';
import type { PetAction, PetViewModel, SpriteStateName } from '@desktop-pets/shared';
import type { SavedPosition, StateStore } from './store.js';

export interface PetWindowOptions {
  slot: string;
  slotIndex: number;
  sheetUrl: string;
  tag?: string;
  store: StateStore;
  onAction: (win: PetWindow, action: PetAction) => void;
}

const registry = new Map<number, PetWindow>();
let ipcInstalled = false;

function installIpc(): void {
  if (ipcInstalled) return;
  ipcInstalled = true;
  ipcMain.handle('pet:init', (event) => registry.get(event.sender.id)?.handleInit());
  ipcMain.on('pet:action', (event, action: PetAction) => {
    const win = registry.get(event.sender.id);
    if (win) win.opts.onAction(win, action);
  });
  ipcMain.on('pet:drag-start', (event) => registry.get(event.sender.id)?.beginDrag());
  ipcMain.on('pet:drag-end', (event, moved: boolean) => registry.get(event.sender.id)?.endDrag(moved));
}

/**
 * One transparent always-on-top pet. Click-through is driven from the main
 * process: a cursor poll checks whether the pointer is over the sprite (or an
 * active bubble) and toggles setIgnoreMouseEvents — no renderer cooperation
 * needed, no extra macOS permissions.
 */
export class PetWindow {
  readonly win: BrowserWindow;
  readonly consoleErrors: string[] = [];
  private vm: PetViewModel;
  private oneShotNonce = 0;
  private dragging = false;
  private dragOffset = { x: 0, y: 0 };
  private dragTimer: NodeJS.Timeout | undefined;
  private hoverTimer: NodeJS.Timeout | undefined;
  private lastIgnore: boolean | undefined;
  private readyResolve!: () => void;
  readonly whenReady: Promise<void>;

  constructor(readonly opts: PetWindowOptions) {
    installIpc();
    this.whenReady = new Promise((r) => (this.readyResolve = r));
    this.vm = { sheetUrl: opts.sheetUrl, spriteState: 'idle', ...(opts.tag !== undefined ? { tag: opts.tag } : {}) };

    this.win = new BrowserWindow({
      width: PET_WINDOW.width,
      height: PET_WINDOW.height,
      transparent: true,
      frame: false,
      resizable: false,
      hasShadow: false,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      roundedCorners: false,
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), 'dist', 'preload', 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    registry.set(this.win.webContents.id, this);

    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    this.win.setPosition(...this.initialPosition());

    this.win.webContents.on('console-message', (event) => {
      if (event.level === 'error') {
        this.consoleErrors.push(event.message);
        console.error(`[renderer:${this.opts.slot}]`, event.message);
      }
    });

    this.win.once('ready-to-show', () => this.win.showInactive());
    this.win.on('closed', () => {
      registry.delete(this.win.webContents.id);
      this.stopTimers();
    });

    void this.win.loadFile(path.join(app.getAppPath(), 'renderer', 'index.html'));
    this.hoverTimer = setInterval(() => this.applyMouseIgnore(), 180);
  }

  private initialPosition(): [number, number] {
    const saved = this.opts.store.get().positions[this.opts.slot];
    const display = saved
      ? (screen.getAllDisplays().find((d) => d.id === saved.displayId) ?? screen.getPrimaryDisplay())
      : screen.getPrimaryDisplay();
    const wa = display.workArea;
    if (saved && screen.getAllDisplays().some((d) => d.id === saved.displayId)) {
      const x = Math.min(Math.max(display.bounds.x + saved.dx, wa.x - 40), wa.x + wa.width - 80);
      const y = Math.min(Math.max(display.bounds.y + saved.dy, wa.y), wa.y + wa.height - 120);
      return [Math.round(x), Math.round(y)];
    }
    const x = wa.x + wa.width - PET_WINDOW.width - 24 - this.opts.slotIndex * (PET_WINDOW.width - 30);
    const y = wa.y + wa.height - PET_WINDOW.height + 4;
    return [Math.round(x), Math.round(y)];
  }

  handleInit(): { states: typeof SPRITE_STATES; layout: typeof PET_WINDOW; vm: PetViewModel } {
    queueMicrotask(() => this.readyResolve());
    return { states: SPRITE_STATES, layout: PET_WINDOW, vm: this.vm };
  }

  getVM(): PetViewModel {
    return this.vm;
  }

  setVM(next: PetViewModel): void {
    this.vm = next;
    this.push();
  }

  patchVM(patch: Partial<PetViewModel>): void {
    this.setVM({ ...this.vm, ...patch });
  }

  playOneShot(state: SpriteStateName): void {
    this.oneShotNonce += 1;
    this.patchVM({ oneShot: { state, nonce: this.oneShotNonce } });
  }

  private push(): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('pet:update', this.vm);
      this.applyMouseIgnore();
    }
  }

  private winPos(): { x: number; y: number } {
    const pos = this.win.getPosition();
    return { x: pos[0] ?? 0, y: pos[1] ?? 0 };
  }

  /** Window regions that should catch the mouse, in window coordinates. */
  private hotRects(): Array<{ x: number; y: number; w: number; h: number }> {
    const rects = [PET_WINDOW.sprite, { x: 20, y: PET_WINDOW.tag.y - 4, w: PET_WINDOW.width - 40, h: PET_WINDOW.tag.h + 8 }];
    if (this.vm.bubble) rects.push(PET_WINDOW.bubble);
    return rects;
  }

  private applyMouseIgnore(): void {
    if (this.win.isDestroyed()) return;
    let interactive = this.dragging || !!this.vm.alarm || !!(this.vm.bubble && this.vm.bubble.buttons?.length);
    if (!interactive) {
      const cursor = screen.getCursorScreenPoint();
      const { x: wx, y: wy } = this.winPos();
      const lx = cursor.x - wx;
      const ly = cursor.y - wy;
      interactive = this.hotRects().some((r) => lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h);
    }
    const ignore = !interactive;
    if (ignore !== this.lastIgnore) {
      this.lastIgnore = ignore;
      this.win.setIgnoreMouseEvents(ignore, { forward: true });
    }
  }

  beginDrag(): void {
    if (this.dragging) return;
    this.dragging = true;
    const cursor = screen.getCursorScreenPoint();
    const { x: wx, y: wy } = this.winPos();
    this.dragOffset = { x: cursor.x - wx, y: cursor.y - wy };
    this.dragTimer = setInterval(() => {
      const c = screen.getCursorScreenPoint();
      this.win.setPosition(Math.round(c.x - this.dragOffset.x), Math.round(c.y - this.dragOffset.y), false);
    }, 12);
  }

  endDrag(moved: boolean): void {
    this.dragging = false;
    if (this.dragTimer) clearInterval(this.dragTimer);
    this.dragTimer = undefined;
    if (moved) this.savePosition();
  }

  private savePosition(): void {
    const { x, y } = this.winPos();
    const display = screen.getDisplayNearestPoint({ x: x + PET_WINDOW.width / 2, y: y + PET_WINDOW.height / 2 });
    const pos: SavedPosition = { displayId: display.id, dx: x - display.bounds.x, dy: y - display.bounds.y };
    this.opts.store.setPosition(this.opts.slot, pos);
  }

  isVisible(): boolean {
    return !this.win.isDestroyed() && this.win.isVisible();
  }

  /** Centre point of the window in screen coordinates (for panel placement). */
  center(): { x: number; y: number } {
    const { x, y } = this.winPos();
    return { x: x + PET_WINDOW.width / 2, y: y + PET_WINDOW.height / 2 };
  }

  show(): void {
    if (!this.win.isDestroyed() && !this.win.isVisible()) this.win.showInactive();
  }

  hide(): void {
    if (!this.win.isDestroyed() && this.win.isVisible()) this.win.hide();
  }

  async capture(): Promise<Buffer> {
    const img = await this.win.webContents.capturePage();
    return img.toPNG();
  }

  private stopTimers(): void {
    if (this.hoverTimer) clearInterval(this.hoverTimer);
    if (this.dragTimer) clearInterval(this.dragTimer);
  }

  destroy(): void {
    this.stopTimers();
    if (!this.win.isDestroyed()) this.win.destroy();
  }
}
