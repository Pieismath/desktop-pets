import type { PetAction, PetViewModel } from '@desktop-pets/shared';
import { PetWindow, type PetWindowOptions } from './petwindow.js';
import type { StateStore } from './store.js';

export type PetKey = string; // session key, or 'home'

/** The slice of PetWindow the manager needs — lets tests inject a fake. */
export interface ManagedWindow {
  setVM(vm: PetViewModel): void;
  getVM(): PetViewModel;
  playOneShot(...args: Parameters<PetWindow['playOneShot']>): void;
  show(): void;
  hide(): void;
  isVisible(): boolean;
  center(): { x: number; y: number };
  getX(): number;
  setX(x: number): void;
  walkBounds(): { minX: number; maxX: number };
  parkOnDock(): void;
  capture(): Promise<Buffer>;
  readonly whenReady: Promise<void>;
  readonly consoleErrors: string[];
  destroy(): void;
}

export interface PetManagerOptions {
  sheetUrl: string;
  store: StateStore;
  /** Max concurrent session pets (excludes the home pet). */
  maxPets: number;
  onAction: (key: PetKey, action: PetAction) => void;
  /** Window factory; defaults to a real Electron PetWindow. */
  createWindow?: (opts: PetWindowOptions) => ManagedWindow;
}

interface Slot {
  win: ManagedWindow;
  index: number;
}

/**
 * Owns the pet windows: a persistent "home" pet shown only when no agent is
 * active, plus one pet per concurrent session (each with visible identity and
 * its own remembered position), capped at maxPets.
 */
export class PetManager {
  private readonly home: ManagedWindow;
  private readonly make: (opts: PetWindowOptions) => ManagedWindow;
  private readonly bySession = new Map<PetKey, Slot>();
  private readonly usedIndexes = new Set<number>();

  constructor(private readonly opts: PetManagerOptions) {
    this.make = opts.createWindow ?? ((o) => new PetWindow(o));
    this.home = this.make({
      slot: 'home',
      slotIndex: 0,
      sheetUrl: opts.sheetUrl,
      store: opts.store,
      onAction: (_w, action) => opts.onAction('home', action),
    });
  }

  homeWindow(): ManagedWindow {
    return this.home;
  }

  windowFor(key: PetKey): ManagedWindow | undefined {
    if (key === 'home') return this.home;
    return this.bySession.get(key)?.win;
  }

  private claimIndex(): number {
    for (let i = 1; i <= this.opts.maxPets; i++) {
      if (!this.usedIndexes.has(i)) {
        this.usedIndexes.add(i);
        return i;
      }
    }
    return this.opts.maxPets; // over cap: pile onto the last slot
  }

  /**
   * Reconcile live pets against the active session keys (stable order).
   * Returns the keys that actually own a pet (capped) so the caller only
   * renders those.
   */
  reconcile(activeKeys: PetKey[]): PetKey[] {
    // Destroy pets whose session is gone.
    for (const [key, slot] of [...this.bySession]) {
      if (!activeKeys.includes(key)) {
        slot.win.destroy();
        this.usedIndexes.delete(slot.index);
        this.bySession.delete(key);
      }
    }

    const owned: PetKey[] = [];
    for (const key of activeKeys) {
      if (this.bySession.has(key)) {
        owned.push(key);
        continue;
      }
      if (this.bySession.size >= this.opts.maxPets) {
        continue; // over cap — surfaced via the home/most-recent pet
      }
      const index = this.claimIndex();
      const win = this.make({
        slot: `pet${index}`,
        slotIndex: index,
        sheetUrl: this.opts.sheetUrl,
        store: this.opts.store,
        onAction: (_w, action) => this.opts.onAction(key, action),
      });
      this.bySession.set(key, { win, index });
      owned.push(key);
    }

    // Home pet is only visible when there are no session pets.
    if (this.bySession.size === 0) this.home.show();
    else this.home.hide();

    return owned;
  }

  render(key: PetKey, vm: PetViewModel): void {
    this.windowFor(key)?.setVM(vm);
  }

  playOneShot(key: PetKey, ...args: Parameters<PetWindow['playOneShot']>): void {
    this.windowFor(key)?.playOneShot(...args);
  }

  /** Debug/inventory: which session pets exist and what identity each shows. */
  inventory(): Array<{ key: PetKey; slot: number; tag: string | undefined; visible: boolean }> {
    return [...this.bySession].map(([key, slot]) => ({
      key,
      slot: slot.index,
      tag: slot.win.getVM().tag,
      visible: slot.win.isVisible(),
    }));
  }

  destroyAll(): void {
    this.home.destroy();
    for (const slot of this.bySession.values()) slot.win.destroy();
    this.bySession.clear();
    this.usedIndexes.clear();
  }
}
