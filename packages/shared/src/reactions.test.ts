import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REACTION_MAP,
  REACTIONS,
  SPRITE_STATE_NAMES,
  resolveReactionMap,
} from './reactions.js';

describe('reaction vocabulary', () => {
  it('has the 12 reactions and 10 sprite states the format locks in', () => {
    expect(REACTIONS).toHaveLength(12);
    expect(SPRITE_STATE_NAMES).toHaveLength(10);
  });

  it('maps every reaction to a real sprite state', () => {
    for (const reaction of REACTIONS) {
      expect(SPRITE_STATE_NAMES).toContain(DEFAULT_REACTION_MAP[reaction]);
    }
  });

  it('applies valid overrides and reports invalid ones without applying them', () => {
    const { map, issues } = resolveReactionMap({
      testing: 'jumping',
      bogus: 'idle',
      success: 'not-a-row',
    });
    expect(map.testing).toBe('jumping');
    expect(map.success).toBe(DEFAULT_REACTION_MAP.success);
    expect(issues).toEqual([
      { reaction: 'bogus', target: 'idle', problem: 'unknown-reaction' },
      { reaction: 'success', target: 'not-a-row', problem: 'unknown-sprite-state' },
    ]);
  });
});
