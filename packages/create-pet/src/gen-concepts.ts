/**
 * Regenerate the long-tail concept index from Unicode CLDR.
 *
 *   pnpm gen:concepts
 *
 * Run by hand, not at build or run time: it fetches from the network and
 * writes `concepts-cldr.ts`, which is committed. Nothing at runtime downloads
 * anything.
 *
 * Why two layers. `CONCEPTS` in `pictograph.ts` stays hand-written and wins,
 * because CLDR annotations record *synonyms*, not which emoji a bare word most
 * likely means: "car" is listed under both 🚗 and 🚕, and nothing in the data
 * says the plain one is the better answer. Trying to infer that with scoring
 * produced a taxi for "car" and a moon cake for "moon". So the curated table
 * keeps the common words right, and this generated file supplies the thousands
 * of words no one would ever sit down and enumerate — crustacean, escalator,
 * stethoscope, tumbleweed.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONCEPTS } from './pictograph.js';

const SOURCES = {
  annotations:
    'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-full/annotations/en/annotations.json',
  derived:
    'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-derived-full/annotationsDerived/en/annotations.json',
  emojiTest: 'https://unicode.org/Public/emoji/15.1/emoji-test.txt',
};

/** Skin-tone modifiers: a variant of another emoji, never a subject of its own. */
const SKIN_TONE = /[\u{1F3FB}-\u{1F3FF}]/u;

/**
 * Words too generic to name a pet. Without these, "face" and "person" would
 * each claim one arbitrary emoji out of hundreds that list them.
 */
const TOO_GENERIC = new Set([
  'the', 'and', 'with', 'for', 'you', 'are', 'not', 'but', 'all', 'can', 'out', 'get', 'has', 'its',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'zero',
  'face', 'person', 'man', 'woman', 'people', 'sign', 'symbol', 'mark', 'button', 'letter', 'word',
  'type', 'other', 'more', 'very', 'off', 'new', 'old', 'top', 'bottom', 'left', 'right', 'side',
  'way', 'yes', 'have', 'this', 'that', 'then', 'than', 'now', 'here', 'there', 'from', 'into',
  'over', 'under', 'some', 'any', 'who', 'how', 'why', 'what', 'when', 'where',
  'pet', 'animal', 'food', 'object', 'thing', 'place', 'suit', 'card', 'cards', 'group', 'body',
]);

const clean = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, ' ').trim();

interface Row {
  glyph: string;
  name: string;
  keywords: string[];
  isFlag: boolean;
  order: number;
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function main(): Promise<void> {
  process.stdout.write('fetching Unicode CLDR…\n');
  const [base, derived, testRes] = await Promise.all([
    getJson(SOURCES.annotations),
    getJson(SOURCES.derived),
    fetch(SOURCES.emojiTest).then((r) => r.text()),
  ]);

  // emoji-test.txt is the authority on what is actually an emoji, and its
  // order is the canonical one. CLDR keys omit the variation selector, so
  // both sides are normalised before joining.
  const noVs = (s: string): string => s.replace(/️/g, '');
  const group = new Map<string, string>();
  const order = new Map<string, number>();
  let currentGroup = '';
  let index = 0;
  for (const line of testRes.split('\n')) {
    if (line.startsWith('# group:')) {
      currentGroup = line.slice(8).trim();
      continue;
    }
    const m = /^([0-9A-F ]+);\s*fully-qualified\s*#\s*(\S+)/.exec(line);
    if (!m) continue;
    const key = noVs(m[2]!);
    if (group.has(key)) continue;
    group.set(key, currentGroup);
    order.set(key, index++);
  }

  const annotations = {
    ...((base['annotations'] as { annotations?: Record<string, { default?: string[]; tts?: string[] }> })?.annotations ?? {}),
    ...((derived['annotationsDerived'] as { annotations?: Record<string, { default?: string[]; tts?: string[] }> })?.annotations ?? {}),
  };

  const rows: Row[] = [];
  for (const [glyph, entry] of Object.entries(annotations)) {
    if (SKIN_TONE.test(glyph)) continue;
    const key = noVs(glyph);
    const g = group.get(key);
    // not in emoji-test means it is not an emoji: CLDR also annotates plain
    // punctuation, and an angle bracket makes a poor desktop pet
    if (g === undefined || g === 'Component') continue;
    const name = clean(entry.tts?.[0] ?? '');
    if (!name) continue;
    rows.push({
      glyph,
      name,
      keywords: (entry.default ?? []).map(clean),
      isFlag: g === 'Flags' || name.startsWith('flag'),
      order: order.get(key) ?? 99999,
    });
  }
  process.stdout.write(`  ${rows.length} emoji with names\n`);

  const best = new Map<string, { glyph: string; score: number }>();
  for (const row of rows) {
    const kws = new Set(row.keywords);
    const candidates = new Set([row.name, ...kws]);
    // "flag: France" also answers to "france"
    const country = /^flag ?:? ?(.+)$/.exec(row.name);
    if (country) candidates.add(country[1]!);
    const words = row.name.split(' ').length;

    for (const word of candidates) {
      if (!word || word.length < 3 || TOO_GENERIC.has(word)) continue;
      if (/^\d+$/.test(word) || word.includes('skin tone')) continue;

      let score: number;
      if (word === row.name) score = 10000;
      else if (kws.has(word)) score = 7000;
      else if (row.name.startsWith(`${word} `)) score = 5000;
      else if (row.name.endsWith(` ${word}`)) score = 4000;
      else score = 2000;
      if (row.isFlag) score -= 2500;
      // tie-breakers: the least qualified name is the most generic meaning
      score -= words * 120;
      score -= Math.min(80, row.name.length * 2);
      score -= Math.min(80, ([...row.glyph].length - 1) * 30);
      score -= Math.min(60, row.order / 60);

      const current = best.get(word);
      if (!current || score > current.score) best.set(word, { glyph: row.glyph, score });
    }
  }

  // the curated table is authoritative; only emit what it does not cover
  const curated = new Set(Object.keys(CONCEPTS));
  const entries = [...best.entries()]
    .filter(([word]) => !curated.has(word))
    .sort(([a], [b]) => a.localeCompare(b));

  // grouped by glyph, one line each — far smaller than an object literal
  const byGlyph = new Map<string, string[]>();
  for (const [word, { glyph }] of entries) {
    const list = byGlyph.get(glyph) ?? [];
    list.push(word);
    byGlyph.set(glyph, list);
  }
  // comma-separated: CLDR words themselves contain spaces ("police car")
  const packed = [...byGlyph.entries()].map(([glyph, words]) => `${glyph}\t${words.join(',')}`).join('\n');

  const out = `/**
 * Generated by \`pnpm gen:concepts\` — do not edit by hand.
 *
 * The long tail of concepts, from Unicode CLDR emoji annotations (CC-BY, see
 * unicode.org/copyright.html). ${entries.length} words over ${byGlyph.size} pictographs,
 * on top of the hand-curated table in pictograph.ts, which wins where the two
 * overlap. Packed as one line per pictograph — glyph, then its words — because
 * an object literal of this many entries is several times the size.
 */

export const CLDR_PACKED = ${JSON.stringify(packed)};
`;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const target = path.join(here, '..', 'src', 'concepts-cldr.ts');
  writeFileSync(target, out);
  process.stdout.write(
    `✓ wrote ${target}\n  ${entries.length} new words over ${byGlyph.size} pictographs (${(out.length / 1024).toFixed(0)} KiB)\n`,
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`);
  process.exitCode = 1;
});
