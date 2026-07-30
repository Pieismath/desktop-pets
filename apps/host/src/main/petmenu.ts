import type { PetManifest } from '@desktop-pets/shared';

export interface PetMenuEntry {
  id: string;
  /** What the menu row reads, e.g. "Ember — CC0-1.0 by …". */
  label: string;
  checked: boolean;
  /** Longer provenance line for the tooltip. */
  tooltip: string;
}

export interface PetChoice {
  pet: PetManifest;
  /** True for pets that ship with the app rather than user-installed ones. */
  bundled?: boolean;
}

/**
 * Build the "Character" menu. Provenance is surfaced right in the picker —
 * if a pet is installed, you can see who made it and under what licence
 * without opening a file.
 */
export function petMenuEntries(choices: PetChoice[], activeId: string | undefined): PetMenuEntry[] {
  const sorted = [...choices].sort((a, b) => {
    if (!!a.bundled !== !!b.bundled) return a.bundled ? -1 : 1;
    return a.pet.displayName.localeCompare(b.pet.displayName);
  });
  return sorted.map((c) => ({
    id: c.pet.id,
    label: c.pet.displayName,
    checked: c.pet.id === activeId,
    tooltip: `${c.pet.displayName} — ${c.pet.license} by ${c.pet.author}${c.bundled ? ' (bundled)' : ''}`,
  }));
}
