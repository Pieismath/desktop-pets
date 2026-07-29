import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_RISK_CONFIG,
  compileRiskConfig,
  dataDir,
  riskRulesPath,
} from '@desktop-pets/shared';
import type { CompiledRiskConfig } from '@desktop-pets/shared';

/**
 * The one auditable, user-editable rules file. Created with the full default
 * ruleset on first run so "audit the rules" means opening one JSON file.
 * Edits hot-reload; a broken file keeps the last good rules and logs why.
 */
export class RiskConfigStore {
  private compiled: CompiledRiskConfig;
  private readonly file: string;

  constructor() {
    this.file = riskRulesPath();
    this.ensureFile();
    this.compiled = this.load();
    try {
      fs.watch(path.dirname(this.file), (_event, name) => {
        if (name === path.basename(this.file)) {
          const next = this.load();
          this.compiled = next;
          console.log(`[risk] rules reloaded (${next.rules.length} active)`);
        }
      });
    } catch {
      // watching is best-effort; a restart also reloads
    }
  }

  private ensureFile(): void {
    if (fs.existsSync(this.file)) return;
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(DEFAULT_RISK_CONFIG, null, 2) + '\n');
    console.log(`[risk] wrote default rules to ${this.file}`);
  }

  private load(): CompiledRiskConfig {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const compiled = compileRiskConfig(parsed);
      for (const err of compiled.errors) console.warn(`[risk] ${err}`);
      return compiled;
    } catch (err) {
      console.warn(`[risk] cannot read ${this.file} (${(err as Error).message}) — keeping previous rules`);
      return this.compiled ?? compileRiskConfig(DEFAULT_RISK_CONFIG);
    }
  }

  get(): CompiledRiskConfig {
    return this.compiled;
  }
}
