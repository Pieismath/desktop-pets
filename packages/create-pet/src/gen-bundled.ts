#!/usr/bin/env node
/** Regenerate every bundled pet into `pets/<id>/`. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLED_PETS } from './bundled-pets.js';
import { generatePixelPet } from './pixelpet.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const petsRoot = process.argv[2] ?? path.join(repoRoot, 'pets');

async function main(): Promise<void> {
  for (const { character, manifest, isDefault } of BUNDLED_PETS) {
    const outDir = path.join(petsRoot, manifest.id);
    const { sheetBytes } = await generatePixelPet(character, manifest, outDir);
    console.log(
      `wrote ${outDir} (${(sheetBytes / 1024).toFixed(1)} KiB)` +
        ` · ${manifest.displayName}, ${manifest.license} by ${manifest.author}${isDefault ? ' [default]' : ''}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
