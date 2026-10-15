import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { PET_ID_PATTERN, SPRITE_SHEET, userPetsDir, validatePetManifest } from '@desktop-pets/shared';
import type { PetManifest } from '@desktop-pets/shared';
import { assertSheetGeometry } from './sheet.js';
import { composeSheetFromImage } from './from-image.js';
import { buildCharacter } from './char-generated.js';
import { composePixelSheet, composeSheetFromCanvas } from './pixelpet.js';
import { conceptCount, findConcept, type ConceptHit } from './pictograph.js';
import { drawPictograph, type PictographArt } from './from-pictograph.js';
import {
  AiError,
  DEFAULT_AI_MODEL,
  planWithAi,
  renderDrawing,
  resolveApiKey,
  type PetPlan,
} from './ai.js';
import {
  coatLabel,
  featureLabels,
  idFromPrompt,
  KNOWN_SPECIES,
  nameFromPrompt,
  traitsFromPrompt,
  unusedWords,
} from './traits.js';
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

async function collectManifest(
  flags: Flags,
  io: CliIO,
  defaults: { id?: string; name?: string; description?: string } = {},
): Promise<PetManifest | undefined> {
  const id =
    (await resolveField('id', flags, io, { required: !defaults.id, question: 'Pet id (kebab-case): ' })) ?? defaults.id;
  const displayName =
    (await resolveField('name', flags, io, { required: !defaults.name, question: 'Display name: ' })) ?? defaults.name;
  const description =
    (await resolveField('description', flags, io, { required: false, question: 'Description: ' })) ??
    defaults.description;
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
  io.log(`  ${manifest.displayName} · ${manifest.license} by ${manifest.author}`);
}

/**
 * `--install` puts the pet straight where the app looks for it, so it appears
 * in the menu-bar picker without any copying by hand.
 */
function resolveOutDir(flags: Flags, id: string): string {
  if (flags['install'] === true) return path.join(userPetsDir(), id);
  if (typeof flags['out'] === 'string') return flags['out'] as string;
  return path.join(process.cwd(), id);
}

const USAGE = `create-pet: build a conformant desktop-pets pet

Usage:
  create-pet from-prompt "<description>" --license <SPDX> --author <author> [--install | --out <dir>] [--id <id>] [--name <name>] [--ai]
  create-pet from-image <image> --id <id> --name <name> --license <SPDX> --author <author> [--install | --out <dir>] [--description <text>] [--author-url <url>] [--generator <tool>]
  create-pet from-sheet <sheet.webp> --id <id> --name <name> --license <SPDX> --author <author> [--install | --out <dir>] ...
  create-pet validate <pet-dir>

  --install  write straight into your pets folder so the app picks it up:
             ${userPetsDir()}

  --ai       have a model read the description instead of the built-in reader,
             so any wording works and any subject can be drawn. Needs YOUR OWN
             Anthropic key (ANTHROPIC_API_KEY or --api-key) and is billed to
             your account. Optional: --model <id> (default ${DEFAULT_AI_MODEL}).

Notes:
  - from-prompt draws the pet locally. No API key, no network, no cost.
  - a described creature or person is drawn from parts; a described *thing*
    (pizza, lobster, cactus) falls back to a pictograph from an emoji font on
    this machine. That artwork is the font's, not yours: fine for your own
    Dock, not something to publish. --emoji-font <name> picks a family to try.
  - --ai is the only thing here that talks to a network, and only when you ask.
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
      io.log(`✓ valid pet: ${res.pet?.displayName} (${res.pet?.id}) · ${res.pet?.license} by ${res.pet?.author}`);
      return 0;
    }
    io.error('✗ invalid pet:');
    for (const e of res.errors) io.error(`  - ${e}`);
    return 1;
  }

  if (cmd === 'from-prompt') {
    const prompt = positionals.join(' ').trim();
    if (!prompt) {
      io.error('usage: create-pet from-prompt "<description>" --license <SPDX> --author <you>');
      return 2;
    }

    io.log(`reading "${prompt}"`);

    // --ai hands the reading to a model on the caller's own account. Off by
    // default: without it nothing is sent anywhere.
    let plan: PetPlan | undefined;
    if (flags['ai'] === true || typeof flags['ai'] === 'string') {
      const apiKey = resolveApiKey(typeof flags['api-key'] === 'string' ? flags['api-key'] : undefined, process.env);
      if (!apiKey) {
        io.error('--ai needs an Anthropic API key of your own.');
        io.error('  export ANTHROPIC_API_KEY=sk-ant-… , or pass --api-key sk-ant-…');
        io.error('  Get one at https://console.anthropic.com/settings/keys — usage is billed to your account.');
        io.error('  Without --ai this command is free and runs entirely offline.');
        return 2;
      }
      const model = typeof flags['model'] === 'string' ? flags['model'] : DEFAULT_AI_MODEL;
      io.log(`  asking ${model} to design it (your key, your account)…`);
      try {
        plan = await planWithAi(prompt, { apiKey, model });
      } catch (err) {
        io.error(`  ! ${err instanceof AiError ? err.message : String(err)}`);
        io.error('  falling back to the offline reader.');
      }
      if (plan) {
        if (plan.reasoning) io.log(`  → ${plan.reasoning}`);
        io.log(`  → ${plan.mode === 'draw' ? 'drawing it directly' : 'built from parts'}`);
      }
    }

    const offline = traitsFromPrompt(prompt);
    const traits = plan?.traits ?? offline.traits;

    // Nothing in the creature or person vocabulary, but the prompt names a
    // thing we have a picture for. Drawing code per concept never terminates;
    // a picture per concept costs a line of data.
    let art: PictographArt | undefined;
    let concept: ConceptHit | undefined;
    if (!plan && offline.invented.includes('species')) {
      concept = findConcept(prompt);
      if (concept) {
        const font = typeof flags['emoji-font'] === 'string' ? flags['emoji-font'] : undefined;
        art = await drawPictograph(concept.glyph, font);
      }
    }

    if (art && concept) {
      io.log(`  → no creature there, but "${concept.term}" is something I have a picture of: ${concept.glyph}`);
      if (art.source === 'twemoji') {
        io.log(`  → drawn from bundled Twemoji artwork, then pixelated`);
        io.log(`  → artwork is ${art.licence}: publishable, as long as the attribution stays`);
      } else {
        io.log('  → Twemoji has no file for that one, so an emoji font on this machine drew it');
        // The renderer picks the font per character and never tells us which,
        // so on this path the licence genuinely cannot be determined.
        io.error("  ! that artwork is the font's, and which font drew it cannot be");
        io.error('    determined here, so its licence is unknown.');
        io.error('    Fine for your own Dock. Do not publish this pet as your own work.');
      }
    } else if (!plan) {
      if (offline.matched.length > 0) io.log(`  → understood: ${offline.matched.join(', ')}`);
      for (const a of offline.assumed) io.log(`  → assumed: ${a}`);
      io.log(`  → ${[coatLabel(traits), ...featureLabels(traits)].join(', ')}`);
      const ignored = offline.invented.includes('species') ? [] : unusedWords(prompt);
      if (ignored.length > 0) io.log(`  → ignored: ${ignored.join(', ')} (nothing I can draw from those)`);
      // An invented creature will not resemble the request, so say so plainly
      // rather than handing back a random pet as if it were the answer.
      if (offline.invented.includes('species')) {
        io.error(`  ! nothing I know how to draw in "${prompt}" — this pet is invented, not what you asked for.`);
        io.error(`    name a creature or a person and you will get it: ${KNOWN_SPECIES.slice(0, 12).join(', ')}, …`);
        io.error(`    (${KNOWN_SPECIES.length} shapes, plus everyday words for them: tiger, corgi, t-rex, barista)`);
        io.error(`    I also have pictures for ${conceptCount().total} words: pizza, lobster, cactus, rocket…`);
        io.error(`    or run again with --ai to have a model read it, using your own API key.`);
      }
    }

    const manifest = await collectManifest(flags, io, {
      id: idFromPrompt(prompt),
      name: plan?.name || nameFromPrompt(prompt),
      description: prompt,
    });
    if (!manifest) return 1;
    // The artwork is not the author's own. CC-BY requires the credit to travel
    // with the work, so it goes in the manifest rather than only on screen.
    if (art && !manifest.generator) {
      manifest.generator =
        art.source === 'twemoji'
          ? `create-pet pictograph · ${art.attribution}`
          : 'create-pet pictograph (emoji font artwork, licence unknown)';
    }

    let sheet: Buffer;
    try {
      io.log('drawing 80 frames…');
      if (art) sheet = await composeSheetFromCanvas(art.canvas);
      else if (plan?.mode === 'draw' && plan.drawing) sheet = await composeSheetFromCanvas(renderDrawing(plan.drawing));
      else sheet = await composePixelSheet(buildCharacter(manifest.id, traits));
      await assertSheetGeometry(sheet);
    } catch (err) {
      io.error(`could not draw this pet: ${(err as Error).message}`);
      return 1;
    }

    const outDir = resolveOutDir(flags, manifest.id);
    writePet(outDir, manifest, sheet, io);
    if (flags['install'] === true) {
      io.log('✓ installed. Pick it from the 🐾 menu bar icon under "Character"');
    }
    const check = validatePetDir(outDir);
    if (!check.ok) {
      io.error('post-write validation failed:');
      for (const e of check.errors) io.error(`  - ${e}`);
      return 1;
    }
    io.log('✓ validated on disk, ready to install');
    return 0;
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

    const outDir = resolveOutDir(flags, manifest.id);
    writePet(outDir, manifest, sheet, io);
    if (flags['install'] === true) {
      io.log('✓ installed. Pick it from the 🐾 menu bar icon under "Character"');
    }

    // Final belt-and-braces: re-validate what we just wrote.
    const check = validatePetDir(outDir);
    if (!check.ok) {
      io.error('post-write validation failed:');
      for (const e of check.errors) io.error(`  - ${e}`);
      return 1;
    }
    io.log('✓ validated on disk, ready to install');
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
