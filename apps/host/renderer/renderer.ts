import type { PetAction, PetViewModel, SpriteStateSpec } from '@desktop-pets/shared';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  width: number;
  height: number;
  sprite: Rect;
  bubble: Rect;
  tag: { y: number; h: number };
}

interface InitPayload {
  states: readonly SpriteStateSpec[];
  layout: Layout;
  vm: PetViewModel;
}

interface PetApi {
  init(): Promise<InitPayload>;
  onUpdate(cb: (vm: PetViewModel) => void): void;
  action(action: PetAction): void;
  dragStart(): void;
  dragEnd(moved: boolean): void;
}

declare global {
  interface Window {
    petApi: PetApi;
  }
}

const api = window.petApi;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const sprite = $('sprite');
const spriteWrap = $('sprite-wrap');
const bubble = $('bubble');
const bubbleText = $('bubble-text');
const bubbleButtons = $('bubble-buttons');
const bubbleCountdown = $('bubble-countdown');
const badge = $('badge');
const dnd = $('dnd');
const tag = $('tag');

const FRAME_W = 192;
const FRAME_H = 208;

let states: ReadonlyMap<string, SpriteStateSpec> = new Map();
let currentVM: PetViewModel | undefined;
let lastOneShotNonce = -1;
let animEndHandler: (() => void) | undefined;

function injectKeyframes(specs: readonly SpriteStateSpec[]): void {
  const counts = [...new Set(specs.map((s) => s.frames))];
  const sheet = new CSSStyleSheet();
  for (const n of counts) {
    sheet.insertRule(
      `@keyframes cycle-${n} { from { background-position-x: 0px; } to { background-position-x: -${n * FRAME_W}px; } }`,
    );
  }
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

function applyLayout(layout: Layout): void {
  const root = document.documentElement.style;
  root.setProperty('--sprite-x', `${layout.sprite.x}px`);
  root.setProperty('--sprite-y', `${layout.sprite.y}px`);
  root.setProperty('--bubble-x', `${layout.bubble.x}px`);
  root.setProperty('--bubble-y', `${layout.bubble.y}px`);
  root.setProperty('--bubble-w', `${layout.bubble.w}px`);
  root.setProperty('--tag-y', `${layout.tag.y}px`);
}

/**
 * Play a sprite row. Finite loop counts come from the sheet spec and apply to
 * one-shot playback; persistent states loop until replaced (a pet frozen on
 * the last frame of `working` would read as dead).
 */
function playRow(spec: SpriteStateSpec, iterations: number | 'infinite', onDone?: () => void): void {
  if (animEndHandler) {
    sprite.removeEventListener('animationend', animEndHandler);
    animEndHandler = undefined;
  }
  sprite.style.backgroundPositionY = `-${spec.row * FRAME_H}px`;
  sprite.style.animation = 'none';
  // Force a reflow so re-applying an identical animation restarts it.
  void sprite.offsetWidth;
  const count = iterations === 'infinite' ? 'infinite' : String(iterations);
  sprite.style.animation = `cycle-${spec.frames} ${spec.durationMs}ms steps(${spec.frames}) ${count}`;
  if (iterations !== 'infinite') {
    animEndHandler = () => {
      animEndHandler = undefined;
      if (spec.after === 'hold') {
        sprite.style.animation = 'none';
        sprite.style.backgroundPositionX = `-${(spec.frames - 1) * FRAME_W}px`;
      } else {
        sprite.style.backgroundPositionX = '0px';
      }
      onDone?.();
    };
    sprite.addEventListener('animationend', animEndHandler, { once: true });
  }
}

function specFor(name: string): SpriteStateSpec {
  const spec = states.get(name);
  if (spec) return spec;
  const idle = states.get('idle');
  if (!idle) throw new Error('sprite spec missing idle state');
  return idle;
}

function applyPersistent(name: string): void {
  playRow(specFor(name), 'infinite');
}

function applyVM(vm: PetViewModel): void {
  const prev = currentVM;
  currentVM = vm;

  if (!prev || prev.sheetUrl !== vm.sheetUrl) {
    sprite.style.backgroundImage = `url("${vm.sheetUrl}")`;
  }

  const oneShot = vm.oneShot;
  if (oneShot && oneShot.nonce !== lastOneShotNonce) {
    lastOneShotNonce = oneShot.nonce;
    const spec = specFor(oneShot.state);
    const iterations = typeof spec.loop === 'number' ? spec.loop : 'infinite';
    playRow(spec, iterations, () => {
      if (currentVM) applyPersistent(currentVM.spriteState);
    });
  } else if (!prev || prev.spriteState !== vm.spriteState || prev.sheetUrl !== vm.sheetUrl) {
    applyPersistent(vm.spriteState);
  }

  if (vm.bubble) {
    bubble.hidden = false;
    bubbleText.textContent = vm.bubble.text;
    bubbleButtons.replaceChildren(
      ...(vm.bubble.buttons ?? []).map((b) => {
        const el = document.createElement('button');
        el.textContent = b.label;
        el.className = b.kind;
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          api.action({ type: 'button', id: b.id });
        });
        return el;
      }),
    );
    if (vm.bubble.countdownMs !== undefined) {
      bubbleCountdown.hidden = false;
      bubbleCountdown.textContent = `answers in terminal after ${Math.ceil(vm.bubble.countdownMs / 1000)}s`;
    } else {
      bubbleCountdown.hidden = true;
    }
  } else {
    bubble.hidden = true;
  }

  badge.hidden = !vm.badge;
  if (vm.badge) badge.textContent = vm.badge;
  tag.hidden = !vm.tag;
  if (vm.tag) tag.textContent = vm.tag;
  dnd.hidden = !vm.dnd;
  document.body.classList.toggle('alarm', !!vm.alarm);
  document.body.classList.toggle('urgent-1', vm.urgency === 1);
  document.body.classList.toggle('urgent-2', vm.urgency === 2);
}

// ---- drag vs click (screen coords: the window moves under the cursor) ----

let downAt: { x: number; y: number } | undefined;
let dragging = false;

spriteWrap.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  downAt = { x: e.screenX, y: e.screenY };
  dragging = false;
});

window.addEventListener('pointermove', (e) => {
  if (!downAt || dragging) return;
  const dist = Math.hypot(e.screenX - downAt.x, e.screenY - downAt.y);
  if (dist > 4) {
    dragging = true;
    api.dragStart();
  }
});

window.addEventListener('pointerup', () => {
  if (!downAt) return;
  if (dragging) {
    api.dragEnd(true);
  } else if (currentVM?.alarm) {
    api.action({ type: 'dismiss-alarm' });
  } else {
    api.action({ type: 'click' });
  }
  downAt = undefined;
  dragging = false;
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  api.action({ type: 'context-menu' });
});

async function boot(): Promise<void> {
  api.onUpdate(applyVM);
  const init = await api.init();
  states = new Map(init.states.map((s) => [s.name, s]));
  injectKeyframes(init.states);
  applyLayout(init.layout);
  applyVM(init.vm);
}

void boot();
