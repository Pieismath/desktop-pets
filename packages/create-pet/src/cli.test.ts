import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SPRITE_SHEET, readWebpSize, validatePetManifest } from '@desktop-pets/shared';
import { parseArgs, runCli, type CliIO } from './cli.js';

function fakeIO(answers: Record<string, string> = {}): CliIO & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIO & { out: string[]; err: string[] } = {
    out,
    err,
    log: (m) => out.push(m),
    error: (m) => err.push(m),
  };
  if (Object.keys(answers).length > 0) {
    io.prompt = (q) => Promise.resolve(answers[q] ?? '');
  }
  return io;
}

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'createpet-'));

async function makeCharacterPng(): Promise<string> {
  const dir = tmp();
  const p = path.join(dir, 'char.png');
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="50" fill="#c48"/></svg>',
  );
  await sharp(svg).png().toFile(p);
  return p;
}

describe('parseArgs', () => {
  it('separates command, positionals and flags', () => {
    const r = parseArgs(['from-image', 'a.png', '--id', 'x', '--verbose']);
    expect(r.cmd).toBe('from-image');
    expect(r.positionals).toEqual(['a.png']);
    expect(r.flags).toEqual({ id: 'x', verbose: true });
  });
});

describe('create-pet CLI — provenance is mandatory', () => {
  it('refuses from-image without a license (non-interactive)', async () => {
    const img = await makeCharacterPng();
    const io = fakeIO(); // no prompt → non-interactive
    const code = await runCli(['from-image', img, '--id', 'nolic', '--name', 'NoLic', '--author', 'Me'], io);
    expect(code).toBe(1);
    expect(io.err.join('\n')).toMatch(/license/i);
  });

  it('refuses from-image without an author', async () => {
    const img = await makeCharacterPng();
    const io = fakeIO();
    const code = await runCli(['from-image', img, '--id', 'noauth', '--name', 'NoAuth', '--license', 'MIT'], io);
    expect(code).toBe(1);
    expect(io.err.join('\n')).toMatch(/author/i);
  });

  it('can gather license/author via prompts when interactive', async () => {
    const img = await makeCharacterPng();
    const out = tmp();
    const io = fakeIO({
      'License (SPDX id, REQUIRED): ': 'CC-BY-4.0',
      'Author (REQUIRED): ': 'Prompted Author',
    });
    const code = await runCli(
      ['from-image', img, '--id', 'prompted', '--name', 'Prompted', '--out', out],
      io,
    );
    expect(code).toBe(0);
    const manifest = JSON.parse(readFileSync(path.join(out, 'pet.json'), 'utf8'));
    expect(manifest.license).toBe('CC-BY-4.0');
    expect(manifest.author).toBe('Prompted Author');
  }, 30000);
});

describe('create-pet CLI — from-image produces a conformant, self-validating pet', () => {
  it('writes an 8x10 sheet and a valid manifest', async () => {
    const img = await makeCharacterPng();
    const out = tmp();
    const io = fakeIO();
    const code = await runCli(
      ['from-image', img, '--id', 'blobby', '--name', 'Blobby', '--license', 'CC0-1.0', '--author', 'Tester', '--out', out],
      io,
    );
    expect(code).toBe(0);
    const sheet = readFileSync(path.join(out, 'spritesheet.webp'));
    expect(readWebpSize(sheet)).toEqual({ width: SPRITE_SHEET.width, height: SPRITE_SHEET.height });
    const manifest = JSON.parse(readFileSync(path.join(out, 'pet.json'), 'utf8'));
    expect(validatePetManifest(manifest).ok).toBe(true);
    expect(io.out.join('\n')).toMatch(/validated on disk/);
  }, 45000);
});

describe('create-pet CLI — geometry is enforced', () => {
  it('rejects a from-sheet input that is not the locked grid', async () => {
    const dir = tmp();
    const badSheet = path.join(dir, 'bad.webp');
    await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .webp()
      .toFile(badSheet);
    const io = fakeIO();
    const code = await runCli(
      ['from-sheet', badSheet, '--id', 'bad', '--name', 'Bad', '--license', 'MIT', '--author', 'Me', '--out', path.join(dir, 'out')],
      io,
    );
    expect(code).toBe(1);
    expect(io.err.join('\n')).toMatch(/192|208|1536|2080|spritesheet/i);
  }, 20000);

  it('accepts a correctly-sized from-sheet input', async () => {
    const dir = tmp();
    const goodSheet = path.join(dir, 'good.webp');
    await sharp({
      create: { width: SPRITE_SHEET.width, height: SPRITE_SHEET.height, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
    })
      .webp()
      .toFile(goodSheet);
    const io = fakeIO();
    const code = await runCli(
      ['from-sheet', goodSheet, '--id', 'good', '--name', 'Good', '--license', 'MIT', '--author', 'Me', '--out', path.join(dir, 'out')],
      io,
    );
    expect(code).toBe(0);
  }, 20000);
});

describe('create-pet CLI — validate subcommand', () => {
  it('validates a written pet directory and rejects a tampered one', async () => {
    const img = await makeCharacterPng();
    const out = tmp();
    await runCli(
      ['from-image', img, '--id', 'checkme', '--name', 'CheckMe', '--license', 'CC0-1.0', '--author', 'T', '--out', out],
      fakeIO(),
    );
    const okIO = fakeIO();
    expect(await runCli(['validate', out], okIO)).toBe(0);

    // Tamper: strip the license → must fail validation.
    const m = JSON.parse(readFileSync(path.join(out, 'pet.json'), 'utf8'));
    delete m.license;
    writeFileSync(path.join(out, 'pet.json'), JSON.stringify(m));
    const badIO = fakeIO();
    expect(await runCli(['validate', out], badIO)).toBe(1);
    expect(badIO.err.join('\n')).toMatch(/license/i);
  }, 45000);
});
