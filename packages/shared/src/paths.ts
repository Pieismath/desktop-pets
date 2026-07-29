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

export function socketPath(env?: NodeJS.ProcessEnv): string {
  return path.join(dataDir(env), 'pet.sock');
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
