#!/usr/bin/env node
/**
 * The process Claude Code spawns for every subscribed hook event. Absolute
 * rule: NEVER break the agent. If the pet isn't running, the socket is
 * stale, auth fails, or anything throws — exit 0 with no output, which
 * Claude Code treats as "no opinion".
 *
 * Decision events (PreToolUse, PermissionRequest) wait for the host, which
 * owns hold policy and replies 'none' to release us to the normal flow.
 */
import { PetClient } from '@desktop-pets/client';
import type { HookEventName, HookPayload } from '@desktop-pets/shared';

const DECISION_EVENTS = new Set<HookEventName>(['PreToolUse', 'PermissionRequest']);
// Client-side safety net only — must stay under the hook timeout so we exit
// cleanly with "no decision" rather than being killed.
const MAX_HOLD_MS = Number(process.env['DESKTOP_PETS_MAX_HOLD_MS'] ?? 590_000);

const debug = (...args: unknown[]): void => {
  if (process.env['DESKTOP_PETS_DEBUG']) console.error('[desktop-pets-hook]', ...args);
};

async function readStdin(timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve(data), timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function main(): Promise<void> {
  const raw = await readStdin(2000);
  let payload: HookPayload;
  try {
    payload = JSON.parse(raw) as HookPayload;
  } catch {
    debug('unparseable stdin');
    return;
  }
  const event = (payload.hook_event_name ?? process.argv[2]) as HookEventName | undefined;
  if (!event) return;

  const client = await PetClient.connect({
    role: 'hook',
    timeoutMs: 250,
    session: {
      ...(payload.session_id !== undefined ? { id: payload.session_id } : {}),
      ...(payload.cwd !== undefined ? { cwd: payload.cwd } : {}),
      ...(process.env['TERM_PROGRAM'] ? { termProgram: process.env['TERM_PROGRAM'] } : {}),
      ...(process.env['__CFBundleIdentifier'] ? { bundleId: process.env['__CFBundleIdentifier'] } : {}),
    },
  });
  if (!client) {
    debug('host not running');
    return;
  }

  try {
    if (DECISION_EVENTS.has(event)) {
      const { decision, reason } = await client.requestDecision(event, payload, MAX_HOLD_MS);
      debug(event, '->', decision, reason ?? '');
      if (decision === 'allow' || decision === 'deny') {
        if (event === 'PermissionRequest') {
          const dec: Record<string, unknown> = { behavior: decision };
          if (decision === 'deny') dec['message'] = reason ?? 'Denied from desktop pet';
          process.stdout.write(
            JSON.stringify({
              hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: dec },
            }),
          );
        } else {
          process.stdout.write(
            JSON.stringify({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: decision,
                permissionDecisionReason: reason ?? `${decision === 'allow' ? 'Approved' : 'Denied'} from desktop pet`,
              },
            }),
          );
        }
      }
    } else {
      client.sendEvent(event, payload);
    }
  } finally {
    await client.close();
  }
}

main()
  .catch((err) => debug('error', err))
  .finally(() => process.exit(0));
