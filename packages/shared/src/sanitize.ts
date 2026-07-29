/**
 * The single sanitiser through which ALL agent-originated text passes before
 * it can be displayed (host applies it at the display boundary, so even a
 * misbehaving client can't get raw content onto the screen).
 *
 * Strips: ANSI/control sequences, everything after the first line, URLs,
 * emails, secret-looking assignments, env-var assignments, file paths,
 * long opaque tokens. Truncates hard. Returns '' for non-text input.
 */

export interface SanitizeOptions {
  maxLength?: number;
}

const DEFAULT_MAX = 140;

 
const ANSI = /[\u001b\u009b][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
 
const CONTROL = /[\u0000-\u001f\u007f]/g;

const URL_RE = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s'"`]+/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;

// "api_key=...", "Authorization: Bearer ...", "password: hunter2", etc.
const SECRET_ASSIGN_RE =
  /\b((?:api[_-]?key|apikey|token|secret|passwd|password|pwd|auth(?:orization)?|bearer|credentials?|private[_-]?key|access[_-]?key|session[_-]?id|cookie)[\w-]*)\s*[:=]+\s*(?:[Bb]earer\s+)?[^\s'"`]+/gi;
const BEARER_RE = /\bbearer\s+[A-Za-z0-9._~+/=-]{6,}/gi;
// UPPER_SNAKE=value — env assignments always have their values hidden.
const ENV_ASSIGN_RE = /\b([A-Z][A-Z0-9_]{2,})=[^\s'"`]+/g;

// Home paths, multi-segment absolute paths, well-known single-segment roots,
// Windows drive paths (cross-platform input can still reach a macOS pet).
const HOME_PATH_RE = /(?:~|\/(?:Users|home)\/[\w.-]+)(?:\/[^\s:'"`]*)*/g;
const ABS_PATH_RE = /(?<![\w@.:])\/[\w.@+-]+(?:\/[\w.@+~-]+)+\/?/g;
const ROOT_PATH_RE = /(?<![\w@.:])\/(?:etc|var|usr|tmp|opt|private|dev|bin|sbin|lib|srv|proc)(?:\/[\w.@+~-]+)*\b/g;
// Any remaining single-segment absolute path (/data, /backup) — a slash-word
// preceded by non-word can't be prose ("TCP/IP", "50/50" are protected by
// the lookbehind), so treat it as a path.
const ABS_SINGLE_RE = /(?<![\w@.:])\/[\w.@+-]{2,}(?=[\s,.;:!?)]|$)/g;
const WIN_PATH_RE = /\b[A-Za-z]:\\[^\s'"`]+/g;

// Opaque tokens: long hex, known credential prefixes, long mixed-class blobs.
const HEX_TOKEN_RE = /\b[A-Fa-f0-9]{32,}\b/g;
const KNOWN_TOKEN_RE = /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|xox[abps]|AKIA|ASIA|eyJ)[A-Za-z0-9_.-]{10,}\b/g;
const MIXED_TOKEN_RE = /\b(?=[^\s]{28,})(?=[^\s]*[A-Z])(?=[^\s]*[a-z])(?=[^\s]*\d)[A-Za-z0-9+/=_-]{28,}\b/g;

export function sanitizeSpeech(input: unknown, opts: SanitizeOptions = {}): string {
  const maxLength = opts.maxLength ?? DEFAULT_MAX;

  let text: string;
  if (typeof input === 'string') text = input;
  else if (typeof input === 'number' || typeof input === 'boolean') text = String(input);
  else return '';

  text = text.replace(ANSI, '');

  // Multiline content never displays: first non-empty line only.
  const lines = text.split(/\r?\n/);
  const first = lines.find((l) => l.trim().length > 0) ?? '';
  const hadMore = lines.filter((l) => l.trim().length > 0).length > 1;
  text = first + (hadMore ? ' …' : '');

  text = text.replace(CONTROL, ' ');

  text = text.replace(URL_RE, '⟨url⟩');
  text = text.replace(EMAIL_RE, '⟨email⟩');
  text = text.replace(SECRET_ASSIGN_RE, (_m, name: string) => `${name}=⟨redacted⟩`);
  text = text.replace(BEARER_RE, 'bearer ⟨redacted⟩');
  text = text.replace(ENV_ASSIGN_RE, (_m, name: string) => `${name}=⟨redacted⟩`);
  text = text.replace(HOME_PATH_RE, '⟨path⟩');
  text = text.replace(WIN_PATH_RE, '⟨path⟩');
  text = text.replace(ABS_PATH_RE, '⟨path⟩');
  text = text.replace(ROOT_PATH_RE, '⟨path⟩');
  text = text.replace(ABS_SINGLE_RE, '⟨path⟩');
  text = text.replace(KNOWN_TOKEN_RE, '⟨token⟩');
  text = text.replace(HEX_TOKEN_RE, '⟨token⟩');
  text = text.replace(MIXED_TOKEN_RE, '⟨token⟩');

  text = text.replace(/\s+/g, ' ').trim();

  if (text.length > maxLength) {
    text = text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
  }
  return text;
}
