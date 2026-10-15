# Contributing

Thanks for taking a look. Pets are the easiest and most welcome contribution,
so they come first.

## Contributing a pet

The whole point of the `create-pet` CLI is that you shouldn't have to
hand-assemble 80 frames at exact pixel dimensions. There are three ways in,
easiest first.

### 1. Describe it

```sh
pnpm install && pnpm build

node packages/create-pet/dist/bin.js from-prompt "a mint green axolotl" \
  --license CC0-1.0 --author "Your Name" --install
```

Runs locally: no API key, no network, no cost. Good for a quick pet; if you
want something specific, the other two routes give you full control.

### 2. Bring a picture

```sh
node packages/create-pet/dist/bin.js from-image my-character.png \
  --id my-pet \
  --name "My Pet" \
  --description "One line about them." \
  --license CC0-1.0 \
  --author "Your Name" \
  --install
```

Any image works: a drawing, a photo, or art you generated with an AI tool of
your own. It gets reduced to pixels and animated through the same engine as
the bundled pets. **If you use someone else's art, it must be licensed for
this** (see the rules below).

### 3. Bring a spritesheet

If you already have an 8×10 grid of 192×208 frames, `from-sheet` takes it
directly.

`--install` puts it in your own pets folder so you can try it immediately
(🐾 menu bar → Character). When you're happy, copy the folder into `pets/` in
the repo and open a pull request.

### The two hard rules

1. **Original or public-domain art only.** No copyrighted characters. No
   Mario, no Pokémon, no Studio Ghibli, nothing you don't have the right to
   release. This is the single rule the project won't bend on, and it's why
   provenance is enforced in code rather than requested politely.
2. **Every pet declares `license` and `author`.** There is no flag to skip
   this. A pet missing either fails validation, won't install, and never
   reaches the character picker.

Please also confirm your art is genuinely yours to license. If you generated
it with an AI tool, put the tool in the `generator` field.

### Checks your pet must pass

```sh
node packages/create-pet/dist/bin.js validate <pet-folder>
```

This verifies the manifest and that the spritesheet is exactly
1536 × 2080: 8 columns × 10 rows of 192 × 208 frames.

### Drawing a character in code instead

The bundled pets are drawn programmatically, and adding one that way is a
single file. A character supplies only two functions:

```ts
export const MY_CHARACTER: PixelCharacter = {
  id: 'my-character',
  palette: MY_PALETTE,
  draw(canvas, pose, palette) { /* front view */ },
  drawSide(canvas, pose, palette) { /* profile, facing right, used for walking */ },
};
```

You never specify animation timing. `packages/create-pet/src/poses.ts` owns the
state → pose → palette mapping for *every* pet, and the "failed" grey wash and
"alarm" red flash are derived automatically from your own palette colours. That
means a new character can't drift from how the others behave.

Add it to `BUNDLED_PETS` in `bundled-pets.ts`, then `pnpm gen:pets`.

If you want a *parametric* character rather than a hand-drawn one, look at
`traits.ts` (words in, parts out) with `char-generated.ts` and
`char-person.ts` (parts in, pixels out). That's how `from-prompt` works.

There are two body plans. `char-generated.ts` draws the beast: legs, tail,
body, head, ears, muzzle. `char-person.ts` draws the humanoid: head, torso,
arms, legs, plus hair, an outfit, a hat, glasses and something in one hand.
Hats, glasses and held items are exported from `char-person.ts` and used by
both, which is why a cat can wear a wizard hat.

Adding to it, cheapest first:

- **A word for something that already exists** — one entry in `ALIASES`
  (`corgi` onto `dog`, `mage` onto `wizard`).
- **A look** — one entry in `VARIANTS`: `tiger` is a cat with orange fur and
  stripes; `zebra` is a horse in white with the same stripes.
- **A new thing** — one entry in `SPECIES` (animals) or `PEOPLE` (people).
  Presets are partial: list only what makes it distinctive and the rest comes
  from `BEAST_DEFAULTS` or `HUMAN_DEFAULTS`. A wizard is four fields.
- **A new part** — a kind added to the relevant union, a case in the draw
  function, and a row in the matching `*_WORDS` table. This is the one that
  widens what every prompt can ask for, not just one entry.

A test draws every word in the vocabulary, so a typo anywhere in those tables
fails the build rather than shipping a broken pet.

`pictograph.ts` is the fallback for things that are not creatures, in two
layers: a hand-written table for common words, and `concepts-cldr.ts` for the
long tail, generated from Unicode CLDR by `pnpm gen:concepts` and committed —
nothing fetches at build or run time. The curated layer wins on overlap,
because CLDR records synonyms rather than primary meaning. Matching is n-gram
lookup rather than one huge alternation, since it runs on every keystroke in
the browser; the winner is the longest match and then the rightmost, because
English noun phrases put the head last. `from-pictograph.ts` rasterises it with sharp, from Twemoji SVGs shipped as a
dependency. That is what makes these pets publishable: we know exactly which
artwork produced them, and CC-BY 4.0 permits redistribution with credit, which
the CLI writes into each `pet.json`. The system emoji font stays as a fallback
for glyphs Twemoji lacks, and that path reports an unknown licence, because
text renderers fall back per character invisibly and no font can honestly be
named as the one that drew it.

`ai.ts` is the optional `--ai` path. The part lists in `traits.ts` are exported
as `as const` arrays and the JSON schema is generated from them, so adding a
part to a union automatically offers it to the model — but only once the draw
function can render it, because the type and the schema come from the same
array. Everything the model returns is validated before use, and anything
invalid falls back to the offline reading. Its tests inject a stub transport;
nothing in the suite touches the network.

### Where to find art you're allowed to use

If you'd rather start from existing pixel art than draw your own, these are
CC0 / public-domain sources: free for any use, including commercially:

- [OpenGameArt CC0 collection](https://opengameart.org/content/cc0-resources)
- [FreePixel animals](https://freepixel.art/browse/animals)
- [itch.io public-domain (CC0) collection](https://itch.io/c/2975132/public-domain-cc0)
- [awesome-cc0](https://github.com/madjin/awesome-cc0). A broader index

**Check the licence on the specific asset**, not just the collection it sits
in, and record the real author in `pet.json`. "Found it on the internet" is not
a licence.

Useful reference: `char-cat.ts` is the most fully worked example.
`packages/create-pet/src/pixel.ts` has the drawing primitives, `rect`,
`round`, `ellipse`, and an `outline()` pass that traces the whole silhouette
for you, so you draw solid shapes and get consistent linework free.

Art conventions worth following:
- Work on the 48 × 52 logical grid; it's upscaled 4× into each frame.
- Stand on the shared ground line (`LOGICAL_BASELINE`) so your pet's feet land
  on the Dock exactly like the others.
- Keep silhouettes readable at ~40 pixels tall, at that size, a couple of
  strong identifying features beat lots of detail.

## Contributing code

```sh
pnpm install
pnpm test     # typecheck + unit tests
pnpm lint
pnpm start    # run the app
```

CI runs typecheck, lint and tests on every push and pull request; all three
must be green.

A few things to know before changing behaviour:

- **The sanitiser is a security boundary.** Everything an agent says passes
  through `sanitize.ts` before it can be displayed. If you touch it, add tests
  in both directions: what must be stripped, and what must survive.
- **The risk classifier is biased toward precision.** A false alarm is worse
  than a missed one, because false alarms train people to ignore the feature.
  New rules need tests proving both that they fire *and* that ordinary
  commands still stay silent.
- **Never break the agent.** If the pet isn't running, or the socket is stale,
  or anything throws, the hook must exit cleanly with no output so Claude Code
  behaves exactly as if the pet weren't installed.
- **Local only.** No telemetry, no analytics, no network calls. This isn't
  negotiable either.

`DECISIONS.md` explains why things are the way they are, it's worth skimming
before proposing a change to the architecture, since most of the non-obvious
choices are documented there along with what would need to be true to reverse
them.

## Reporting problems

Please include your macOS version, `node --version`, and whatever the terminal
printed. For agent-related issues, `DESKTOP_PETS_DEBUG=1` in the terminal
running Claude Code makes the hook explain itself.
