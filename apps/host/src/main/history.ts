import fs from 'node:fs';
import { dataDir, historyPath } from '@desktop-pets/shared';

export type HistoryKind = 'success' | 'blocked' | 'error' | 'risky' | 'resolved';

export interface HistoryEntry {
  at: number;
  kind: HistoryKind;
  project: string;
  detail: string;
  sessionKey: string;
}

export interface HistoryStoreOptions {
  maxEntries?: number;
  maxAgeMs?: number;
  ephemeral?: boolean;
  now?: () => number;
}

/**
 * Bounded, local-only event log (JSONL) behind the "while you were away"
 * digest. Never leaves the machine. Bounded by count and age so it can't grow
 * without limit.
 */
export class HistoryStore {
  private entries: HistoryEntry[] = [];
  private readonly file: string;
  private readonly maxEntries: number;
  private readonly maxAgeMs: number;
  private readonly ephemeral: boolean;
  private readonly now: () => number;

  constructor(opts: HistoryStoreOptions = {}) {
    this.file = historyPath();
    this.maxEntries = opts.maxEntries ?? 300;
    this.maxAgeMs = opts.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
    this.ephemeral = opts.ephemeral ?? false;
    this.now = opts.now ?? Date.now;
    if (!this.ephemeral) this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      this.entries = raw
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as HistoryEntry)
        .filter((e) => typeof e.at === 'number' && typeof e.kind === 'string');
      this.prune();
    } catch {
      this.entries = [];
    }
  }

  private prune(): void {
    const cutoff = this.now() - this.maxAgeMs;
    this.entries = this.entries.filter((e) => e.at >= cutoff);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }
  }

  add(entry: Omit<HistoryEntry, 'at'> & { at?: number }): void {
    const full: HistoryEntry = { at: entry.at ?? this.now(), kind: entry.kind, project: entry.project, detail: entry.detail, sessionKey: entry.sessionKey };
    this.entries.push(full);
    this.prune();
    if (!this.ephemeral) {
      try {
        fs.mkdirSync(dataDir(), { recursive: true });
        // Rewrite the pruned window so the file stays bounded too.
        fs.writeFileSync(this.file, this.entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
      } catch (err) {
        console.error('[history] write failed:', err);
      }
    }
  }

  all(): readonly HistoryEntry[] {
    return this.entries;
  }

  since(ms: number): HistoryEntry[] {
    const cutoff = this.now() - ms;
    return this.entries.filter((e) => e.at >= cutoff);
  }
}
