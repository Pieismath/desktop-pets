#!/usr/bin/env node
/**
 * desktop-pets-hooks install|uninstall|status [--settings <path>] [--node <path>] [--dry-run]
 *
 * Writes our hook entries into Claude Code's settings.json (default
 * ~/.claude/settings.json), backing the file up first. `uninstall` removes
 * exactly what we wrote — entries are recognised by the hook-runner.js
 * basename in their args — and leaves everything else untouched.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  installIntoSettings,
  statusOfSettings,
  uninstallFromSettings,
  type SettingsObject,
} from './settings.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const cmd = process.argv[2];
const settingsPath = arg('--settings') ?? path.join(os.homedir(), '.claude', 'settings.json');
const nodePath = arg('--node') ?? process.execPath;
const dryRun = process.argv.includes('--dry-run');
const runnerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hook-runner.js');

function readSettings(file: string): SettingsObject {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  if (raw.trim().length === 0) return {};
  const parsed: unknown = JSON.parse(raw); // malformed settings must abort, never clobber
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file} does not contain a JSON object`);
  }
  return parsed as SettingsObject;
}

function writeSettings(file: string, value: SettingsObject): void {
  if (fs.existsSync(file)) {
    const backup = `${file}.desktop-pets.bak-${Date.now()}`;
    fs.copyFileSync(file, backup);
    console.log(`backup: ${backup}`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function main(): void {
  if (!fs.existsSync(runnerPath)) {
    throw new Error(`hook runner not built at ${runnerPath} — run pnpm build first`);
  }
  switch (cmd) {
    case 'install': {
      const settings = readSettings(settingsPath);
      const { next, added, updated } = installIntoSettings(settings, runnerPath, nodePath);
      if (dryRun) {
        console.log(JSON.stringify(next, null, 2));
        return;
      }
      if (added.length === 0 && updated.length === 0) {
        console.log('already installed, nothing to do');
        return;
      }
      writeSettings(settingsPath, next);
      console.log(`installed hooks into ${settingsPath}`);
      if (added.length) console.log(`  added:   ${added.join(', ')}`);
      if (updated.length) console.log(`  updated: ${updated.join(', ')}`);
      console.log(`runner: ${nodePath} ${runnerPath}`);
      console.log('uninstall with: desktop-pets-hooks uninstall');
      return;
    }
    case 'uninstall': {
      const settings = readSettings(settingsPath);
      const { next, removed } = uninstallFromSettings(settings);
      if (dryRun) {
        console.log(JSON.stringify(next, null, 2));
        return;
      }
      if (removed === 0) {
        console.log('no desktop-pets hooks found, nothing to do');
        return;
      }
      writeSettings(settingsPath, next);
      console.log(`removed ${removed} desktop-pets hook entr${removed === 1 ? 'y' : 'ies'} from ${settingsPath}`);
      return;
    }
    case 'status': {
      const settings = readSettings(settingsPath);
      const events = statusOfSettings(settings);
      if (events.length === 0) console.log(`not installed in ${settingsPath}`);
      else console.log(`installed in ${settingsPath} for: ${events.join(', ')}`);
      return;
    }
    default:
      console.error('usage: desktop-pets-hooks install|uninstall|status [--settings <path>] [--node <path>] [--dry-run]');
      process.exitCode = 2;
  }
}

try {
  main();
} catch (err) {
  console.error(`error: ${(err as Error).message}`);
  process.exitCode = 1;
}
