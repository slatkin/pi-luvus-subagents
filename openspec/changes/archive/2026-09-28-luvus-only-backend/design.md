# Design

## Context

All pane handling lives in `pi-extension/subagents/cmux.ts`, which switches on `MuxBackend` in every function. `index.ts` imports `isMuxAvailable`, `muxSetupHint`, `createSurface`, `sendLongCommand`, `pollForExit`, `closeSurface`, `getMuxBackend`, `sendEscape`, `shellEscape`, `renameCurrentTab`, `renameWorkspace` and `readScreen`. The rest of the file (the zellij placement planner, cmux JSON/focus parsing, `createSurfaceSplit`, `exitStatusVar`/`isFishShell`) is used only inside the file or by the tests and integration harness.

Findings from the Luvus CLI help on this machine (`$LUVUS_BIN_PATH` = `~/.local/bin/luvus`):
- `pane split [<id>] [--auto|--right|--down] [--no-focus]`, `pane name <name> --pane <id>`, `pane run [<id>] <cmd...>`, `pane read [<id>]`, `pane close [<id>]`, `agent keys <target> <key>...`.
- `pane list` prints `{"id": ..., "result": {...}}`. Per `LUVUS-FORK.md`, failures return `{"error": ...}`.
- `pane read` help documents **no `--lines` flag**, which contradicts the mapping in `LUVUS-FORK.md`.

## Goals / Non-Goals

**Goals:**
- A single `luvus.ts` with no backend switch, about 150 lines instead of 1334.
- `index.ts` changes only at the import site, the error strings and `/plan`.

**Non-Goals:**
- An abstraction layer that could take other backends again. Upstream is the place for that.
- The Luvus extras deferred in `LUVUS-FORK.md` (`agent report`, `wait ...`, `agent start`).

## Decisions

1. **`luvus.ts` keeps the upstream function names.** It keeps `createSurface`, `sendLongCommand`, `readScreen`/`readScreenAsync`, `sendEscape`, `closeSurface`, `pollForExit`, `shellEscape`, `isMuxAvailable`, `muxSetupHint`, and `__pollForExitTest__` with `PollResult`. That keeps the `index.ts` diff to an import-path change and makes later upstream merges into `index.ts` easy. The alternative was renaming everything to `*Pane` names, which gives more churn for no behavior change. `getMuxBackend`, `renameCurrentTab`, `renameWorkspace`, `sendCommand`, `createSurfaceSplit`, `exitStatusVar`, `isFishShell` and all zellij/cmux parsers are dropped. `sendCommand` becomes a private helper used by `sendLongCommand`.

2. **One `luvus(args)` helper.** It calls `execFileSync(process.env.LUVUS_BIN_PATH, args)` with no shell, parses stdout as JSON, returns `.result`, and throws `Error(error.message ?? JSON.stringify(error))` when there is an `.error`. An async twin built on `execFileAsync` serves `readScreenAsync` in the poll loop. The path is read per call rather than cached, so tests can set env vars. Rejected: `execSync` with string commands, which the cmux path used. It invites quoting bugs, and the spec requires calling the binary by path without a shell.

3. **Pane id from the split result.** Verified live (2026-09-28, pane 21 → split → pane 24): `pane split` returns `{"id": "1", "result": {"pane": "24", "revision": 329037, "tab": "1", "type": "pane", "workspace": "2"}}`. The new pane id is `result.pane` (a numeric string). The parser reads `result.pane` and stringifies it; anything else throws with the raw JSON in the message. The captured payload is the fixture in `test/test.ts`.

4. **`readScreen(id, n)` tails in-process.** Verified live (2026-09-28): `pane read` returns a JSON envelope with the screen as plain text under `.result.text` (`"type": "pane_read"`). It accepts unknown flags silently — `--lines 5` and even `--bogus 2` return the full visible screen unchanged — so `--lines` must NOT be passed; the tail stays in-process via `tailLines`. Also verified live: `pane name <name> --pane <id>` returns `{"name", "pane", "type": "agent_name"}` and **rejects names not matching `[a-z][a-z0-9_-]{0,31}`** ("Scout" fails), so `createSurface` slugifies the subagent name (lowercase, invalid chars → `-`, truncate 32) before naming.

5. **Launch keeps the bash-script indirection.** `sendLongCommand` writes the same script and then runs `pane run <id> bash <script>`. The script is always bash, so the `$?` sentinel works under a fish login shell, and `exitStatusVar`/`isFishShell` can be deleted.

6. **Availability is an env check only.** `isMuxAvailable()` returns true when `LUVUS_ENV`, `LUVUS_BIN_PATH` and `LUVUS_PANE_ID` are all non-empty. It does not probe the binary, so a broken binary shows up as a split error at spawn time. `muxSetupHint()` returns "Start pi inside a Luvus pane." In `index.ts`, `muxUnavailableResult` says "Subagents require Luvus." and the interrupt error names "Luvus" instead of calling `getMuxBackend()`.

7. **`/plan` rename is removed.** Decision #7 limits v1 to pane commands. `tab rename` exists but is outside that set, so the rename block and its imports are deleted rather than left behind a flag.

8. **Pi package port.** Replace `@mariozechner/pi-coding-agent`/`pi-tui` with `@earendil-works/*` in `package.json` (peer `*`, dev `^0.87.1`) and in the imports of `index.ts`, `subagent-done.ts` and `test/test.ts`. Then run `npx tsc --noEmit`, or a pi load, and fix the drift. Where an API changed, check `~/Dev/pi-extensions/packages/pi-interactive-subagents` for how that fork adapted it.

## Risks / Trade-offs

- [Split JSON shape unknown] → Task 1.1 captures it live before `createSurface` is finalized, and Decision 3 is narrowed to the observed field.
- [`agent keys <pane> esc` may not reach a pi child, or may not accept a pane id as the target] → VERIFIED LIVE (2026-09-28): `agent keys <id> esc` aborted a running pi turn ("Operation aborted") and accepted a pane id as target. No fallback needed; `sendEscape` uses `agent keys <id> esc` only. (Note: `pane send` pastes text but does not press Enter — submitting to a pi TUI needs `agent keys <id> enter`.) Scope note from the integration suite: `agent keys` only accepts panes Luvus detects as agents (`agent_not_ready: target pane is not a running agent` otherwise) — subagent panes run pi, which is detected, so this is the spec's error-contract path, not a fallback case.
- [`pane read` without `--lines` could return a large buffer every poll tick] → the poll only needs 5 lines, and the `.exit` sidecar is the fast path. Accept this for v1; `wait output` (deferred) is the upgrade.
- [Pi API drift from 0.65 to 0.87 may be larger than import renames] → it is its own task group so it can be sized once `tsc` reports errors, and it is verified by the unit suite and a live pi load.
- [Integration tests need a real Luvus session] → they are gated on `LUVUS_ENV`, like the old harness was gated on its backends, and skip elsewhere.

## Migration Plan

This is a fork, so there are no existing users to migrate. The README states the Luvus requirement. Rolling back means reverting to upstream v3.7.2 (`c100577`).
