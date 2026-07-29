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

## Stage 4 — risk classification

The classifier is exhaustively unit-tested in both directions (80 cases in
`packages/shared/src/risk.test.ts`) and was verified live: with the pet
running, `sudo rm -rf /var/data/uploads` fired the red alarm (path shown as
`⟨path⟩`) while `ls -la` stayed silent.

- [ ] The rules file exists and is readable at
      `~/Library/Application Support/desktop-pets/risk-rules.json` — this is
      the one file to audit/edit; edits hot-reload (watch the log for
      `[risk] rules reloaded`).
- [ ] Alarm reads as unmistakable vs a normal state, and clicking the pet
      (or the bubble's Deny) dismisses it.
- [ ] Add a custom rule (e.g. block `npm publish`) and confirm it fires; set
      `"enabled": false` on a default rule and confirm it stops firing.

## Stage 5 — escalation

The ladder is a pure, exhaustively-tested function, and all rungs were driven
live (host + real hook runner, with `DESKTOP_PETS_FAKE_FOCUS`/`FAKE_IDLE` test
seams): agent-app-focused → `animate` (no bubble); other-app → `bubble`;
idle > 2 min → `notify` (OS notification fired). To reproduce by hand:

- [ ] With Claude working in your terminal and that terminal focused, the pet
      animates **silently** (no bubble) on ordinary events.
- [ ] Switch to another app (Slack, browser): the same events now pop a
      **speech bubble**.
- [ ] Walk away ~2 min, then trigger an event (finish a task / hit a
      permission prompt): a real **macOS notification** fires. (Grant
      notification permission the first time.)
- [ ] Toggle **Do Not Disturb** (🐾 menu-bar → Do Not Disturb, or right-click
      the pet). The tray shows 🐾🌙 and a `dnd` moon appears on the pet;
      non-alarm bubbles/notifications go silent, but an `alarm` still shows.
- [ ] Join a Zoom/Teams/Meet call (bring it frontmost): DND auto-engages while
      it's frontmost (edit `config.json` → `dnd.autoApps` to tune the list).

## Stage 6 — talk back (the payoff)

All four decision paths were verified live against the real Claude Code hook
contract (see D15). To reproduce end to end on a normally-authenticated
machine:

- [ ] With the pet installed (`node packages/hooks/dist/installer.js install`)
      and running, from **another app** (not the terminal) trigger a Claude
      permission request. The pet enters `waiting` with **Approve / Deny /
      Focus** and a countdown.
- [ ] Click **Approve** → the tool runs. Repeat and click **Deny** → Claude
      reports the denial. Click **Focus** → the agent's terminal comes forward
      and the native prompt takes over.
- [ ] Focus the agent's terminal *without* clicking: the pet's buttons go away
      and the native prompt appears (the terminal answers when you're looking
      at it).
- [ ] Run two Claude sessions in two projects at once: **two pets** appear,
      each tagged with its project; the blocked one shows buttons so you can
      tell which is stuck and unstick it. Drag them apart — positions persist.
- [ ] A risky command that also needs permission shows the **alarm** state
      *and* the approve/deny buttons together.
