import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ESCALATION,
  agentBundleId,
  computeTier,
  tierFiresNotification,
  tierQueuesDigest,
  tierShowsBubble,
} from './escalation.js';

const base = {
  idleSeconds: 0,
  focusedBundleId: 'com.googlecode.iterm2',
  agentBundleId: 'com.googlecode.iterm2',
  dnd: false,
  thresholds: DEFAULT_ESCALATION,
};

describe('computeTier — the ladder', () => {
  it('silent animation when at machine and the agent app is focused', () => {
    expect(computeTier(base)).toBe('animate');
  });

  it('speech bubble when at machine and another app is focused', () => {
    expect(computeTier({ ...base, focusedBundleId: 'com.tinyspeck.slackmacgap' })).toBe('bubble');
  });

  it('OS notification when idle past the notify threshold', () => {
    expect(computeTier({ ...base, idleSeconds: 121 })).toBe('notify');
    expect(computeTier({ ...base, idleSeconds: 119 })).toBe('animate');
  });

  it('notification + digest when idle past the digest threshold', () => {
    expect(computeTier({ ...base, idleSeconds: 601 })).toBe('digest');
    expect(computeTier({ ...base, idleSeconds: 600 })).toBe('digest');
    expect(computeTier({ ...base, idleSeconds: 599 })).toBe('notify');
  });

  it('DND silences everything below alarm, even when idle', () => {
    expect(computeTier({ ...base, dnd: true })).toBe('silent');
    expect(computeTier({ ...base, dnd: true, idleSeconds: 99999 })).toBe('silent');
    expect(computeTier({ ...base, dnd: true, focusedBundleId: 'other' })).toBe('silent');
  });

  it('bubbles (not animate) when the agent app is unknown', () => {
    expect(computeTier({ ...base, agentBundleId: undefined })).toBe('bubble');
    expect(computeTier({ ...base, focusedBundleId: undefined })).toBe('bubble');
  });

  it('respects custom thresholds', () => {
    const thresholds = { notifyIdleSec: 30, digestIdleSec: 60 };
    expect(computeTier({ ...base, idleSeconds: 31, thresholds })).toBe('notify');
    expect(computeTier({ ...base, idleSeconds: 61, thresholds })).toBe('digest');
  });
});

describe('tier capabilities', () => {
  it('gates bubble/notify/digest correctly', () => {
    expect(tierShowsBubble('silent')).toBe(false);
    expect(tierShowsBubble('animate')).toBe(false);
    expect(tierShowsBubble('bubble')).toBe(true);
    expect(tierShowsBubble('notify')).toBe(true);
    expect(tierFiresNotification('bubble')).toBe(false);
    expect(tierFiresNotification('notify')).toBe(true);
    expect(tierQueuesDigest('notify')).toBe(false);
    expect(tierQueuesDigest('digest')).toBe(true);
  });
});

describe('agentBundleId', () => {
  it('prefers an explicit bundle id', () => {
    expect(agentBundleId({ bundleId: 'com.x', termProgram: 'iTerm.app' })).toBe('com.x');
  });
  it('falls back to a known TERM_PROGRAM mapping', () => {
    expect(agentBundleId({ termProgram: 'iTerm.app' })).toBe('com.googlecode.iterm2');
    expect(agentBundleId({ termProgram: 'Apple_Terminal' })).toBe('com.apple.Terminal');
  });
  it('returns undefined for unknown terminals', () => {
    expect(agentBundleId({ termProgram: 'MysteryTerm' })).toBeUndefined();
    expect(agentBundleId({})).toBeUndefined();
  });
});
