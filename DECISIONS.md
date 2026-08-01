# DECISIONS

Running log of research findings, judgment calls, and assumptions — including
what would need to change if an assumption turns out wrong. Newest entries at
the bottom of each section.

## Research (brief §4)

### D1 — Claude Code hooks CAN approve/deny. Feature #2 is real, not stubbed.

Verified against https://code.claude.com/docs/en/hooks (2026-07-29, Claude
Code 2.1.210 installed locally).

- **`PermissionRequest` hook event** fires "when a tool call needs a
  permission decision" — i.e. exactly when an agent is blocked on the
  permission prompt. A hook may answer on the user's behalf with exit 0 +
  stdout JSON:
  `{"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision":
  {"behavior": "allow" | "deny", "message": "<deny only>", "interrupt":
  <deny only>, "updatedInput": {...}, "updatedPermissions": [...]}}}`.
  No output / no decision → the normal terminal prompt appears (interactive)
  or the call is auto-denied (headless). A hook `allow` does **not** override
  configured deny rules — we are not a permission bypass.
- Input payload: `tool_name`, `tool_input`, `permission_suggestions`,
  plus common fields `session_id`, `cwd`, `permission_mode`,
  `transcript_path`.
- **`PreToolUse`** fires before *every* tool call (permission needed or not)
  and can return `permissionDecision: "allow" | "deny" | "ask" | "defer"`.
  We use it for risk classification (alarm state + optional hold-to-decide),
  not for approval UX.
- Timeouts: default 600 s for command hooks, configurable per hook
  (`"timeout"` seconds). `statusMessage` customises the spinner shown while
  a hook runs. `async: true` runs a hook in the background without blocking
  Claude — used for all telemetry-only events so the pet adds ~0 latency.
- Useful notification types on the `Notification` event:
  `permission_prompt`, `idle_prompt` (matcher filters by type).

**Consequence for the design:** the pet's approve/deny buttons are driven by a
*held* `PermissionRequest` hook: the hook process forwards the request to the
host and waits; clicking the pet resolves it. If the user focuses the
session's own terminal, we release the hold immediately with no decision so
the native prompt appears — the pet answers when you're anywhere else, the
terminal answers when you're looking at it. If the pet app isn't running, the
hook exits instantly with no output and Claude Code behaves exactly as if the
hook weren't installed.

### D2 — Focused-app detection: `lsappinfo`, zero permissions

Options considered:

| Option | App identity | Window title | Permissions |
|--------|--------------|--------------|-------------|
| `get-windows` (née `active-win`) npm pkg | yes | yes | **Accessibility** (app info) + **Screen Recording** (title) |
| tiny native addon (NSWorkspace) | yes | no | none, but needs native build toolchain |
| `lsappinfo front` + `lsappinfo info` CLI | yes (bundle id) | no | **none** |

We only need app identity for the escalation ladder, never titles. Verified
empirically on this machine (macOS 26.5, Apple Silicon):
`lsappinfo front` → ASN, `lsappinfo info -only bundleid <ASN>` → bundle id,
no permission prompts, ~10 ms. Chosen: poll `lsappinfo` (1.5 s interval)
behind a `FocusProvider` interface so a native addon can replace it later
without touching consumers. If Apple removes `lsappinfo`, swap the provider.

### D3 — Idle time: `powerMonitor.getSystemIdleTime()`, zero permissions

Electron's `powerMonitor.getSystemIdleTime()` returns system idle seconds
with no TCC permissions. Fallback (verified working, also permission-free):
`ioreg -c IOHIDSystem` → `HIDIdleTime` (ns). Both wrapped behind an
`IdleProvider` interface; the smoke test asserts powerMonitor returns a
finite number.

### D4 — Screen-share / call detection: no clean public API → manual DND + conservative heuristic

There is no supported macOS API for "another app is capturing the screen" or
"a call is active"; the known approaches (private CGS calls, parsing
`~/Library/DoNotDisturb/DB/Assertions.json`, mic-in-use via CoreAudio) are
undocumented and break across releases. Per the brief's fallback: DND is a
**manual toggle** (tray menu + pet context menu). Additionally, a conservative
heuristic auto-enables DND while a known conferencing app is *frontmost*
(`zoom.us`, `com.microsoft.teams2`/`com.microsoft.teams`, `Cisco-Systems.Spark`
(Webex), `com.apple.FaceTime`) — list is user-editable in config
(`dnd.autoApps`), and it never *disables* a manually-set DND. If macOS ships a
public API later, it slots in behind the same `DndProvider` interface.

## Judgment calls (brief §8 protocol)

### D5 — Session ↔ terminal-app mapping via inherited env

Hook processes inherit the terminal's environment, so the runner captures
`TERM_PROGRAM` (iTerm.app / Apple_Terminal / vscode / WarpTerminal / ghostty…)
and `__CFBundleIdentifier` (set when launched via LaunchServices — e.g. the
Claude desktop app) and sends them with each event. That gives "the agent's
app" for the escalation ladder and a target for the Focus button
(app-level activation via `open -b <bundle-id>`). Verified on this machine:
under the Claude desktop app, `TERM_PROGRAM` is empty but
`__CFBundleIdentifier=com.anthropic.claudefordesktop`. Window/tab-level focus
(the exact tab of the right session) has no permission-free API — app-level
activation only; logged as a known limitation.

### D6 — MCP session identity is cwd-based (best effort)

MCP stdio servers spawned by Claude Code don't receive the session id. The
MCP server reports its `cwd`; the host merges an MCP connection into an
existing hook-created session when the cwd matches (most-recently-active wins
on ties), else it creates a standalone session. Wrong merges are cosmetic
(two pets vs one); acceptable.

### D7 — Approve-from-pet is a convenience surface, not a security boundary

The pet's approve/deny only answers a `PermissionRequest` that Claude Code
itself raised, and configured deny rules still win over a hook `allow`.
Sessions running with `--dangerously-skip-permissions` never raise
`PermissionRequest`, so the pet can still *alarm* on risky calls there (via
`PreToolUse`) but cannot gate them; the alarm-hold in that case is
display-only. Documented so nobody mistakes the pet for a policy engine.

### D8 — Bundled pet art is procedural and CC0

Every bundled pet is drawn entirely in code by the generator in
`packages/create-pet` — no reference images, no IP. Art licence CC0-1.0, and
the `generator` field credits the tool. This also proves the `create-pet`
pipeline end-to-end. Superseded in look by D19/D21 (vector → pixel art).

### D9 — pnpm v10+ blocks postinstall scripts by default

pnpm 11 moved the approval mechanism into `pnpm-workspace.yaml`
(`allowBuilds: {electron: true, sharp: true, esbuild: true}`) — without it,
Electron's binary download and sharp's prebuild fetch silently don't run.
Caveat hit during setup: if the first install ran while a script was
unapproved, later approval does **not** retro-run it; `node install.js` inside
the electron package (or a pruned reinstall) is needed.

### D11 — Sprite loop counts are for one-shot playback

The locked table's finite loop counts (`working ×1`, `waiting ×1`, …) are the
art's native loop lengths. A pet frozen on the last frame of `working` while
the agent is still working would read as dead, so: **persistent statuses loop
indefinitely; finite counts apply when a state plays as a one-shot reaction**
(waving, jumping, error flash). `failed` holds its final slumped frame after
its 2 loops (`after: 'hold'` in the spec). The table itself is unchanged.

### D12 — E2E verification of the hook pipeline (and its limits)

A fully-live `claude -p` test run was blocked: this build environment's org
policy disables subscription auth for the standalone CLI
("Your organization has disabled Claude subscription access for Claude
Code"). Per the blocked protocol the pipeline was verified two ways instead:

1. **Real Claude Code, failure path:** the failed `claude -p` launch still
   fired hooks from `--settings` before dying — the host's event log recorded
   `SessionStart → UserPromptSubmit → StopFailure(authentication_failed) →
   SessionEnd` arriving through the real runner and socket. That proves
   Claude Code spawns our runner from installed settings and the transport
   works end to end.
2. **Documented payloads, full lifecycle:** the actual runner binary was fed
   the documented stdin JSON for SessionStart / UserPromptSubmit /
   PreToolUse / PostToolUse / PermissionRequest / Stop / SessionEnd; all
   arrived, decision events round-tripped (released as "no decision", i.e.
   empty stdout, in stage 3), and the pet reacted on screen.

What is *not* machine-verified: Claude Code consuming an `allow`/`deny` JSON
we emit for `PermissionRequest` (schema matches the reference docs verbatim).
VERIFY.md has the one-command live check to run on any normally-authenticated
machine.

Also fixed here: macOS caps `AF_UNIX` socket paths at ~104 bytes, so
`socketPath()` falls back to a short deterministic `/tmp/desktop-pets-<uid>-<hash>.sock`
when the data dir would exceed the budget (clients always read the actual
path from `ipc.json`, so only the host computes it).

### D15 — Feature #2 is REAL and verified end-to-end (approve/deny/focus)

Because hooks *can* return a decision (D1), the pet's approve/deny is a real
control surface, not the stubbed fallback the brief anticipated. Verified live
against the actual Claude Code hook contract by feeding the runner a
`PermissionRequest` payload while the host held it, then driving the exact
button-action path a click uses:

- **Approve** → hook emitted `{"hookSpecificOutput":{"hookEventName":
  "PermissionRequest","decision":{"behavior":"allow"}}}`
- **Deny** → `…"decision":{"behavior":"deny","message":"Denied from desktop
  pet"}}`
- **Focus** → released with no output + `open -b <bundleId>` (native prompt
  takes over)
- **Agent terminal already frontmost** → released immediately with no output

Hold policy: the host holds a `PermissionRequest` only when the agent's own
app is NOT frontmost (otherwise the native terminal prompt is right there —
release immediately). While held, focusing the agent's terminal auto-releases
'none'. Host max-hold is 570 s, under the 600 s hook timeout; on expiry we
release 'none' so Claude's own prompt is authoritative. The broker answers
each waiting hook exactly once (idempotent resolve), tested including timeout
and supersede paths. PreToolUse never holds — it only classifies/alarms (D7).

### D16 — One pet per concurrent session, capped at 4

`PetManager` spawns a pet per active session (stable slot indices with per-slot
position memory), destroys a pet when its session ends, and shows the idle
"home" pet only when zero sessions are active. Verified live: two sessions →
two pets tagged `alpha`/`bravo` in distinct slots, one showing live
approve/deny/focus buttons with a real countdown while the other rendered its
own state. Cap is 4 (overflow surfaces via existing pets; logged, not silently
dropped). Window/tab-level focus limitation from D5 applies: "Focus" activates
the app, not the exact tab.

### D17 — Digest is a data:-URL panel; duration drives escalation

The "while you were away" view is a separate frameless window loading
host-composed, fully self-contained HTML via a `data:` URL — no preload, no
IPC, `javascript:false`, strict CSP, project names HTML-escaped. It closes on
blur/Escape and is regenerated on each open so it always reflects current
state. Verified live: it correctly showed blocked-now (with durations, alarmed
items flagged), completed, failed, and risky from recorded history. History is
a bounded JSONL log (≤300 entries / 7 days), local only. Duration escalation:
the blocked-duration badge counts up, a CSS attention-pulse grows at 2 min
(urgency 1) and 10 min (urgency 2), and a still-blocked session re-notifies at
most every 5 min while the user is away, with the growing wait time.

### D18 — create-pet animates a single image via the shared motion vocabulary

The brief asks for "character image in → conformant spritesheet out", but one
image is not 80 frames of hand-drawn animation. Rather than fake it, the CLI
factors Pip's motion out of its drawn body (`frameAnimation()` →
offset/lean/squash + state tint + frame-space overlay decorations) and applies
that exact vocabulary to the user's image with sharp: the character bobs when
idle, leans with motion dashes when running, sparkles at the jump peak,
desaturates to grey when "failed", and gets a red wash + warning sign when
"alarm". Verified live: a purple star-bellied test creature produced a
conformant 8×10 / 192×208 sheet that loaded and passed the full smoke test.
`from-sheet` and `validate` cover users who bring their own art. Both output
paths validate geometry AND provenance before writing, and re-validate on
disk after. License + author are gathered from flags or (on a TTY) prompts,
and the tool refuses to emit without them — no escape hatch. A `--pet=<id>`
host flag selects which installed pet is active.

### D19 — Pixel art, Dock-parked, half-scale (replaces the vector default)

Feedback: the smooth vector blob (Pip) read wrong; the wanted look is chunky
pixel art, small, walking along the Dock. Three changes, none of which touch
the locked sprite format:

- **Art**: new default pet **Ember**, drawn on a 48×52 *logical* pixel grid
  and upscaled ×4 (nearest-neighbour) into the 192×208 frame. The sheet stays
  conformant, so pixel and vector pets coexist. `image-rendering: pixelated`
  in the renderer, and `kernel: 'nearest'` in `composeSheetWebp`, keep it
  crisp end to end. Ember is original, CC0. Pip is kept as an alternate.
- **Two views**: idle/working/etc. are front-facing; the two walk rows are a
  **side profile** (`drawEmberSide`) so travel actually reads as travel.
- **Size + placement**: displayed at `PET_SCALE = 0.5`. Because the art is
  pixels upscaled ×4, half-scale lands on an exact 2× pixel grid — crisp, and
  ~80pt tall, comparable to a Dock icon. The window parks so the character's
  feet sit on the Dock's top edge, derived from `bounds` minus `workArea`
  (no permissions; auto-hidden Docks fall back to the work-area bottom).
  Verified live: Dock top 898, window y 714, feetOffset 184.
- **Patrol**: when a pet has nothing to report it strolls a short way along
  the Dock every 7–20s and settles again, using the walk rows and turning to
  face its direction. Anything worth showing (blocked, alarmed, speaking)
  stops the stroll immediately so the pet never wanders off mid-message.
  Unit-tested including the interrupt and edge-bounce paths.

Note on characters: shipping Mario/Pokémon-style *characters* remains
off-limits (§2) — that is the licensing stance, and unchanged. The pixel-art
*style* was always available; the earlier vector look was my call, not a
constraint.

### D20 — Character picking needed a UI, not just plumbing

Pets were always pluggable (discovery, validation, `--pet=`, `activePetId`),
but choosing one meant hand-editing `state.json` or passing a CLI flag, and
`create-pet` wrote to a folder you then copied by hand. For "download it and
pick your character" that is homework, not a feature. Added:

- **🐾 → Character** submenu listing every installed pet as radio items,
  bundled first then user-installed, each labelled with its licence and
  author (provenance visible at the point of choice, not buried in a file).
  Picking one swaps the sheet live — no restart — and persists `activePetId`.
- **`create-pet --install`** writes straight into the user pets dir.
- **`fs.watch`** on that dir refreshes the picker, so a newly installed pet
  appears without restarting.
- **"Open pets folder…"** reveals the directory in Finder.

Also unified the ground line: `SPRITE_BASELINE_Y` (184 of 208) is now shared
by the pixel generator, the image pipeline, and the host's Dock parking, so
every pet — however it was made — plants its feet in the same place. Before
this, image-derived pets stood ~8px lower than pixel ones and sank into the
Dock. Verified live: a user-drawn mushroom, installed with one command, ran
as the active pet standing correctly on the Dock.

### D21 — One visual language: a cat by default, every pet pixel art

Feedback: make the default a cat, and make *all* pets pixelated like Ember.
Taken as a product decision — the app now has a single look, so:

- **`Mochi`**, an original ginger tabby, is the default. At 48×52 logical a
  cat reads through four things — pointed triangular ears, whiskers, slit
  pupils, and a long expressive tail — so those get the pixels; the tabby "M"
  and tail rings are the flourishes.
- **The vector pet (Pip) is gone**, along with its SVG generator. It was the
  only non-pixel art and kept the codebase carrying two rendering paths.
- **`from-image` now produces pixel art too**: the source picture is trimmed,
  reduced to a small logical sprite with nearest-neighbour sampling, then run
  through the *same* pose engine and overlays as the hand-drawn characters.
  So a user pet shares the grey "failed" wash, the red "alarm" flash and the
  ground line. Images have no legs to swing, so their walk gets a hop on the
  mid-stride frames instead of a leg cycle — honest, and it still reads as
  movement rather than a slide.

Structural consequence, and the reason this was worth doing properly:
characters are now **pluggable**. `PixelCharacter` supplies only `draw` and
`drawSide`; `poses.ts` owns the state→pose/palette/overlay mapping for
*everyone*, and `greyPalette`/`alarmPalette` derive the failed and alarm
treatments from whatever the character's own colours are. Adding a character
is one file and a manifest entry — no animation timing to re-specify, and no
way for a new pet to drift from the others' behaviour.

### D13 — Escalation: agent-app identity via inherited bundle id, with a term-program fallback

The "is the agent's own app focused?" test compares the frontmost bundle id
(`lsappinfo`) against the session's app. The session's app is
`__CFBundleIdentifier` when the hook inherited it (set by LaunchServices),
else a `TERM_PROGRAM → bundle id` lookup table (iTerm→`com.googlecode.iterm2`,
etc.). Bundle id wins when both are present. Verified live end-to-end with
`DESKTOP_PETS_FAKE_FOCUS`/`DESKTOP_PETS_FAKE_IDLE` test seams: agent-focused →
`animate` (no bubble), other-app → `bubble`, idle > notifyIdleSec → `notify`
(OS notification fired). Limitation: window/tab-level focus has no
permission-free API, so two agents in two tabs of the *same* terminal both
count as "agent app focused"; acceptable, and documented.

### D14 — Escalation gates the bubble; alarm bypasses the ladder

Two channels: the **ambient sprite state** always renders (this is "silent
animation"), while **announcements** (success/blocked/error) route through the
ladder — the host suppresses the speech bubble unless the tier is
`bubble`+ and only fires an OS notification at `notify`+. Alarms are the one
exception: they ignore the ladder *and* DND and are always maximally visible
(brief §1.3 — "stop and look"), though an alarm while the user is away still
also fires a notification. Thresholds, the DND auto-app list, and the
reaction→sprite map all live in one hot-reloading `config.json`.

### D10 — Risk rules: precision over recall, with a safelist

`rm -rf` must fire (brief §6), but `rm -rf node_modules` all day would kill
the feature. Default rules fire on the brief's list; a safelist
(`node_modules`, `dist`, `build`, `.cache`, `coverage`, `tmp`, `target`)
suppresses the `rm` rule when *every* target path is inside a safelisted
directory. `sudo` fires as the brief demands. `--force-with-lease` is
explicitly *not* an alarm. All rules live in one user-editable JSON file with
an `unless` escape per rule; both directions are tested.
