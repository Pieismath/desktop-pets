import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPILED_RISK,
  analyseRm,
  classifyToolCall,
  compileRiskConfig,
  effectiveTokens,
  splitCommand,
} from './risk.js';

const bash = (command: string) => classifyToolCall({ toolName: 'Bash', toolInput: { command } });
const write = (file_path: string, tool = 'Write') => classifyToolCall({ toolName: tool, toolInput: { file_path } });

describe('splitCommand', () => {
  it('splits on separators outside quotes only', () => {
    expect(splitCommand('a && b; c | d').map((s) => s.raw)).toEqual(['a', 'b', 'c', 'd']);
    expect(splitCommand('echo "a; rm -rf /" && ls').map((s) => s.raw)).toEqual(['echo "a; rm -rf /"', 'ls']);
    expect(splitCommand("echo 'x | y'")).toHaveLength(1);
  });

  it('tokenises with quotes stripped', () => {
    expect(splitCommand('rm -rf "my dir"')[0]?.tokens).toEqual(['rm', '-rf', 'my dir']);
  });
});

describe('effectiveTokens', () => {
  it('unwraps sudo, env assignments and wrappers', () => {
    expect(effectiveTokens(['sudo', 'rm', '-rf', '/'])).toMatchObject({ cmd: 'rm', sudo: true });
    expect(effectiveTokens(['env', 'FOO=1', 'rm', '-rf', 'x'])).toMatchObject({ cmd: 'rm' });
    expect(effectiveTokens(['FOO=1', 'BAR=2', 'node', 'x.js'])).toMatchObject({ cmd: 'node' });
    expect(effectiveTokens(['xargs', 'rm', '-rf'])).toMatchObject({ cmd: 'rm' });
    expect(effectiveTokens(['/usr/bin/rm', '-rf', 'x'])).toMatchObject({ cmd: 'rm' });
  });
});

describe('risk classifier — MUST FIRE (dangerous)', () => {
  const dangerous: Array<[string, string]> = [
    ['rm -rf /tmp/important', 'rm-recursive-force'],
    ['rm -fr src', 'rm-recursive-force'],
    ['rm -r -f .', 'rm-recursive-force'],
    ['rm --recursive --force data', 'rm-recursive-force'],
    ['sudo rm -rf /', 'rm-recursive-force'],
    ['cd /app && rm -rf uploads', 'rm-recursive-force'],
    ['rm -rf', 'rm-recursive-force'],
    ['bash -c "rm -rf ~/things"', 'rm-recursive-force'],
    ['sudo apt-get install nginx', 'sudo'],
    ['git push --force', 'git-push-force'],
    ['git push -f origin main', 'git-push-force'],
    ['git reset --hard HEAD~3', 'git-reset-hard'],
    ['git clean -fd', 'git-clean-force'],
    ['psql -c "DROP TABLE users;"', 'sql-drop'],
    ['mysql -e "DROP DATABASE prod"', 'sql-drop'],
    ['sqlite3 app.db "TRUNCATE TABLE logs"', 'sql-drop'],
    ['kubectl delete pod web-1', 'kubectl-delete'],
    ['kubectl drain node-3', 'kubectl-delete'],
    ['terraform destroy -auto-approve', 'terraform-destroy'],
    ['dd if=image.iso of=/dev/disk2', 'dd-device'],
    ['mkfs.ext4 /dev/sdb1', 'mkfs'],
    ['dropdb production', 'db-wipe'],
    ['redis-cli FLUSHALL', 'db-wipe'],
    ['aws s3 rb s3://my-bucket', 'aws-s3-destroy'],
    ['aws s3 rm s3://bucket/prefix --recursive', 'aws-s3-destroy'],
    ['chmod -R 777 /var/www', 'chmod-world-root'],
    ['shutdown -h now', 'host-power'],
  ];
  for (const [cmd, rule] of dangerous) {
    it(`fires ${rule} on: ${cmd}`, () => {
      const v = bash(cmd);
      expect(v.level).toBe('alarm');
      expect(v.ruleId).toBe(rule);
    });
  }

  const dangerousWrites: Array<[string, string, string]> = [
    ['/app/.env', 'Write', 'env-file-write'],
    ['/app/.env.production', 'Edit', 'env-file-write'],
    ['/home/x/config/credentials.yml', 'Write', 'credentials-write'],
    ['/app/secrets.json', 'Write', 'credentials-write'],
    ['/Users/x/.ssh/id_rsa', 'Write', 'private-key-write'],
    ['/srv/certs/server.pem', 'Edit', 'private-key-write'],
    ['/app/config/production.yaml', 'Write', 'prod-config-write'],
    ['/infra/prod.tfvars', 'Write', 'prod-config-write'],
  ];
  for (const [file, tool, rule] of dangerousWrites) {
    it(`fires ${rule} on ${tool} ${file}`, () => {
      const v = write(file, tool);
      expect(v.level).toBe('alarm');
      expect(v.ruleId).toBe(rule);
    });
  }
});

describe('risk classifier — MUST STAY SILENT (ordinary)', () => {
  const ordinary: string[] = [
    'ls -la',
    'cat README.md',
    'npm test',
    'pnpm vitest run',
    'git status',
    'git push',
    'git push origin main',
    'git push --force-with-lease',
    'git reset HEAD~1',
    'git reset --soft HEAD~1',
    'rm file.txt',
    'rm -f single.txt',
    'rm -r some-dir',
    'rm -rf node_modules',
    'rm -rf node_modules dist',
    'rm -rf ./dist/',
    'rm -rf packages/app/node_modules/.cache',
    'echo "rm -rf /"',
    'echo "please do not DROP TABLE users"',
    'grep -r "DROP TABLE" migrations/',
    'grep "git push --force" docs.md',
    'cat .env',
    'find . -name "*.pem"',
    'npx kubectl-doctor',
    'terraform plan',
    'aws s3 ls s3://bucket',
    'aws s3 cp file s3://bucket/file',
    'chmod 644 config.json',
    'dd if=/dev/zero of=./disk.img bs=1m count=10',
    'echo done && npm run build',
    'git commit -m "fix: rm -rf handling"',
  ];
  for (const cmd of ordinary) {
    it(`silent on: ${cmd}`, () => {
      expect(bash(cmd).level).toBe('none');
    });
  }

  const ordinaryWrites: Array<[string, string]> = [
    ['/app/.env.example', 'Write'],
    ['/app/.env.sample', 'Edit'],
    ['/app/src/main.ts', 'Write'],
    ['/app/product.json', 'Write'],
    ['/app/docs/introduction.md', 'Write'],
    ['/app/id_rsa.pub', 'Write'],
    ['/app/keymap.json', 'Write'],
  ];
  for (const [file, tool] of ordinaryWrites) {
    it(`silent on ${tool} ${file}`, () => {
      expect(write(file, tool).level).toBe('none');
    });
  }

  it('silent on read-only tools regardless of content', () => {
    expect(classifyToolCall({ toolName: 'Read', toolInput: { file_path: '/app/.env' } }).level).toBe('none');
    expect(classifyToolCall({ toolName: 'Grep', toolInput: { pattern: 'DROP TABLE' } }).level).toBe('none');
  });

  it('silent on empty/malformed input', () => {
    expect(classifyToolCall({ toolName: 'Bash', toolInput: {} }).level).toBe('none');
    expect(classifyToolCall({ toolName: 'Bash', toolInput: undefined }).level).toBe('none');
    expect(classifyToolCall({ toolName: 'Write', toolInput: {} }).level).toBe('none');
  });
});

describe('analyseRm safelist', () => {
  const safelist = DEFAULT_COMPILED_RISK.safelist;
  const seg = (cmd: string) => splitCommand(cmd)[0]!;
  it('suppresses junk-dir deletes but not mixed targets', () => {
    expect(analyseRm(seg('rm -rf node_modules'), safelist)).toBe(false);
    expect(analyseRm(seg('rm -rf node_modules src'), safelist)).toBe(true);
    expect(analyseRm(seg('rm -rf ~'), safelist)).toBe(true);
    expect(analyseRm(seg('rm -rf /'), safelist)).toBe(true);
  });
});

describe('user config compilation', () => {
  it('compiles custom rules and reports bad regexes without dying', () => {
    const compiled = compileRiskConfig({
      version: 1,
      safelistPaths: ['junk'],
      rules: [
        { id: 'custom', reason: 'no publishing', match: { command: '\\bnpm\\s+publish\\b' } },
        { id: 'broken', reason: 'bad', match: { command: '(' } },
        { id: 'off', reason: 'disabled', enabled: false, match: { command: 'whatever' } },
      ],
    });
    expect(compiled.errors).toHaveLength(1);
    expect(compiled.rules.map((r) => r.id)).toEqual(['custom']);
    const v = classifyToolCall({ toolName: 'Bash', toolInput: { command: 'cd pkg && npm publish' } }, compiled);
    expect(v).toMatchObject({ level: 'alarm', ruleId: 'custom' });
    expect(classifyToolCall({ toolName: 'Bash', toolInput: { command: 'echo "npm publish"' } }, compiled).level).toBe('none');
    expect(classifyToolCall({ toolName: 'Bash', toolInput: { command: 'rm -rf junk' } }, compiled).level).toBe('none');
  });
});
