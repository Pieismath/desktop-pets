import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { PET_ID_PATTERN, SPRITE_SHEET, validatePetManifest } from '@desktop-pets/shared';
import type { PetManifest } from '@desktop-pets/shared';
import { assertSheetGeometry } from './sheet.js';
import { composeSheetFromImage } from './from-image.js';
import { validatePetDir } from './validate.js';

export interface CliIO {
  log: (msg: string) => void;
  error: (msg: string) => void;
  /** Prompt for a value; undefined when non-interactive (no TTY). */
  prompt?: (question: string) => Promise<string>;
}

type Flags = Record<string, string | boolean>;

export function parseArgs(argv: string[]): { cmd: string | undefined; positionals: string[]; flags: Flags } {
  const [cmd, ...rest] = argv;
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { cmd, positionals, flags };
}

async function resolveField(
  name: string,
  flags: Flags,
  io: CliIO,
  { required, question }: { required: boolean; question: string },
): Promise<string | undefined> {
  const fromFlag = typeof flags[name] === 'string' ? (flags[name] as string).trim() : '';
  if (fromFlag) return fromFlag;
  if (io.prompt) {
    const answer = (await io.prompt(question)).trim();
    if (answer) return answer;
  }
  if (required) {
    io.error(`missing required --${name}${io.prompt ? '' : ' (and no TTY to prompt)'}`);
  }
  return undefined;
}

async function collectManifest(flags: Flags, io: CliIO): Promise<PetManifest | undefined> {
  const id = await resolveField('id', flags, io, { required: true, question: 'Pet id (kebab-case): ' });
  const displayName = await resolveField('name', flags, io, { required: true, question: 'Display name: ' });
  const description = await resolveField('description', flags, io, { required: false, question: 'Description: ' });
  // Provenance is mandatory — refuse to emit a pet without it (brief §2).
  const license = await resolveField('license', flags, io, { required: true, question: 'License (SPDX id, REQUIRED): ' });
  const author = await resolveField('author', flags, io, { required: true, question: 'Author (REQUIRED): ' });
  const authorUrl = await resolveField('author-url', flags, io, { required: false, question: 'Author URL (optional): ' });
  const generator = await resolveField('generator', flags, io, { required: false, question: 'Generator/tool used (optional): ' });

  if (!id || !displayName || !license || !author) {
    io.error('refusing to create a pet without id, name, license, and author.');
    return undefined;
  }

  const manifest: PetManifest = {
    id,
    displayName,
    description: description ?? displayName,
    spritesheet: 'spritesheet.webp',
    license,
    author,
    ...(authorUrl ? { authorUrl } : {}),
    ...(generator ? { generator } : {}),
  };

  const res = validatePetManifest(manifest);
  if (!res.ok) {
    io.error('invalid manifest:');
    for (const e of res.errors) io.error(`  - ${e}`);
    return undefined;
  }
  return res.pet;
}

function writePet(outDir: string, manifest: PetManifest, sheet: Buffer, io: CliIO): void {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'spritesheet.webp'), sheet);
  fs.writeFileSync(path.join(outDir, 'pet.json'), JSON.stringify(manifest, null, 2) + '\n');
  io.log(`✓ wrote ${path.join(outDir, 'pet.json')}`);
  io.log(`✓ wrote ${path.join(outDir, 'spritesheet.webp')} (${(sheet.byteLength / 1024).toFixed(1)} KiB)`);
  io.log(`  ${manifest.displayName} — ${manifest.license} by ${manifest.author}`);
}

const USAGE = `create-pet — build a conformant desktop-pets pet

Usage:
  create-pet from-image <image> --id <id> --name <name> --license <SPDX> --author <author> [--out <dir>] [--description <text>] [--author-url <url>] [--generator <tool>]
  create-pet from-sheet <sheet.webp> --id <id> --name <name> --license <SPDX> --author <author> [--out <dir>] ...
  create-pet validate <pet-dir>

Notes:
  - license and author are REQUIRED; the tool refuses to emit a pet without them.
  - the spritesheet must be the locked ${SPRITE_SHEET.columns}×${SPRITE_SHEET.rows} grid of ${SPRITE_SHEET.frameWidth}×${SPRITE_SHEET.frameHeight} frames.
  - id must match ${PET_ID_PATTERN.source}.`;

export async function runCli(argv: string[], io: CliIO): Promise<number> {
  const { cmd, positionals, flags } = parseArgs(argv);

  if (!cmd || cmd === 'help' || flags['help']) {
    io.log(USAGE);
    return cmd ? 0 : 1;
  }

  if (cmd === 'validate') {
    const dir = positionals[0];
    if (!dir) {
      io.error('usage: create-pet validate <pet-dir>');
      return 2;
    }
    const res = validatePetDir(dir);
    for (const w of res.warnings) io.log(`warning: ${w}`);
    if (res.ok) {
      io.log(`✓ valid pet: ${res.pet?.displayName} (${res.pet?.id}) — ${res.pet?.license} by ${res.pet?.author}`);
      return 0;
    }
    io.error('✗ invalid pet:');
    for (const e of res.errors) io.error(`  - ${e}`);
    return 1;
  }

  if (cmd === 'from-image' || cmd === 'from-sheet') {
    const src = positionals[0];
    if (!src) {
      io.error(`usage: create-pet ${cmd} <${cmd === 'from-image' ? 'image' : 'sheet.webp'}> --id ... --license ... --author ...`);
      return 2;
    }
    if (!fs.existsSync(src)) {
      io.error(`input not found: ${src}`);
      return 2;
    }

    const manifest = await collectManifest(flags, io);
    if (!manifest) return 1;

    let sheet: Buffer;
    try {
      if (cmd === 'from-image') {
        io.log('composing 80 frames from your image…');
        sheet = await composeSheetFromImage(src);
      } else {
        sheet = fs.readFileSync(src);
      }
      // Geometry is validated for BOTH paths — a hand-made sheet that isn't the
      // locked grid is rejected before anything is written.
      await assertSheetGeometry(sheet);
    } catch (err) {
      io.error(`could not produce a conformant spritesheet: ${(err as Error).message}`);
      return 1;
    }

    const outDir = typeof flags['out'] === 'string' ? (flags['out'] as string) : path.join(process.cwd(), manifest.id);
    writePet(outDir, manifest, sheet, io);

    // Final belt-and-braces: re-validate what we just wrote.
    const check = validatePetDir(outDir);
    if (!check.ok) {
      io.error('post-write validation failed:');
      for (const e of check.errors) io.error(`  - ${e}`);
      return 1;
    }
    io.log('✓ validated on disk — ready to install');
    return 0;
  }

  io.error(`unknown command: ${cmd}\n\n${USAGE}`);
  return 2;
}

/** Build a CliIO that prompts on a TTY and stays non-interactive otherwise. */
export function stdioCliIO(): CliIO {
  const io: CliIO = {
    log: (m) => console.log(m),
    error: (m) => console.error(m),
  };
  if (process.stdin.isTTY && process.stdout.isTTY) {
    io.prompt = (question: string) =>
      new Promise<string>((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => {
          rl.close();
          resolve(answer);
        });
      });
  }
  return io;
}
