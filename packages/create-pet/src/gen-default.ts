#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDefaultPet } from './default-pet.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const outDir = process.argv[2] ?? path.join(repoRoot, 'pets', 'default');

generateDefaultPet(outDir)
  .then(({ sheetBytes }) => {
    console.log(`wrote ${outDir}/spritesheet.webp (${(sheetBytes / 1024).toFixed(1)} KiB) + pet.json`);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
