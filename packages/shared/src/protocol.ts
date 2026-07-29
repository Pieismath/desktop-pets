import type { Reaction } from './reactions.js';

/**
 * NDJSON protocol over the local Unix socket. Every connection must open
 * with `hello` carrying the per-run token from ipc.json (mode 0600); the
 * host destroys unauthenticated connections after a short grace period.
 */

export const PROTOCOL_VERSION = 1;

export interface SessionInfo {
  /** Claude Code session_id when known (hook events carry it). */
  id?: string;
  cwd?: string;
  /** Terminal app identity for focus/escalation (from TERM_PROGRAM / __CFBundleIdentifier). */
  termProgram?: string;
  bundleId?: string;
}

export type HookEventName =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PermissionRequest'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'Stop'
  | 'StopFailure'
  | 'SubagentStop'
  | 'SessionEnd';

/** The subset of Claude Code hook payload fields the host consumes. */
export interface HookPayload {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  permission_mode?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  notification_type?: string;
  message?: string;
  error_type?: string;
  reason?: string;
  source?: string;
  [key: string]: unknown;
}

export interface HelloMsg {
  t: 'hello';
  v: number;
  token: string;
  role: 'hook' | 'mcp' | 'cli';
  pid?: number;
  session?: SessionInfo;
}

export interface EventMsg {
  t: 'event';
  /** Correlation id; required when wantsDecision. */
  id?: string;
  event: HookEventName;
  /** Ask the host for an allow/deny/none decision (PreToolUse, PermissionRequest). */
  wantsDecision?: boolean;
  payload: HookPayload;
}

export interface ReactMsg {
  t: 'react';
  reaction: Reaction;
  text?: string;
}

export interface StatusMsg {
  t: 'status';
  reaction: Reaction;
  text?: string;
}

export interface SayMsg {
  t: 'say';
  text: string;
}

export type ClientMsg = HelloMsg | EventMsg | ReactMsg | StatusMsg | SayMsg;

export interface AckMsg {
  t: 'ack';
  ok: true;
  hostVersion: string;
}

export interface ErrMsg {
  t: 'err';
  code: 'auth' | 'proto' | 'internal';
  msg: string;
}

export type Decision = 'allow' | 'deny' | 'none';

export interface DecisionMsg {
  t: 'decision';
  id: string;
  decision: Decision;
  reason?: string;
}

export type HostMsg = AckMsg | ErrMsg | DecisionMsg;

export interface IpcInfo {
  socket: string;
  token: string;
  pid: number;
  startedAt: string;
}

export function parseLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}
