# Luvus fork — decisions and handoff

Input for `/opsx:propose luvus-only-backend`. Base: HazAT/pi-interactive-subagents v3.7.2 (`c100577`), remote `upstream`.

## Decisions

| # | Decision | Status |
|---|---|---|
| 1 | Standalone repo at `~/Dev/pi-luvus-subagents`, forked from HazAT upstream (not the maplezzk fork) | confirmed |
| 2 | No maplezzk ecosystem: no `pi-terminal-mux`, no `pi-extensions-i18n`, no zh-CN catalogs | confirmed |
| 3 | Luvus is the only backend; cmux/tmux/zellij/wezterm removed | confirmed |
| 4 | Outside Luvus (`LUVUS_ENV`, `LUVUS_BIN_PATH`, `LUVUS_PANE_ID` missing) the extension refuses with a clear error. No headless fallback | confirmed |
| 5 | Port to latest `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` (upstream still imports `@mariozechner/*` ^0.65) | confirmed |
| 6 | Always invoke the exact `$LUVUS_BIN_PATH`; never look up `luvus` on PATH | proposed default |
| 7 | v1 uses pane commands only: `pane split --no-focus`, `pane name`, `pane run`, `pane read`, `pane close`, `agent keys esc` | proposed default |

## Where the work is

All mux code lives in `pi-extension/subagents/cmux.ts` (1334 lines, 4 backends). `index.ts` touches it through imports and one backend mention. Replace `cmux.ts` with `luvus.ts`; delete backend-specific tests, README sections and setup hints.

## Surface API → Luvus mapping

| Upstream function | Luvus CLI |
|---|---|
| `createSurface(name)` | `pane split $LUVUS_PANE_ID --no-focus` → parse new pane id, then `pane name <name> --pane <id>` |
| `sendLongCommand(surface, cmd)` | write temp script, `pane run <id> "bash <script>"` |
| `readScreen(surface, n)` | `pane read <id> --lines n` |
| `sendEscape(surface)` | `agent keys <id> esc` |
| `closeSurface(surface)` | `pane close <id>` |
| `pollForExit` | unchanged: `.exit` sidecar file is primary; `pane read` is only the crash fallback |
| `isMuxAvailable` / `muxSetupHint` | check the three `LUVUS_*` env vars; hint says "run pi inside Luvus" |

Commands return JSON with `.result` or `.error`.

```
parent pi (pane $LUVUS_PANE_ID)
   |  subagent tool
   v
luvus.ts --$LUVUS_BIN_PATH--> pane split  --> new pane id
                              pane name
                              pane run        bash /tmp/...script (starts child pi)
                              pane read       (crash fallback)
                              agent keys esc  (subagent_interrupt)
child pi writes <session>.jsonl.exit --> parent polls file --> pane close
```

## Verify live before relying on it

1. Exact JSON shape returned by `pane split` (where the new pane id is).
2. `agent keys <id> esc` reaches a pi child. Luvus lists Pi as a native agent kind, so it should; if not, fall back to `pane send` with a raw ESC.

## Deferred (not v1)

- `agent report --kind pi --status ...` to publish subagent state to the Luvus sidebar.
- `wait output` / `wait agent-status` instead of the screen-read fallback.
- `agent start --kind pi` (start + readiness + naming in one call).

## Reference

- maplezzk fork (`~/Dev/pi-extensions/packages/pi-interactive-subagents`) builds against `@earendil-works` 0.85; useful for pi API drift fixes. Do not copy its i18n or terminal-mux code.
- Luvus CLI help: `$LUVUS_BIN_PATH pane help`, `agent help`, `wait help`.
