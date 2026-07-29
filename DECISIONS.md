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

### D8 — Default pet art is procedural and CC0

The bundled pet ("Pip") is drawn entirely in code (SVG shapes → sharp →
spritesheet) by the generator in `packages/create-pet`. No reference images,
no IP. Art license CC0-1.0, `generator` field credits the tool. This also
proves the `create-pet` pipeline end-to-end.

### D9 — pnpm v10+ blocks postinstall scripts by default

pnpm 11 moved the approval mechanism into `pnpm-workspace.yaml`
(`allowBuilds: {electron: true, sharp: true, esbuild: true}`) — without it,
Electron's binary download and sharp's prebuild fetch silently don't run.
Caveat hit during setup: if the first install ran while a script was
unapproved, later approval does **not** retro-run it; `node install.js` inside
the electron package (or a pruned reinstall) is needed.

### D10 — Risk rules: precision over recall, with a safelist

`rm -rf` must fire (brief §6), but `rm -rf node_modules` all day would kill
the feature. Default rules fire on the brief's list; a safelist
(`node_modules`, `dist`, `build`, `.cache`, `coverage`, `tmp`, `target`)
suppresses the `rm` rule when *every* target path is inside a safelisted
directory. `sudo` fires as the brief demands. `--force-with-lease` is
explicitly *not* an alarm. All rules live in one user-editable JSON file with
an `unless` escape per rule; both directions are tested.
