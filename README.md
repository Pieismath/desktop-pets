# desktop-pets

An animated companion in a transparent, always-on-top window that watches your
coding agents — and, unlike a status light, **decides whether to interrupt you
and lets you answer back**.

## The thesis

Existing desktop-pet tools (see the excellent MIT-licensed
[OpenPets](https://github.com/alvinunreal/openpets), which this project does
*not* copy) built pets that **react**: agent works, pet runs. This project is
built around three ideas that reacting alone doesn't cover:

1. **Context-aware escalation.** The pet knows which app you're focused on and
   whether you're at the machine at all. A task finishing while you're in your
   editor is a silent animation. The same event while you're in Slack is a
   speech bubble. If you've been idle two minutes, it's a real OS
   notification; ten minutes, it's queued into a "while you were away" digest.
   The same signal should not fire the same way regardless of where you are.

2. **The pet is a control surface, not a status light.** When an agent is
   blocked waiting for permission, you click the pet to **approve, deny, or
   jump to that session** — powered by Claude Code's `PermissionRequest` hook,
   which can return an allow/deny decision on the user's behalf. With several
   agents running, each gets its own pet with visible identity, so "which one
   is stuck, and unstick it from here" works at a glance.

3. **Risk signalling, not just activity signalling.** The pet doesn't only
   show that an agent is busy — it raises a visually unmistakable **alarm**
   state when the agent is about to do something you should look at:
   `rm -rf`, `git push --force`, writes to `.env` or prod config, `sudo`,
   `DROP TABLE`. Rules live in one auditable, user-editable file, biased hard
   toward precision — a false alarm kills the feature.

## Principles

- **MIT licensed. No copyrighted characters, ever.** Every pet carries
  provenance: `license` (SPDX) and `author` are required fields; a pet missing
  either fails validation and cannot install.
- **Local only.** No telemetry, no analytics, no network. IPC runs over a
  local Unix socket with a per-run random token.
- **Agent content never leaks.** Everything a pet speaks passes through one
  sanitiser at the display boundary — paths, URLs, tokens, env values and
  multiline content are stripped before render.

## Layout

| Path | What it is |
|------|------------|
| `apps/host` | Electron app: pet windows, IPC server, escalation engine |
| `packages/shared` | Sprite/pet formats, reaction vocabulary, sanitiser, risk rules, protocol types |
| `packages/client` | Tiny client library that talks to the host socket |
| `packages/hooks` | Claude Code hook runner + settings.json installer/uninstaller |
| `packages/mcp` | MCP stdio server exposing `pet_status`, `pet_react`, `pet_say` |
| `packages/create-pet` | CLI: character image in → conformant spritesheet + validated `pet.json` out |
| `pets/default` | The bundled default pet (original, procedurally generated, CC0) |

## Quickstart

```sh
pnpm install
pnpm test          # typecheck + unit tests
pnpm start         # launch the pet
pnpm smoke         # launch, self-capture screenshots of all states, exit
```

Connect Claude Code (writes hook entries to `~/.claude/settings.json`;
`uninstall` removes exactly what it wrote):

```sh
node packages/hooks/dist/installer.js install
node packages/hooks/dist/installer.js uninstall
```

## Sprite format

One `.webp`, 8 columns × 10 rows, 192×208 per frame, one row per state:
`idle, running-right, running-left, waving, jumping, failed, waiting,
working, review, alarm`. Agents never name sprite rows — they emit
**reactions** (`idle, thinking, working, editing, running, testing, waiting,
waving, success, error, celebrating, risky`), and the host maps reactions to
sprite states via a user-overridable table. New reactions never require new
art.

See `DECISIONS.md` for research findings and every judgment call made while
building, and `VERIFY.md` for the manual verification checklist.
