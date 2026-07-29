import path from 'node:path';
import type {
  ClientMsg,
  Decision,
  EventMsg,
  HookPayload,
  Reaction,
  RiskVerdict,
  SessionInfo,
} from '@desktop-pets/shared';
import type { IpcConnection } from './ipc-server.js';

export interface AgentSession {
  key: string;
  sessionId?: string;
  cwd?: string;
  name: string;
  termProgram?: string;
  bundleId?: string;
  permissionMode?: string;
  status: Reaction;
  oneShot?: { reaction: Reaction; nonce: number };
  bubbleText?: string;
  /** Set while blocked on a permission decision. */
  waitingSince?: number;
  lastEventAt: number;
  ended?: boolean;
  /** Alternates the two running rows so pacing looks alive. */
  runFlip?: boolean;
  /** Undismissed risk alarm — sticky until the user dismisses it. */
  alarm?: { ruleId: string; reason: string; detail: string; since: number };
}

export interface DecisionRequest {
  session: AgentSession;
  event: 'PreToolUse' | 'PermissionRequest';
  payload: HookPayload;
  respond: (decision: Decision, reason?: string) => void;
  /** Risk verdict for PreToolUse requests, when a classifier is installed. */
  verdict?: RiskVerdict;
}

/** A discrete moment worth surfacing through the escalation ladder. */
export type SurfaceKind = 'success' | 'blocked' | 'error' | 'risky';

export interface SurfaceMoment {
  kind: SurfaceKind;
  session: AgentSession;
  title: string;
  body: string;
}

export interface SessionManagerOptions {
  sanitize: (text: unknown) => string;
  onChange: () => void;
  /**
   * Seam for the decision broker (stage 6).
   * Default: immediately answer 'none' so Claude Code's own flow proceeds.
   */
  onDecisionRequest?: (req: DecisionRequest) => void;
  /** Risk classifier (stage 4). Undefined → everything is 'none'. */
  classify?: (call: { toolName: string; toolInput: Record<string, unknown> | undefined }) => RiskVerdict;
  /** Discrete moments to route through the escalation ladder (stage 5). */
  onSurface?: (moment: SurfaceMoment) => void;
  now?: () => number;
}

const TEST_CMD_RE =
  /\b(vitest|jest|pytest|playwright|cypress|rspec|ctest|cargo test|go test|mvn test|gradle test|(?:npm|pnpm|yarn|bun)( run)? test)\b/;

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch']);

export function reactionForPreToolUse(payload: HookPayload): Reaction {
  const tool = payload.tool_name ?? '';
  if (tool === 'Bash') {
    const cmd = typeof payload.tool_input?.['command'] === 'string' ? (payload.tool_input['command'] as string) : '';
    return TEST_CMD_RE.test(cmd) ? 'testing' : 'running';
  }
  if (EDIT_TOOLS.has(tool)) return 'editing';
  if (READ_TOOLS.has(tool)) return 'thinking';
  return 'working';
}

/** Tracks every connected agent session and its current display state. */
export class SessionManager {
  private readonly sessions = new Map<string, AgentSession>();
  private nonce = 0;
  private sayTimers = new Map<string, NodeJS.Timeout>();
  private readonly now: () => number;

  constructor(private readonly opts: SessionManagerOptions) {
    this.now = opts.now ?? Date.now;
  }

  list(): AgentSession[] {
    return [...this.sessions.values()].filter((s) => !s.ended);
  }

  /** The session the home pet mirrors: most recent activity wins. */
  displaySession(): AgentSession | undefined {
    return this.list().sort((a, b) => b.lastEventAt - a.lastEventAt)[0];
  }

  get(key: string): AgentSession | undefined {
    return this.sessions.get(key);
  }

  private ensureSession(info: SessionInfo | undefined, payload?: HookPayload): AgentSession {
    const sessionId = payload?.session_id ?? info?.id;
    const cwd = payload?.cwd ?? info?.cwd;
    let key: string;
    if (sessionId) {
      key = sessionId;
    } else if (cwd) {
      // MCP servers don't know their session id; merge into the most recent
      // hook session with the same cwd, else keep a cwd-keyed session (D6).
      const byCwd = this.list()
        .filter((s) => s.cwd === cwd)
        .sort((a, b) => b.lastEventAt - a.lastEventAt)[0];
      if (byCwd) return this.touch(byCwd, info, payload);
      key = `cwd:${cwd}`;
    } else {
      key = 'unknown';
    }
    const existing = this.sessions.get(key);
    if (existing) return this.touch(existing, info, payload);

    const session: AgentSession = {
      key,
      name: cwd ? path.basename(cwd) : 'agent',
      status: 'idle',
      lastEventAt: this.now(),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(cwd !== undefined ? { cwd } : {}),
    };
    this.touch(session, info, payload);
    this.sessions.set(key, session);
    return session;
  }

  private touch(s: AgentSession, info?: SessionInfo, payload?: HookPayload): AgentSession {
    s.lastEventAt = this.now();
    if (info?.termProgram) s.termProgram = info.termProgram;
    if (info?.bundleId) s.bundleId = info.bundleId;
    if (payload?.permission_mode) s.permissionMode = payload.permission_mode;
    if (payload?.cwd && !s.cwd) {
      s.cwd = payload.cwd;
      s.name = path.basename(payload.cwd);
    }
    if (s.ended) delete s.ended;
    return s;
  }

  private oneShot(s: AgentSession, reaction: Reaction): void {
    this.nonce += 1;
    s.oneShot = { reaction, nonce: this.nonce };
  }

  private surface(kind: SurfaceKind, s: AgentSession, title: string, body: string): void {
    this.opts.onSurface?.({ kind, session: s, title, body });
  }

  private setBubble(s: AgentSession, text: string | undefined, ttlMs?: number): void {
    const timer = this.sayTimers.get(s.key);
    if (timer) {
      clearTimeout(timer);
      this.sayTimers.delete(s.key);
    }
    if (text === undefined || text.length === 0) {
      delete s.bubbleText;
      return;
    }
    s.bubbleText = text;
    if (ttlMs) {
      this.sayTimers.set(
        s.key,
        setTimeout(() => {
          delete s.bubbleText;
          this.opts.onChange();
        }, ttlMs),
      );
    }
  }

  handleMessage(conn: IpcConnection, msg: ClientMsg): void {
    switch (msg.t) {
      case 'hello':
        return; // handled by the server
      case 'event':
        this.handleEvent(conn, msg);
        break;
      case 'status': {
        const s = this.ensureSession(conn.session);
        s.status = msg.reaction;
        this.setBubble(s, msg.text !== undefined ? this.opts.sanitize(msg.text) : undefined);
        break;
      }
      case 'react': {
        const s = this.ensureSession(conn.session);
        this.oneShot(s, msg.reaction);
        if (msg.text !== undefined) this.setBubble(s, this.opts.sanitize(msg.text), 8000);
        break;
      }
      case 'say': {
        const s = this.ensureSession(conn.session);
        this.setBubble(s, this.opts.sanitize(msg.text), 8000);
        break;
      }
    }
    this.opts.onChange();
  }

  private handleEvent(conn: IpcConnection, msg: EventMsg): void {
    const s = this.ensureSession(conn.session, msg.payload);
    const respond = (decision: Decision, reason?: string): void => {
      if (msg.wantsDecision && msg.id) {
        conn.reply({ t: 'decision', id: msg.id, decision, ...(reason !== undefined ? { reason } : {}) });
      }
    };

    switch (msg.event) {
      case 'SessionStart':
        s.status = 'idle';
        this.oneShot(s, 'waving');
        break;
      case 'UserPromptSubmit':
        s.status = 'thinking';
        delete s.waitingSince;
        this.setBubble(s, undefined);
        break;
      case 'PreToolUse': {
        const next = reactionForPreToolUse(msg.payload);
        if (next === 'running' && s.status !== 'running') s.runFlip = !s.runFlip;
        s.status = next;
        delete s.waitingSince;
        this.setBubble(s, undefined);

        const verdict = this.opts.classify?.({
          toolName: msg.payload.tool_name ?? '',
          toolInput: msg.payload.tool_input,
        });
        if (verdict && verdict.level === 'alarm') {
          const command = msg.payload.tool_input?.['command'] ?? msg.payload.tool_input?.['file_path'] ?? '';
          const detail = this.opts.sanitize(command);
          const reason = verdict.reason ?? 'Risky operation';
          s.alarm = { ruleId: verdict.ruleId ?? 'unknown', reason, detail, since: this.now() };
          this.surface('risky', s, `⚠︎ ${s.name}`, detail ? `${reason} — ${detail}` : reason);
        }
        if (msg.wantsDecision) {
          this.dispatchDecision({
            session: s,
            event: 'PreToolUse',
            payload: msg.payload,
            respond,
            ...(verdict ? { verdict } : {}),
          });
          return; // onChange fires via dispatch path
        }
        break;
      }
      case 'PostToolUse':
        if (s.status !== 'waiting') s.status = 'working';
        break;
      case 'PostToolUseFailure':
        this.oneShot(s, 'error');
        break;
      case 'PermissionRequest': {
        const wasWaiting = s.status === 'waiting';
        s.status = 'waiting';
        s.waitingSince = s.waitingSince ?? this.now();
        const tool = msg.payload.tool_name ?? 'a tool';
        this.setBubble(s, this.opts.sanitize(`Needs permission: ${tool}`));
        if (!wasWaiting) this.surface('blocked', s, `${s.name} is blocked`, `Needs permission: ${tool}`);
        if (msg.wantsDecision) {
          this.dispatchDecision({ session: s, event: 'PermissionRequest', payload: msg.payload, respond });
          return;
        }
        break;
      }
      case 'Notification': {
        const kind = msg.payload.notification_type;
        if (kind === 'permission_prompt') {
          s.status = 'waiting';
          s.waitingSince = s.waitingSince ?? this.now();
          this.setBubble(s, this.opts.sanitize(msg.payload.message ?? 'Waiting for permission'));
        } else if (kind === 'idle_prompt') {
          s.status = 'idle';
          this.setBubble(s, undefined);
        }
        break;
      }
      case 'Stop':
        s.status = 'idle';
        delete s.waitingSince;
        this.oneShot(s, 'success');
        this.setBubble(s, undefined);
        this.surface('success', s, `${s.name} finished`, 'Task complete');
        break;
      case 'StopFailure': {
        s.status = 'error';
        const why = `Turn failed: ${msg.payload.error_type ?? 'unknown error'}`;
        this.setBubble(s, this.opts.sanitize(why));
        this.surface('error', s, `${s.name} failed`, why);
        break;
      }
      case 'SessionEnd': {
        s.ended = true;
        delete s.alarm;
        this.setBubble(s, undefined);
        const timer = this.sayTimers.get(s.key);
        if (timer) clearTimeout(timer);
        break;
      }
      case 'SubagentStop':
        break;
    }
    respond('none');
    this.opts.onChange();
  }

  private dispatchDecision(req: DecisionRequest): void {
    const handler = this.opts.onDecisionRequest;
    if (handler) {
      handler(req);
    } else {
      req.respond('none');
    }
    this.opts.onChange();
  }

  dismissAlarm(key: string): void {
    const s = this.sessions.get(key);
    if (s?.alarm) {
      delete s.alarm;
      this.opts.onChange();
    }
  }

  onDisconnect(_conn: IpcConnection): void {
    // Hook runner connections are one-shot per event; MCP servers reconnect.
    // Session lifetime is governed by SessionEnd + the staleness sweeper.
  }

  /** Drop sessions with no events for `maxIdleMs` (agent died mid-task). */
  sweepStale(maxIdleMs: number): boolean {
    let changed = false;
    for (const [key, s] of this.sessions) {
      if (this.now() - s.lastEventAt > maxIdleMs) {
        this.sessions.delete(key);
        const timer = this.sayTimers.get(key);
        if (timer) clearTimeout(timer);
        this.sayTimers.delete(key);
        changed = true;
      }
    }
    if (changed) this.opts.onChange();
    return changed;
  }
}
