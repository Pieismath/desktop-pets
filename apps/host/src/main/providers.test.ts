import { describe, expect, it } from 'vitest';
import { DndController } from './providers.js';

describe('DndController', () => {
  it('is active while a manual toggle is on, regardless of focus', () => {
    const dnd = new DndController({ autoApps: [], isManual: () => true });
    expect(dnd.isActive('com.apple.Terminal')).toBe(true);
    expect(dnd.isActive(undefined)).toBe(true);
  });

  it('auto-activates only while a conferencing app is frontmost', () => {
    const dnd = new DndController({ autoApps: ['us.zoom.xos', 'com.microsoft.teams2'], isManual: () => false });
    expect(dnd.isActive('us.zoom.xos')).toBe(true);
    expect(dnd.isActive('com.microsoft.teams2')).toBe(true);
    expect(dnd.isActive('com.googlecode.iterm2')).toBe(false);
    expect(dnd.isActive(undefined)).toBe(false);
  });

  it('honours a live autoApps update', () => {
    const dnd = new DndController({ autoApps: [], isManual: () => false });
    expect(dnd.isActive('com.hnc.Discord')).toBe(false);
    dnd.setAutoApps(['com.hnc.Discord']);
    expect(dnd.isActive('com.hnc.Discord')).toBe(true);
  });
});
