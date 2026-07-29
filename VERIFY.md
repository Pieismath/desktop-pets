# VERIFY — manual checklist

Things a human should eyeball that automation can't fully prove. Machine-side
verification already run for every stage lives in `captures/report.json`
(regenerate any time with `pnpm smoke`).

## Stage 2 — pet on screen

```sh
pnpm start
```

- [ ] Pip appears bottom-right, transparent background, above other windows,
      **without stealing focus** from the app you're typing in.
- [ ] Animations look alive (the smoke test proves frames advance; judge the
      *feel*): idle bobs and blinks (~5.5 s loop), working spins the gear,
      alarm flashes red and shakes. `captures/*.png` has one still per state.
- [ ] `alarm` reads as "stop and look" vs `failed`'s "that didn't work"
      (red + flashing + warning sign vs gray + X-eyes + rain cloud).
- [ ] Drag the pet somewhere else; quit (🐾 menu-bar icon → Quit) and
      relaunch: it remembers the position (per monitor, if you have several).
- [ ] Click-through: when the cursor is *not* over the pet, clicks land on
      whatever is underneath the transparent window. Over the pet, a click
      makes it wave; right-click opens a menu.
- [ ] The 🐾 tray icon shows and Quit works.

## Stage 3 — agent connection

```sh
pnpm start                                        # terminal 1
node packages/hooks/dist/installer.js install     # writes ~/.claude/settings.json (backs up first)
claude                                            # terminal 2, any project
```

- [ ] While Claude works, the pet switches states: thinking on prompt submit,
      running/editing per tool, a success jump on finish. (The event pipeline
      itself is machine-verified — see D12 — this checks the *feel*.)
- [ ] Ask Claude to run something not covered by your allow rules while you
      watch: the pet enters `waiting` with a "Needs permission" bubble, and
      the normal terminal prompt still appears (stage 3 answers "no decision";
      pet-click approve/deny arrives in stage 6).
- [ ] `node packages/hooks/dist/installer.js uninstall` removes exactly the
      desktop-pets entries — diff settings.json against the printed backup.
- [ ] MCP (optional): `claude mcp add desktop-pets -- node <repo>/packages/mcp/dist/bin.js`,
      then ask Claude to use `pet_say` — bubble shows sanitised text.
