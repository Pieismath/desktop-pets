import { describe, expect, it } from 'vitest';
import {
  EVENT_SPECS,
  installIntoSettings,
  statusOfSettings,
  uninstallFromSettings,
  type SettingsObject,
} from './settings.js';

const RUNNER = '/repo/packages/hooks/dist/hook-runner.js';
const NODE = '/usr/local/bin/node';

describe('hook settings install/uninstall', () => {
  it('installs every event spec into empty settings', () => {
    const { next, added } = installIntoSettings({}, RUNNER, NODE);
    expect(added).toHaveLength(EVENT_SPECS.length);
    expect(Object.keys(next.hooks ?? {})).toEqual(EVENT_SPECS.map((s) => s.event));
    const pre = next.hooks?.['PreToolUse']?.[0];
    expect(pre?.matcher).toBe('*');
    expect(pre?.hooks[0]).toMatchObject({ type: 'command', command: NODE, args: [RUNNER, 'PreToolUse'] });
    // decision events synchronous, telemetry async
    expect(pre?.hooks[0]?.async).toBeUndefined();
    expect(next.hooks?.['PostToolUse']?.[0]?.hooks[0]?.async).toBe(true);
    expect(next.hooks?.['UserPromptSubmit']?.[0]?.matcher).toBeUndefined();
  });

  it('is idempotent', () => {
    const first = installIntoSettings({}, RUNNER, NODE);
    const second = installIntoSettings(first.next, RUNNER, NODE);
    expect(second.added).toHaveLength(0);
    expect(second.updated).toHaveLength(0);
    expect(second.next).toEqual(first.next);
  });

  it('updates in place when the runner path moves', () => {
    const first = installIntoSettings({}, RUNNER, NODE);
    const second = installIntoSettings(first.next, '/new/place/hook-runner.js', NODE);
    expect(second.added).toHaveLength(0);
    expect(second.updated).toHaveLength(EVENT_SPECS.length);
    expect(second.next.hooks?.['Stop']?.[0]?.hooks[0]?.args?.[0]).toBe('/new/place/hook-runner.js');
    // still exactly one entry per event
    expect(second.next.hooks?.['Stop']?.[0]?.hooks).toHaveLength(1);
  });

  it('preserves foreign hooks on install AND uninstall', () => {
    const settings: SettingsObject = {
      permissions: { allow: ['Bash(ls:*)'] },
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'my-guard.sh', timeout: 5 }] },
        ],
        Stop: [{ hooks: [{ type: 'command', command: 'notify-send done' }] }],
      },
    };
    const installed = installIntoSettings(settings, RUNNER, NODE).next;
    expect(installed.hooks?.['PreToolUse']?.[0]?.hooks[0]?.command).toBe('my-guard.sh');
    expect(installed['permissions']).toEqual({ allow: ['Bash(ls:*)'] });

    const { next, removed } = uninstallFromSettings(installed);
    expect(removed).toBe(EVENT_SPECS.length);
    expect(next.hooks?.['PreToolUse']?.[0]?.hooks[0]?.command).toBe('my-guard.sh');
    expect(next.hooks?.['Stop']?.[0]?.hooks[0]?.command).toBe('notify-send done');
    expect(next['permissions']).toEqual({ allow: ['Bash(ls:*)'] });
    // our matcher-groups and event keys are pruned when emptied
    expect(next.hooks?.['PermissionRequest']).toBeUndefined();
    expect(next.hooks?.['SessionEnd']).toBeUndefined();
  });

  it('uninstall on pristine settings is a no-op', () => {
    const { next, removed } = uninstallFromSettings({ theme: 'dark' });
    expect(removed).toBe(0);
    expect(next).toEqual({ theme: 'dark' });
  });

  it('status reports installed events', () => {
    expect(statusOfSettings({})).toEqual([]);
    const { next } = installIntoSettings({}, RUNNER, NODE);
    expect(statusOfSettings(next)).toHaveLength(EVENT_SPECS.length);
  });
});
