import fs from 'node:fs';
import path from 'node:path';
import { dataDir, stateFilePath } from '@desktop-pets/shared';

export interface SavedPosition {
  displayId: number;
  /** Offset relative to that display's bounds origin. */
  dx: number;
  dy: number;
}

export interface HostState {
  activePetId?: string;
  /** Keyed by pet slot (e.g. "home", session slots later). */
  positions: Record<string, SavedPosition>;
  dndManual?: boolean;
}

const DEFAULT_STATE: HostState = { positions: {} };

/** Small persisted-state store with atomic writes. `ephemeral` (smoke mode) never touches disk. */
export class StateStore {
  private state: HostState;
  private readonly file: string;

  constructor(private readonly ephemeral = false) {
    this.file = stateFilePath();
    this.state = this.read();
  }

  private read(): HostState {
    if (this.ephemeral) return { ...DEFAULT_STATE, positions: {} };
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw) as Partial<HostState>;
      return {
        activePetId: typeof parsed.activePetId === 'string' ? parsed.activePetId : undefined,
        positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
        dndManual: parsed.dndManual === true,
      };
    } catch {
      return { ...DEFAULT_STATE, positions: {} };
    }
  }

  get(): HostState {
    return this.state;
  }

  update(patch: Partial<HostState>): void {
    this.state = { ...this.state, ...patch, positions: { ...this.state.positions, ...(patch.positions ?? {}) } };
    this.flush();
  }

  setPosition(slot: string, pos: SavedPosition): void {
    this.state.positions[slot] = pos;
    this.flush();
  }

  private flush(): void {
    if (this.ephemeral) return;
    try {
      fs.mkdirSync(dataDir(), { recursive: true });
      const tmp = path.join(dataDir(), `.state.${process.pid}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] failed to persist state:', err);
    }
  }
}
