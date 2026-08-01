/**
 * The characters that ship with the app. Both are original pixel art drawn
 * in code and released CC0 — the format is identical to anything you make
 * yourself, so a bundled pet has no special status beyond being installed.
 */
import type { PetManifest } from '@desktop-pets/shared';
import { CAT } from './char-cat.js';
import { EMBER } from './char-ember.js';
import type { PixelCharacter } from './pixel.js';

const GENERATOR = 'procedural pixel art, @desktop-pets/create-pet (drawn in code by Claude, Anthropic)';

export interface BundledPet {
  character: PixelCharacter;
  manifest: PetManifest;
  /** The one the app picks when nothing else is chosen. */
  isDefault?: boolean;
}

export const MOCHI_MANIFEST: PetManifest = {
  id: 'mochi',
  displayName: 'Mochi',
  description: 'A ginger tabby who sits on your Dock and keeps an eye on what your agents are about to run.',
  spritesheet: 'spritesheet.webp',
  license: 'CC0-1.0',
  author: 'Desktop Pets contributors',
  generator: GENERATOR,
};

export const EMBER_MANIFEST: PetManifest = {
  id: 'ember',
  displayName: 'Ember',
  description: 'A small fox-ish critter with a bushy tail.',
  spritesheet: 'spritesheet.webp',
  license: 'CC0-1.0',
  author: 'Desktop Pets contributors',
  generator: GENERATOR,
};

export const BUNDLED_PETS: BundledPet[] = [
  { character: CAT, manifest: MOCHI_MANIFEST, isDefault: true },
  { character: EMBER, manifest: EMBER_MANIFEST },
];
