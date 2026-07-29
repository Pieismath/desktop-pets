import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import { SPRITE_SHEET, readWebpSize, userPetsDir, validatePetManifest } from '@desktop-pets/shared';
import type { PetManifest } from '@desktop-pets/shared';

export interface LoadedPet {
  pet: PetManifest;
  dir: string;
  sheetPath: string;
  sheetUrl: string;
}

export interface PetLoadError {
  dir: string;
  errors: string[];
}

/** Pets bundled with the app (repo `pets/` in dev). */
export function bundledPetsDir(): string {
  return path.resolve(app.getAppPath(), '..', '..', 'pets');
}

/**
 * Load and fully validate one pet directory. Provenance is enforced here:
 * a pet whose manifest lacks `license` or `author` never loads.
 */
export function loadPetFromDir(dir: string): LoadedPet | PetLoadError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(dir, 'pet.json'), 'utf8'));
  } catch (err) {
    return { dir, errors: [`cannot read pet.json: ${(err as Error).message}`] };
  }
  const res = validatePetManifest(parsed);
  if (!res.ok) return { dir, errors: res.errors };
  for (const w of res.warnings) console.warn(`[pets] ${dir}: ${w}`);

  const sheetPath = path.join(dir, res.pet.spritesheet);
  let sheet: Buffer;
  try {
    sheet = fs.readFileSync(sheetPath);
  } catch {
    return { dir, errors: [`spritesheet ${res.pet.spritesheet} not found`] };
  }
  const dims = readWebpSize(sheet);
  if (!dims) return { dir, errors: ['spritesheet is not a readable WebP file'] };
  if (dims.width !== SPRITE_SHEET.width || dims.height !== SPRITE_SHEET.height) {
    return {
      dir,
      errors: [
        `spritesheet must be ${SPRITE_SHEET.width}x${SPRITE_SHEET.height} (8 cols x 10 rows of 192x208), got ${dims.width}x${dims.height}`,
      ],
    };
  }
  return { pet: res.pet, dir, sheetPath, sheetUrl: pathToFileURL(sheetPath).href };
}

export function discoverPets(): { pets: LoadedPet[]; failures: PetLoadError[] } {
  const pets: LoadedPet[] = [];
  const failures: PetLoadError[] = [];
  const seen = new Set<string>();
  for (const root of [userPetsDir(), bundledPetsDir()]) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of entries) {
      const dir = path.join(root, name);
      if (!fs.existsSync(path.join(dir, 'pet.json'))) continue;
      const res = loadPetFromDir(dir);
      if ('errors' in res) {
        failures.push(res);
      } else if (!seen.has(res.pet.id)) {
        seen.add(res.pet.id);
        pets.push(res);
      }
    }
  }
  return { pets, failures };
}

/** Preferred pet if valid, else the bundled default, else the first valid pet. */
export function resolveActivePet(preferredId: string | undefined): LoadedPet {
  const { pets, failures } = discoverPets();
  for (const f of failures) {
    console.warn(`[pets] rejected ${f.dir}:\n  - ${f.errors.join('\n  - ')}`);
  }
  const found =
    (preferredId && pets.find((p) => p.pet.id === preferredId)) ||
    pets.find((p) => p.pet.id === 'ember') ||
    pets.find((p) => p.pet.id === 'pip') ||
    pets[0];
  if (!found) {
    throw new Error(
      `no valid pets found (looked in ${userPetsDir()} and ${bundledPetsDir()}); run "pnpm gen:pet" to create the default`,
    );
  }
  return found;
}
