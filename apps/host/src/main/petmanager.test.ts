import { describe, expect, it } from 'vitest';
import type { PetViewModel } from '@desktop-pets/shared';
import { PetManager, type ManagedWindow } from './petmanager.js';
import type { PetWindowOptions } from './petwindow.js';
import type { StateStore } from './store.js';

class FakeWindow implements ManagedWindow {
  vm: PetViewModel;
  destroyed = false;
  visible = true;
  oneShots: string[] = [];
  readonly whenReady = Promise.resolve();
  readonly consoleErrors: string[] = [];
  constructor(public readonly opts: PetWindowOptions) {
    this.vm = { sheetUrl: opts.sheetUrl, spriteState: 'idle', ...(opts.tag !== undefined ? { tag: opts.tag } : {}) };
  }
  capture(): Promise<Buffer> {
    return Promise.resolve(Buffer.alloc(0));
  }
  setVM(vm: PetViewModel): void {
    this.vm = vm;
  }
  getVM(): PetViewModel {
    return this.vm;
  }
  playOneShot(state: Parameters<ManagedWindow['playOneShot']>[0]): void {
    this.oneShots.push(state);
  }
  show(): void {
    this.visible = true;
  }
  hide(): void {
    this.visible = false;
  }
  isVisible(): boolean {
    return this.visible;
  }
  center(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }
  x = 0;
  getX(): number {
    return this.x;
  }
  setX(x: number): void {
    this.x = x;
  }
  walkBounds(): { minX: number; maxX: number } {
    return { minX: 0, maxX: 400 };
  }
  parkOnDock(): void {}
  destroy(): void {
    this.destroyed = true;
  }
}

function makeManager() {
  const created: FakeWindow[] = [];
  const store = { get: () => ({ positions: {} }) } as unknown as StateStore;
  const mgr = new PetManager({
    sheetUrl: 'file:///sheet.webp',
    store,
    maxPets: 3,
    onAction: () => {},
    createWindow: (opts) => {
      const w = new FakeWindow(opts);
      created.push(w);
      return w;
    },
  });
  return { mgr, created };
}

describe('PetManager reconciliation', () => {
  it('shows the home pet only when there are no sessions', () => {
    const { mgr } = makeManager();
    expect(mgr.reconcile([])).toEqual([]);
    expect(mgr.homeWindow().isVisible()).toBe(true);

    mgr.reconcile(['a']);
    expect(mgr.homeWindow().isVisible()).toBe(false);

    mgr.reconcile([]);
    expect(mgr.homeWindow().isVisible()).toBe(true);
  });

  it('spawns one pet per session and destroys pets whose session ended', () => {
    const { mgr, created } = makeManager();
    mgr.reconcile(['a', 'b']);
    expect(mgr.inventory().map((p) => p.key).sort()).toEqual(['a', 'b']);

    mgr.reconcile(['b']); // 'a' ended
    expect(mgr.inventory().map((p) => p.key)).toEqual(['b']);
    // the 'a' window was destroyed, not leaked
    expect(created.filter((w) => w.opts.slot !== 'home' && w.destroyed)).toHaveLength(1);
  });

  it('reuses a freed slot index rather than growing unbounded', () => {
    const { mgr } = makeManager();
    mgr.reconcile(['a', 'b']);
    const slotB = mgr.inventory().find((p) => p.key === 'b')!.slot;
    mgr.reconcile(['b']); // free a's slot
    mgr.reconcile(['b', 'c']); // c should take a's freed index
    const slots = mgr.inventory().map((p) => p.slot).sort();
    expect(slots).toEqual([1, 2]);
    expect(mgr.inventory().find((p) => p.key === 'b')!.slot).toBe(slotB);
  });

  it('caps concurrent pets and reports only the owned keys', () => {
    const { mgr } = makeManager();
    const owned = mgr.reconcile(['a', 'b', 'c', 'd', 'e']);
    expect(owned).toHaveLength(3); // maxPets
    expect(mgr.inventory()).toHaveLength(3);
  });

  it('renders a VM to the addressed pet', () => {
    const { mgr } = makeManager();
    mgr.reconcile(['a']);
    mgr.render('a', { sheetUrl: 'file:///sheet.webp', spriteState: 'waiting', tag: 'alpha' });
    expect(mgr.windowFor('a')!.getVM()).toMatchObject({ spriteState: 'waiting', tag: 'alpha' });
  });
});
