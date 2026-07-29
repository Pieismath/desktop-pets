import { describe, expect, it } from 'vitest';
import { sanitizeSpeech } from './sanitize.js';

describe('sanitizeSpeech — security boundary', () => {
  it('passes ordinary text through', () => {
    expect(sanitizeSpeech('Tests passed')).toBe('Tests passed');
    expect(sanitizeSpeech('Needs permission: Bash')).toBe('Needs permission: Bash');
    expect(sanitizeSpeech('and/or either way')).toBe('and/or either way');
  });

  it('returns empty for non-text input', () => {
    expect(sanitizeSpeech(undefined)).toBe('');
    expect(sanitizeSpeech(null)).toBe('');
    expect(sanitizeSpeech({ a: 1 })).toBe('');
    expect(sanitizeSpeech(['x'])).toBe('');
    expect(sanitizeSpeech(42)).toBe('42');
  });

  it('keeps only the first non-empty line and marks elision', () => {
    expect(sanitizeSpeech('\n\nline one\nline two\nline three')).toBe('line one …');
    expect(sanitizeSpeech('single line')).toBe('single line');
  });

  it('strips ANSI escapes and control characters', () => {
    expect(sanitizeSpeech('\u001b[31mred\u001b[0m alert')).toBe('red alert');
  });

  it('redacts URLs of any scheme', () => {
    expect(sanitizeSpeech('see https://example.com/a?q=1 now')).toBe('see ⟨url⟩ now');
    expect(sanitizeSpeech('db at postgres://user:pw@host:5432/db')).toBe('db at ⟨url⟩');
    expect(sanitizeSpeech('open file:///Users/x/secret.txt')).toBe('open ⟨url⟩');
    expect(sanitizeSpeech('go to www.example.com/page')).toBe('go to ⟨url⟩');
  });

  it('redacts emails', () => {
    expect(sanitizeSpeech('mail jason.f+work@corp.example.io ok')).toBe('mail ⟨email⟩ ok');
  });

  it('redacts unix paths — home, multi-segment, well-known roots', () => {
    expect(sanitizeSpeech('wrote /Users/jasonfang/Desktop/x.ts fine')).toBe('wrote ⟨path⟩ fine');
    expect(sanitizeSpeech('wrote ~/projects/secret/notes.md')).toBe('wrote ⟨path⟩');
    expect(sanitizeSpeech('read /opt/homebrew/bin/node')).toBe('read ⟨path⟩');
    expect(sanitizeSpeech('touched /etc/passwd')).toBe('touched ⟨path⟩');
    expect(sanitizeSpeech('at /home/deploy/app/config')).toBe('at ⟨path⟩');
    expect(sanitizeSpeech('rm -rf /data')).toBe('rm -rf ⟨path⟩');
    expect(sanitizeSpeech('backup at /backups now')).toBe('backup at ⟨path⟩ now');
    expect(sanitizeSpeech('TCP/IP and 50/50 stay put')).toBe('TCP/IP and 50/50 stay put');
  });

  it('redacts windows paths', () => {
    expect(sanitizeSpeech('wrote C:\\Users\\bob\\secret.txt done')).toBe('wrote ⟨path⟩ done');
  });

  it('redacts secret-looking assignments, keeping the key name', () => {
    expect(sanitizeSpeech('API_KEY=sk-abc123def is set')).toBe('API_KEY=⟨redacted⟩ is set');
    expect(sanitizeSpeech('password: hunter2 saved')).toBe('password=⟨redacted⟩ saved');
    expect(sanitizeSpeech('Authorization: Bearer abc.def.ghi')).toBe('Authorization=⟨redacted⟩');
  });

  it('redacts env-var assignments generically', () => {
    expect(sanitizeSpeech('ran with DATABASE_URL=postgres://x@y/z ok')).toBe('ran with DATABASE_URL=⟨redacted⟩ ok');
    expect(sanitizeSpeech('NODE_ENV=production build')).toBe('NODE_ENV=⟨redacted⟩ build');
  });

  it('redacts opaque tokens: hex, known prefixes, long mixed blobs, JWTs', () => {
    expect(sanitizeSpeech('id deadbeefdeadbeefdeadbeefdeadbeef123456')).toBe('id ⟨token⟩');
    expect(sanitizeSpeech('key ghp_A8dkfjw3Kd9s2 leaked')).toBe('key ⟨token⟩ leaked');
    expect(sanitizeSpeech('jwt eyJhbGciOiJIUzI1NiJ9.payload.sig')).toBe('jwt ⟨token⟩');
    expect(sanitizeSpeech('blob aB3dE6gH9jK2mN5pQ8sT1vW4yZ7x0c done')).toBe('blob ⟨token⟩ done');
  });

  it('does not false-positive on ordinary words and commands', () => {
    expect(sanitizeSpeech('npm test finished')).toBe('npm test finished');
    expect(sanitizeSpeech('3 tests failed in suite auth')).toBe('3 tests failed in suite auth');
    expect(sanitizeSpeech('waiting for permission')).toBe('waiting for permission');
  });

  it('caps length at 140 by default', () => {
    const long = 'many words repeated over and over '.repeat(30);
    const out = sanitizeSpeech(long);
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out.endsWith('…')).toBe(true);
  });

  it('treats very long single-charset runs as tokens (hex rule)', () => {
    expect(sanitizeSpeech('a'.repeat(64))).toBe('⟨token⟩');
  });

  it('survives hostile combined input', () => {
    const evil =
      '\u001b[2Jrm -rf /Users/jasonfang\nAPI_KEY=abc123 http://evil.example/exfil?d=deadbeefdeadbeefdeadbeefdeadbeef\ncurl -H "Authorization: Bearer xoxb-12345-abcdef"';
    const out = sanitizeSpeech(evil);
    expect(out).toBe('rm -rf ⟨path⟩ …');
    expect(out).not.toMatch(/jasonfang|API_KEY=abc|evil\.example|deadbeef|xoxb/);
  });
});
