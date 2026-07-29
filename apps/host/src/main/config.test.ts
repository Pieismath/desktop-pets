import { describe, expect, it } from 'vitest';
import { DEFAULT_HOST_CONFIG, mergeConfig } from './config.js';

describe('mergeConfig', () => {
  it('returns defaults for an empty object', () => {
    expect(mergeConfig({})).toEqual(DEFAULT_HOST_CONFIG);
  });

  it('accepts valid overrides', () => {
    const c = mergeConfig({ escalation: { notifyIdleSec: 30, digestIdleSec: 90 } });
    expect(c.escalation).toEqual({ notifyIdleSec: 30, digestIdleSec: 90 });
  });

  it('clamps the digest threshold to at least the notify threshold', () => {
    const c = mergeConfig({ escalation: { notifyIdleSec: 300, digestIdleSec: 60 } });
    expect(c.escalation.digestIdleSec).toBe(300);
  });

  it('rejects negative/NaN thresholds, falling back to defaults', () => {
    const c = mergeConfig({ escalation: { notifyIdleSec: -5, digestIdleSec: Number.NaN } });
    expect(c.escalation).toEqual(DEFAULT_HOST_CONFIG.escalation);
  });

  it('sanitises autoApps and reactionMap types', () => {
    const c = mergeConfig({
      dnd: { autoApps: ['us.zoom.xos', 42 as unknown as string] },
      reactionMap: ['bad'] as unknown as Record<string, string>,
    });
    expect(c.dnd.autoApps).toEqual(['us.zoom.xos']);
    expect(c.reactionMap).toEqual({});
  });
});
