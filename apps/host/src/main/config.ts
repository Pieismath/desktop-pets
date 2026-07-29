import fs from 'node:fs';
import path from 'node:path';
import { configFilePath, dataDir } from '@desktop-pets/shared';
import { DEFAULT_ESCALATION, type EscalationThresholds } from './escalation.js';
import { DEFAULT_CONFERENCING_APPS } from './providers.js';

export interface HostConfig {
  escalation: EscalationThresholds;
  dnd: { autoApps: string[] };
  /** Reaction → sprite-state overrides (validated against known names). */
  reactionMap: Record<string, string>;
}

export const DEFAULT_HOST_CONFIG: HostConfig = {
  escalation: { ...DEFAULT_ESCALATION },
  dnd: { autoApps: DEFAULT_CONFERENCING_APPS },
  reactionMap: {},
};

/**
 * The user-editable config file. Created with defaults on first run; a
 * malformed edit keeps defaults for the bad fields and logs why (never
 * crashes the pet).
 */
export class ConfigStore {
  private config: HostConfig;
  private readonly file: string;

  constructor(private readonly ephemeral = false) {
    this.file = configFilePath();
    if (!ephemeral) this.ensureFile();
    this.config = ephemeral ? { ...DEFAULT_HOST_CONFIG } : this.load();
  }

  private ensureFile(): void {
    if (fs.existsSync(this.file)) return;
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(DEFAULT_HOST_CONFIG, null, 2) + '\n');
  }

  private load(): HostConfig {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<HostConfig>;
      return mergeConfig(parsed);
    } catch (err) {
      console.warn(`[config] cannot read ${this.file} (${(err as Error).message}) — using defaults`);
      return { ...DEFAULT_HOST_CONFIG };
    }
  }

  watch(onReload: (config: HostConfig) => void): void {
    if (this.ephemeral) return;
    try {
      fs.watch(path.dirname(this.file), (_e, name) => {
        if (name === path.basename(this.file)) {
          this.config = this.load();
          onReload(this.config);
        }
      });
    } catch {
      /* best effort */
    }
  }

  get(): HostConfig {
    return this.config;
  }
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function mergeConfig(parsed: Partial<HostConfig>): HostConfig {
  const esc: Partial<EscalationThresholds> = parsed.escalation ?? {};
  const notifyIdleSec = num(esc.notifyIdleSec, DEFAULT_ESCALATION.notifyIdleSec);
  // digest threshold must not fall below the notify threshold
  const digestIdleSec = Math.max(notifyIdleSec, num(esc.digestIdleSec, DEFAULT_ESCALATION.digestIdleSec));
  const autoApps = Array.isArray(parsed.dnd?.autoApps)
    ? parsed.dnd.autoApps.filter((s): s is string => typeof s === 'string')
    : DEFAULT_CONFERENCING_APPS;
  const reactionMap =
    parsed.reactionMap && typeof parsed.reactionMap === 'object' && !Array.isArray(parsed.reactionMap)
      ? (parsed.reactionMap as Record<string, string>)
      : {};
  return { escalation: { notifyIdleSec, digestIdleSec }, dnd: { autoApps }, reactionMap };
}
