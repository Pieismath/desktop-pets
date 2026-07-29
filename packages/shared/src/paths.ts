import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

/**
 * All host/client rendezvous files live under one data directory.
 * `DESKTOP_PETS_DIR` overrides it (used by tests and by anyone who wants the
 * pet fully sandboxed). macOS-first on purpose; other platforms fall back to
 * a dot directory so nothing here is load-bearing for a future port.
 */
export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env['DESKTOP_PETS_DIR'];
  if (override && override.trim().length > 0) return path.resolve(override);
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'desktop-pets');
  }
  return path.join(os.homedir(), '.desktop-pets');
}

/** Socket path + per-run token, written by the host with mode 0600. */
export function ipcInfoPath(env?: NodeJS.ProcessEnv): string {
  return path.join(dataDir(env), 'ipc.json');
}

/**
 * macOS limits AF_UNIX socket paths to ~104 bytes (sun_path). When the data
 * dir would blow that budget, fall back to a short, deterministic /tmp path
 * keyed by the data dir. Clients never compute this themselves — they read
 * the actual socket path from ipc.json.
 */
export function socketPath(env?: NodeJS.ProcessEnv): string {
  const preferred = path.join(dataDir(env), 'pet.sock');
  if (preferred.length <= 90) return preferred;
  const key = crypto.createHash('sha256').update(dataDir(env)).digest('hex').slice(0, 12);
  return path.join('/tmp', `desktop-pets-${os.userInfo().uid}-${key}.sock`);
}

export function userPetsDir(env?: NodeJS.ProcessEnv): string {
  return path.join(dataDir(env), 'pets');
}

export function stateFilePath(env?: NodeJS.ProcessEnv): string {
  return path.join(dataDir(env), 'state.json');
}

export function configFilePath(env?: NodeJS.ProcessEnv): string {
  return path.join(dataDir(env), 'config.json');
}

export function riskRulesPath(env?: NodeJS.ProcessEnv): string {
  return path.join(dataDir(env), 'risk-rules.json');
}

export function historyPath(env?: NodeJS.ProcessEnv): string {
  return path.join(dataDir(env), 'history.jsonl');
}
