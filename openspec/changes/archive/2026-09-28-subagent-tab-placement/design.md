# Design

## Context

All subagent surfaces are created by one function, `createSurface(name)` in `pi-extension/subagents/luvus.ts`, which runs `luvus pane split $LUVUS_PANE_ID --no-focus` and then `pane name`. Three call sites use it: `runSpawn` (new surfaces and pre-created parallel-spawn surfaces) and the `subagent_resume` executor. Everything downstream (`pane run`, `pane read`, `agent prompt`, `pollForExit`, exit sidecars, `pane close`) is pane-id-based and works on panes in any tab (`pane status` help: "any workspace"; `agent list`: "across all workspaces/tabs"). The user verified live that `pane move --new-tab` and `tab new` always move focus to the new tab; neither accepts `--no-focus` (see proposal for why the upstream flag is out of scope).

The extension's user config is `config.json` in the package root (`config.json.example` ships `{"status": {"enabled": true}}`), loaded by `loadStatusConfig()` in `status.ts`. Slash commands are registered in the same extension factory (`pi.registerCommand("iterate" ...)`, `pi.registerCommand("subagent" ...)`).

## Goals / Non-Goals

**Goals:**
- Let a subagent open in its own workspace tab instead of splitting the caller's pane, without leaving focus on the new tab.
- Let the user pick the default placement live from the TUI and persist it.
- Let the calling model override placement per spawn.

**Non-Goals:**
- A dedicated "subagents" tab holding several subagent panes (`pane move --tab <n>` makes this possible later; not built now).
- Focus-stealing as a feature (fire-and-forget contract: never leave the user's keyboard on a subagent).
- Changes to `subagent_fork` (uses Luvus-native `agent fork --no-focus`; no `createSurface` involvement).
- A `--no-focus` flag in Luvus itself (user is not filing the upstream request).

## Decisions

- **Tab placement = split + move + restore, not `tab new`.** `pane split --no-focus` is the only focus-free creation primitive. `tab new` neither supports `--no-focus` nor returns the pane id of the pane to run commands in. Sequence: `pane split $LUVUS_PANE_ID --no-focus` → `pane name <slug> --pane <id>` → `pane move <id> --new-tab` → `tab focus <callerTab>`. Alternative rejected: `tab new` then `pane list` in the new tab to find its pane — requires the focus jump first and a second discovery call.
- **Caller tab from `agent list`.** Before moving, find the `agent list` entry whose `pane` equals `$LUVUS_PANE_ID` and read its `tab` field (verified live: the caller appears with `tab` and `focused` fields). Alternative rejected: `tab list`'s active tab — the caller's tab is not necessarily the active one while the orchestrator works. If the caller is not found, skip the move entirely and keep the pane placement (a pane is always correct; a tab we cannot navigate back from is not).
- **Focus restore is best-effort.** `tab focus <callerTab>` failure is swallowed (like the cosmetic `pane name` step today); the spawn itself still succeeds. The window between move and restore is a few CLI round-trips; a user refocusing another tab in that window could get yanked back — accepted, noted with a `ponytail:` comment in `createSurface`.
- **Placement resolution order:** tool `surface` param → `config.json` `surface` key → `"pane"`. Invalid values at any level fall through to the next rung. The `surface` config key lives in the package `config.json` (pattern already used by `status.enabled`); known limitation: reinstalling the package can reset it.
- **Tool schema:** optional `Type.Union([Type.Literal("pane"), Type.Literal("tab")])` on `subagent` and `subagent_resume`, threaded through `runSpawn`'s options (which already carry `options.surface` for pre-created parallel surfaces — reuse that channel rather than adding a parallel one).
- **No changes to completion detection or closing.** `pollForExit`, `readScreen`, `agentPrompt`, and `closeSurface` all take the pane id; a tab-hosted pane behaves identically.

## Risks / Trade-offs

- [Focus flicker on every tab spawn] → focus is restored immediately after the move; the flicker is one rendering frame plus CLI latency. Documented in the tool description so models know tab placement is still non-intrusive.
- [Restore race: user focuses another tab between move and restore] → tiny window (sequential CLI calls); accepted with a `ponytail:` comment naming the fix (upstream `focus:false` on `tab.new`).
- [`agent list` grows large with many panes] → one extra CLI call per tab spawn; negligible next to the launch itself.
- [`pane move --new-tab` result shape unverified] → task 2 includes a live spike to confirm the move succeeds and the pane id stays valid; if the move reports an error, fall back to pane placement rather than failing the spawn.

## Migration Plan

No data or API migration. Default stays `pane`, so existing users see no change until they run `/subagent-surface tab` or add the config key. Rollback: remove the config key or toggle back; the tool param is additive and ignored by older behavior.

## Open Questions

None. Placement mechanics verified against the installed Luvus CLI and docs; `pane move --new-tab` result handling is covered by the spike task and the fallback.
