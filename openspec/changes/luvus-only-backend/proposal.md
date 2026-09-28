# Proposal

## Why

This fork exists to run pi subagents inside Luvus, which already knows how to split, run, read and close panes and treats pi as a native agent kind. Upstream spreads pane handling across four multiplexers in one 1334-line `cmux.ts`, and none of them is Luvus. Upstream also still builds against `@mariozechner/*` ^0.65 while pi now ships as `@earendil-works/*` (0.87.x). Keeping four backends we don't use and an outdated pi API is dead weight. Replacing them with one Luvus backend on the current pi packages makes the extension work where it is actually used. Decisions are in `LUVUS-FORK.md`.

## What Changes

- **BREAKING** Remove the cmux, tmux, zellij and WezTerm backends, the `PI_SUBAGENT_MUX` preference, and all backend-specific helpers (zellij placement, cmux JSON parsing, focus snapshots).
- Add one Luvus backend. It opens a subagent pane by splitting the caller's pane (`$LUVUS_PANE_ID`) without taking focus, names the pane, runs the launch script in it, reads its output as the crash fallback, sends Escape through `agent keys` to interrupt, and closes the pane when the subagent finishes.
- **BREAKING** When `LUVUS_ENV`, `LUVUS_BIN_PATH` or `LUVUS_PANE_ID` is missing, `subagent` and `subagent_resume` refuse with an error telling the user to run pi inside Luvus. There is no headless fallback.
- The backend calls exactly `$LUVUS_BIN_PATH` and never looks up `luvus` on `PATH` (decision #6, adopted as the default).
- v1 uses only `pane split|name|run|read|close` and `agent keys` (decision #7, adopted as the default). As a result, `/plan` no longer renames the workspace or tab.
- Port imports and dev dependencies from `@mariozechner/pi-coding-agent` / `@mariozechner/pi-tui` ^0.65 to `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` at the current release, and fix any API drift this exposes.
- Remove backend-specific tests, integration harness code, README install sections and setup hints. Rename the package and update its description to match the fork.
- Unchanged: the tool surface (`subagent`, `subagent_resume`, `subagent_interrupt`, `caller_ping`, `subagent_done`) and exit detection through the `.exit` sidecar.

## Capabilities

### New Capabilities
- `luvus-backend`: how subagent panes are created, driven, read, interrupted and closed through the Luvus CLI, and how the extension behaves outside Luvus.

### Modified Capabilities
<!-- none: no specs exist yet in openspec/specs/ -->

## Impact

- Code: `pi-extension/subagents/cmux.ts` is deleted and replaced by `luvus.ts`. `index.ts` changes its imports, the interrupt error text, the unavailable-backend message and the `/plan` renames. `subagent-done.ts`, `index.ts` and the tests change their pi package imports.
- Tests: the zellij/cmux/WezTerm unit tests in `test/test.ts` go away, replaced by unit tests for the Luvus backend. `test/integration/harness.ts` and `mux-surface.test.ts` are rewritten for Luvus.
- Dependencies: the `@mariozechner/*` peer and dev dependencies are replaced by `@earendil-works/*`.
- Docs: the README install and backend sections are rewritten for Luvus only. `LUVUS-FORK.md` stays as the decision record.
- Users: anyone running this fork outside Luvus loses subagents entirely, which is intended.

## Out of scope

`agent report` sidebar status, `wait output` / `wait agent-status`, and `agent start --kind pi`, all listed as deferred in `LUVUS-FORK.md`. Also out of scope: i18n, `pi-terminal-mux`, and anything else from the maplezzk fork beyond using it as a reference for pi API drift.
