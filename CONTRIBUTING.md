# Contributing

Thanks for taking a look. Pets are the easiest and most welcome contribution,
so they come first.

## Contributing a pet

The whole point of the `create-pet` CLI is that you shouldn't have to
hand-assemble 80 frames at exact pixel dimensions. Draw one character, run one
command.

```sh
pnpm install
pnpm build

node packages/create-pet/dist/bin.js from-image my-character.png \
  --id my-pet \
  --name "My Pet" \
  --description "One line about them." \
  --license CC0-1.0 \
  --author "Your Name" \
  --install
```

`--install` puts it in your own pets folder so you can try it immediately
(🐾 menu bar → Character). When you're happy, copy the folder into `pets/` in
the repo and open a pull request.

### The two hard rules

1. **Original or public-domain art only.** No copyrighted characters — no
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
1536 × 2080 — 8 columns × 10 rows of 192 × 208 frames.

### Drawing a character in code instead

The bundled pets are drawn programmatically, and adding one that way is a
single file. A character supplies only two functions:

```ts
export const MY_CHARACTER: PixelCharacter = {
  id: 'my-character',
  palette: MY_PALETTE,
  draw(canvas, pose, palette) { /* front view */ },
  drawSide(canvas, pose, palette) { /* profile, facing right — used for walking */ },
};
```

You never specify animation timing. `packages/create-pet/src/poses.ts` owns the
state → pose → palette mapping for *every* pet, and the "failed" grey wash and
"alarm" red flash are derived automatically from your own palette colours. That
means a new character can't drift from how the others behave.

Add it to `BUNDLED_PETS` in `bundled-pets.ts`, then `pnpm gen:pets`.

Useful reference: `char-cat.ts` is the most fully worked example.
`packages/create-pet/src/pixel.ts` has the drawing primitives — `rect`,
`round`, `ellipse`, and an `outline()` pass that traces the whole silhouette
for you, so you draw solid shapes and get consistent linework free.

Art conventions worth following:
- Work on the 48 × 52 logical grid; it's upscaled 4× into each frame.
- Stand on the shared ground line (`LOGICAL_BASELINE`) so your pet's feet land
  on the Dock exactly like the others.
- Keep silhouettes readable at ~40 pixels tall — at that size, a couple of
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
  in both directions — what must be stripped, and what must survive.
- **The risk classifier is biased toward precision.** A false alarm is worse
  than a missed one, because false alarms train people to ignore the feature.
  New rules need tests proving both that they fire *and* that ordinary
  commands still stay silent.
- **Never break the agent.** If the pet isn't running, or the socket is stale,
  or anything throws, the hook must exit cleanly with no output so Claude Code
  behaves exactly as if the pet weren't installed.
- **Local only.** No telemetry, no analytics, no network calls. This isn't
  negotiable either.

`DECISIONS.md` explains why things are the way they are — it's worth skimming
before proposing a change to the architecture, since most of the non-obvious
choices are documented there along with what would need to be true to reverse
them.

## Reporting problems

Please include your macOS version, `node --version`, and whatever the terminal
printed. For agent-related issues, `DESKTOP_PETS_DEBUG=1` in the terminal
running Claude Code makes the hook explain itself.
