/**
 * Risk classification: is this tool call about to do something the user
 * should look at? Rules live in one auditable, user-editable config file;
 * this module ships the defaults and the engine.
 *
 * Precision beats recall everywhere (false alarms kill the feature):
 * - commands are split quote-aware, so `echo "rm -rf /"` never fires;
 * - read-only leading commands (grep/cat/echo…) are skipped per segment;
 * - `rm` uses a real token parser with a safelist for junk dirs;
 * - `--force-with-lease` is explicitly not an alarm.
 */

export type RiskLevel = 'none' | 'alarm';

export interface RiskVerdict {
  level: RiskLevel;
  ruleId?: string;
  reason?: string;
}

export interface RiskRuleConfig {
  id: string;
  /** Human explanation shown on the pet and in the config file. */
  reason: string;
  enabled?: boolean;
  /** Built-in analyser instead of a regex ('rm-rf'). */
  builtin?: 'rm-rf';
  match?: {
    /** Tool names, '|'-separated. Default 'Bash' for command rules. */
    tool?: string;
    /**
     * Regex applied to each command segment (commands are split on ;|& and
     * newlines outside quotes, so a pattern never spans a pipe and text
     * inside quotes can't fake a match).
     */
    command?: string;
    /** Regex applied to tool_input.file_path (Write/Edit/…). */
    filePath?: string;
  };
  unless?: {
    command?: string;
    filePath?: string;
  };
}

export interface RiskConfig {
  version: 1;
  /** Directory names whose deletion is routine, not alarming. */
  safelistPaths: string[];
  rules: RiskRuleConfig[];
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  version: 1,
  safelistPaths: [
    'node_modules',
    'dist',
    'build',
    'out',
    'coverage',
    'tmp',
    '.tmp',
    '.cache',
    '.next',
    '.turbo',
    'target',
    '__pycache__',
    '.venv',
  ],
  rules: [
    { id: 'rm-recursive-force', builtin: 'rm-rf', reason: 'Recursive force-delete (rm -rf)' },
    {
      id: 'git-push-force',
      reason: 'Force push rewrites remote history',
      match: { command: '\\bgit\\s+push\\b(?=[^\\n]*(?:\\s--force\\b|\\s-[a-zA-Z]*f))' },
      unless: { command: '--force-with-lease' },
    },
    {
      id: 'git-reset-hard',
      reason: 'Hard reset discards local changes',
      match: { command: '\\bgit\\s+reset\\b[^\\n]*\\s--hard\\b' },
    },
    {
      id: 'git-clean-force',
      reason: 'git clean deletes untracked files',
      match: { command: '\\bgit\\s+clean\\b[^\\n]*\\s-[a-zA-Z]*[fd]' },
    },
    { id: 'sudo', reason: 'Privileged command (sudo)', match: { command: '^sudo\\s' } },
    {
      id: 'sql-drop',
      reason: 'Destructive SQL (DROP/TRUNCATE)',
      match: { command: '\\b(?:DROP\\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\\s+TABLE|TRUNCATE\\s+[a-zA-Z_][\\w.]*\\s*;?$)' },
    },
    { id: 'kubectl-delete', reason: 'kubectl delete/drain', match: { command: '\\bkubectl\\s+(?:delete|drain)\\b' } },
    {
      id: 'terraform-destroy',
      reason: 'terraform destroy',
      match: { command: '\\bterraform\\s+(?:destroy\\b|apply\\s+-destroy)' },
    },
    { id: 'dd-device', reason: 'Raw write to a device', match: { command: '\\bdd\\b[^\\n]*\\bof=/dev/' } },
    { id: 'mkfs', reason: 'Filesystem format', match: { command: '\\bmkfs(?:\\.|\\s)' } },
    {
      id: 'db-wipe',
      reason: 'Database wipe',
      match: { command: '\\b(?:dropdb\\b|redis-cli\\b[^\\n]*\\bflush(?:all|db)\\b)' },
    },
    {
      id: 'aws-s3-destroy',
      reason: 'Destructive S3 operation',
      match: { command: '\\baws\\s+s3\\s+(?:rb\\b|rm\\b[^\\n]*--recursive)' },
    },
    {
      id: 'chmod-world-root',
      reason: 'chmod 777 from a root path',
      match: { command: '\\bchmod\\s+(?:-[a-zA-Z]+\\s+)*(?:-R\\s+)?777\\s+/' },
    },
    { id: 'host-power', reason: 'Host shutdown/reboot', match: { command: '^(?:shutdown|reboot|halt)\\b' } },
    {
      id: 'env-file-write',
      reason: 'Writes a .env file (secrets)',
      match: { tool: 'Write|Edit|MultiEdit|NotebookEdit', filePath: '(^|/)\\.env(\\.[\\w-]+)?$' },
      unless: { filePath: '\\.env\\.(example|sample|template|test)$' },
    },
    {
      id: 'credentials-write',
      reason: 'Writes a credentials/secrets file',
      match: { tool: 'Write|Edit|MultiEdit|NotebookEdit', filePath: '(^|/)(credentials?|secrets?)(\\.[\\w.-]+)?$' },
    },
    {
      id: 'private-key-write',
      reason: 'Writes a private key file',
      match: { tool: 'Write|Edit|MultiEdit|NotebookEdit', filePath: '\\.(pem|p12|pfx)$|(^|/)id_(rsa|ed25519|ecdsa)$' },
    },
    {
      id: 'prod-config-write',
      reason: 'Writes production config',
      match: {
        tool: 'Write|Edit|MultiEdit|NotebookEdit',
        filePath:
          '(^|/)(prod|production)([._-][^/]*)?\\.(json|ya?ml|toml|tf|tfvars|env|xml|ini|conf)$|(^|/)(prod|production)/[^/]+\\.(json|ya?ml|toml|tf|tfvars|env|xml|ini|conf)$',
      },
    },
  ],
};

/** Leading commands that only read their arguments — never alarm on these. */
const READONLY_CMDS = new Set([
  'echo', 'printf', 'cat', 'grep', 'rg', 'ag', 'less', 'more', 'head', 'tail',
  'find', 'fd', 'ls', 'stat', 'file', 'which', 'type', 'man', 'wc', 'diff', 'git-log',
]);

/** Wrappers whose real command follows. */
const WRAPPER_CMDS = new Set(['sudo', 'env', 'command', 'nice', 'nohup', 'time', 'timeout', 'xargs', 'doas']);

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

export interface CommandSegment {
  raw: string;
  tokens: string[];
}

/**
 * Split a shell command on ; | & and newlines, honouring quotes and
 * backslash escapes so text inside strings can't create fake segments.
 * Tokens keep their quote-stripped content.
 */
export function splitCommand(command: string): CommandSegment[] {
  const segments: CommandSegment[] = [];
  let raw = '';
  let token = '';
  let tokens: string[] = [];
  let quote: '"' | "'" | '`' | null = null;

  const endToken = (): void => {
    if (token.length > 0) tokens.push(token);
    token = '';
  };
  const endSegment = (): void => {
    endToken();
    if (raw.trim().length > 0) segments.push({ raw: raw.trim(), tokens });
    raw = '';
    tokens = [];
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote) {
      raw += ch;
      if (ch === '\\' && quote === '"' && i + 1 < command.length) {
        token += command[i + 1];
        raw += command[i + 1];
        i++;
      } else if (ch === quote) {
        quote = null;
      } else {
        token += ch;
      }
      continue;
    }
    if (ch === '\\' && i + 1 < command.length) {
      token += command[i + 1];
      raw += ch + command[i + 1];
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      raw += ch;
      continue;
    }
    if (ch === ';' || ch === '&' || ch === '|' || ch === '\n') {
      endSegment();
      continue;
    }
    raw += ch;
    if (ch === ' ' || ch === '\t') endToken();
    else token += ch;
  }
  endSegment();
  return segments;
}

/** Strip wrappers (sudo, env VAR=x, xargs, …) to find the effective command. */
export function effectiveTokens(tokens: string[]): { cmd: string | undefined; args: string[]; sudo: boolean } {
  let rest = [...tokens];
  let sudo = false;
  for (;;) {
    while (rest.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0]!)) rest = rest.slice(1);
    const head = rest[0];
    if (head === undefined) return { cmd: undefined, args: [], sudo };
    const base = head.replace(/^.*\//, '');
    if (WRAPPER_CMDS.has(base)) {
      if (base === 'sudo' || base === 'doas') sudo = true;
      rest = rest.slice(1);
      while (rest.length > 0 && rest[0]!.startsWith('-')) rest = rest.slice(1);
      continue;
    }
    return { cmd: base, args: rest.slice(1), sudo };
  }
}

function longFlagToShort(flag: string): string {
  if (flag === '--recursive') return 'r';
  if (flag === '--force') return 'f';
  return '';
}

/**
 * Is every rm target inside a safelisted junk directory? Only *relative*
 * paths qualify — deleting under an absolute path or the home dir is never
 * routine, even if a path segment happens to be named like junk (/tmp!).
 */
function allTargetsSafelisted(targets: string[], safelist: ReadonlySet<string>): boolean {
  if (targets.length === 0) return false;
  return targets.every((t) => {
    if (t.startsWith('/') || t.startsWith('~') || t.startsWith('$')) return false;
    const clean = t.replace(/^\.\//, '').replace(/\/+$/, '');
    if (clean === '' || clean === '.' || clean === '..') return false;
    return clean.split('/').some((seg) => safelist.has(seg));
  });
}

/** Built-in rm analyser: fires on recursive+force deletes, honouring the safelist. */
export function analyseRm(segment: CommandSegment, safelist: ReadonlySet<string>): boolean {
  const { cmd, args } = effectiveTokens(segment.tokens);
  if (cmd !== 'rm') return false;
  let flags = '';
  const targets: string[] = [];
  for (const a of args) {
    if (a === '--') continue;
    if (a.startsWith('--')) flags += longFlagToShort(a);
    else if (a.startsWith('-') && a.length > 1) flags += a.slice(1);
    else targets.push(a);
  }
  const recursive = /[rR]/.test(flags);
  const force = flags.includes('f');
  if (!(recursive && force)) return false;
  return !allTargetsSafelisted(targets, safelist);
}

interface CompiledRule {
  id: string;
  reason: string;
  builtin?: 'rm-rf';
  tools: Set<string>;
  command?: RegExp;
  filePath?: RegExp;
  unlessCommand?: RegExp;
  unlessFilePath?: RegExp;
}

export interface CompiledRiskConfig {
  safelist: ReadonlySet<string>;
  rules: CompiledRule[];
  errors: string[];
}

export function compileRiskConfig(input: unknown): CompiledRiskConfig {
  const errors: string[] = [];
  const cfg = (typeof input === 'object' && input !== null ? input : {}) as Partial<RiskConfig>;
  const safelist = new Set(
    Array.isArray(cfg.safelistPaths) ? cfg.safelistPaths.filter((s): s is string => typeof s === 'string') : DEFAULT_RISK_CONFIG.safelistPaths,
  );
  const rules: CompiledRule[] = [];
  const list = Array.isArray(cfg.rules) ? cfg.rules : [];
  for (const r of list) {
    if (!r || typeof r.id !== 'string' || typeof r.reason !== 'string') {
      errors.push(`skipping rule without id/reason: ${JSON.stringify(r)}`);
      continue;
    }
    if (r.enabled === false) continue;
    const tools = new Set((r.match?.tool ?? 'Bash').split('|').map((t) => t.trim()));
    try {
      rules.push({
        id: r.id,
        reason: r.reason,
        tools,
        ...(r.builtin === 'rm-rf' ? { builtin: 'rm-rf' as const } : {}),
        ...(r.match?.command ? { command: new RegExp(r.match.command, 'i') } : {}),
        ...(r.match?.filePath ? { filePath: new RegExp(r.match.filePath, 'i') } : {}),
        ...(r.unless?.command ? { unlessCommand: new RegExp(r.unless.command, 'i') } : {}),
        ...(r.unless?.filePath ? { unlessFilePath: new RegExp(r.unless.filePath, 'i') } : {}),
      });
    } catch (err) {
      errors.push(`rule ${r.id}: invalid regex (${(err as Error).message})`);
    }
  }
  return { safelist, rules, errors };
}

export const DEFAULT_COMPILED_RISK = compileRiskConfig(DEFAULT_RISK_CONFIG);

export interface ToolCall {
  toolName: string;
  toolInput: Record<string, unknown> | undefined;
}

function classifySegments(segments: CommandSegment[], config: CompiledRiskConfig, depth: number): RiskVerdict {
  for (const seg of segments) {
    const { cmd, args } = effectiveTokens(seg.tokens);
    if (cmd === undefined) continue;
    if (READONLY_CMDS.has(cmd)) continue;

    // `bash -c "…"`: classify the nested command string (one level deep).
    if (SHELLS.has(cmd) && depth < 2) {
      const cIdx = args.findIndex((a) => a === '-c' || a === '-lc');
      const nested = cIdx >= 0 ? args[cIdx + 1] : undefined;
      if (nested) {
        const verdict = classifySegments(splitCommand(nested), config, depth + 1);
        if (verdict.level === 'alarm') return verdict;
      }
    }

    for (const rule of config.rules) {
      if (!rule.tools.has('Bash')) continue;
      if (rule.builtin === 'rm-rf') {
        if (analyseRm(seg, config.safelist)) return { level: 'alarm', ruleId: rule.id, reason: rule.reason };
        continue;
      }
      if (!rule.command) continue;
      if (rule.unlessCommand?.test(seg.raw)) continue;
      if (rule.command.test(seg.raw)) return { level: 'alarm', ruleId: rule.id, reason: rule.reason };
    }
  }
  return { level: 'none' };
}

/** Classify one tool call. Returns the first matching rule in config order. */
export function classifyToolCall(call: ToolCall, config: CompiledRiskConfig = DEFAULT_COMPILED_RISK): RiskVerdict {
  if (call.toolName === 'Bash') {
    const command = typeof call.toolInput?.['command'] === 'string' ? (call.toolInput['command'] as string) : '';
    if (!command) return { level: 'none' };
    return classifySegments(splitCommand(command), config, 0);
  }

  const filePath = typeof call.toolInput?.['file_path'] === 'string' ? (call.toolInput['file_path'] as string) : '';
  if (!filePath) return { level: 'none' };
  for (const rule of config.rules) {
    if (!rule.filePath || !rule.tools.has(call.toolName)) continue;
    if (rule.unlessFilePath?.test(filePath)) continue;
    if (rule.filePath.test(filePath)) return { level: 'alarm', ruleId: rule.id, reason: rule.reason };
  }
  return { level: 'none' };
}
