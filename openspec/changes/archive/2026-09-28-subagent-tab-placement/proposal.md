# Proposal

## Why

Subagents always open as a split of the caller's pane. When several run in parallel, the caller's pane shrinks into a sliver and the user loses the workspace they were working in. Luvus supports tabs, but every tab-creating CLI surface (`tab new`, `pane move --new-tab`) steals keyboard focus, so the extension cannot simply switch mechanisms — the placement needs to become a deliberate, user-controllable option with a focus-restoring tab path built on the existing split primitive.

## What Changes

- Add a placement choice for subagent surfaces: **pane** (today's behavior) or **tab** (the subagent gets its own workspace tab, caller pane untouched).
- Extend `createSurface` with a tab path: split with `--no-focus` as today, then `pane move <id> --new-tab`, then restore focus to the caller's tab. If the caller's tab cannot be determined from `agent list`, fall back to plain pane placement.
- Accept an optional `surface` parameter (`"pane"` | `"tab"`) on the `subagent` and `subagent_resume` tools for per-call override.
- Read a `surface` default from the package `config.json` (same file that already holds `status.enabled`), persisted there.
- Add a `/subagent-surface` slash command to show and change the default live; changes are written back to `config.json` so they survive restart.
- Resolution order: tool param > config.json default > `"pane"`.

## Capabilities

### New Capabilities

- `subagent-surface`: How the subagent surface placement choice is resolved (config default, slash-command UI, per-call tool override) and persisted.

### Modified Capabilities

- `luvus-backend`: The "Subagent pane creation" requirement changes — spawning or resuming can now place the new pane in its own tab via split + `pane move --new-tab` + focus restore, with pane placement as the default and the fallback when the caller's tab is unknown.

## Impact

- `pi-extension/subagents/luvus.ts`: `createSurface` gains the placement parameter and the tab sequence (split, name, move, focus restore).
- `pi-extension/subagents/index.ts`: `subagent` and `subagent_resume` tool schemas gain the optional `surface` param; a new `/subagent-surface` command is registered beside `/subagent` and `/iterate`; the resolved placement is threaded into `runSpawn` and the resume path.
- `config.json.example` gains the new `surface` key; `config.json` (user-created) gains it on first toggle or manual edit.
- Existing specs/behavior: default remains pane placement, so current users see no change unless they opt in. Downstream machinery (`pane run`, `pane read`, `agent prompt`, polling, exit sidecars, `pane close`) is pane-id-based and works unchanged for tab-hosted panes.
