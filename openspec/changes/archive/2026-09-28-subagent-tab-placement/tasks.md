# Tasks

## 1. Surface placement resolution

- [x] 1.1 Add the `surface` key to `config.json.example` (`"surface": "pane"`) with a comment-equivalent note in the README, and extend the config loader so a `surface` value of `"pane"` or `"tab"` is exposed alongside `status.enabled`; invalid values resolve to `"pane"`. Verify: unit test reading a temp config with `"surface": "tab"`, `"surface": "junk"`, and no key yields `tab` / `pane` / `pane`.
- [x] 1.2 Add the optional `surface` parameter (`"pane" | "tab"`) to the `subagent` and `subagent_resume` tool schemas in `pi-extension/subagents/index.ts`, thread it through `runSpawn`'s existing `options.surface` channel, and implement the resolution `tool param > config default > "pane"` (invalid tool values treated as absent). Verify: unit test over the resolution function covering override-wins, config-used, invalid-param-falls-back.

## 2. Tab placement in createSurface

- [x] 2.1 Spike (live, in Luvus): run `pane split $LUVUS_PANE_ID --no-focus`, `pane move <id> --new-tab`, `tab focus <callerTab>` against the running Luvus and confirm the move succeeds, the pane id stays valid for `pane run`/`pane read`, and focus returns to the caller's tab. Record the `pane move` result shape (does it echo the pane id?).
- [x] 2.2 Implement the tab path in `createSurface(name, placement)` in `pi-extension/subagents/luvus.ts`: look up the caller's tab from `agent list` (entry with `pane === $LUVUS_PANE_ID`) before anything else; on `placement === "tab"` and a found caller tab, run `pane move <id> --new-tab` then best-effort `tab focus <callerTab>` (swallow restore errors, `ponytail:` comment on the refocus race); if the caller tab is unknown or the move fails, keep the pane placement. Verify: unit test with a stubbed `luvus` command runner covering tab-placed, unknown-caller-falls-back-to-pane, and move-failure-falls-back-to-pane; existing surface tests still pass (`npm test`).
- [x] 2.3 Update the `subagent` and `subagent_resume` tool descriptions to mention the optional `surface` parameter and that tab placement still does not steal focus (focus is restored). Verify: tool schema validates and the description text appears in the registered tools.

## 3. Slash command

- [x] 3.1 Register `/subagent-surface` in `pi-extension/subagents/index.ts`: no argument prints the current default; `tab` or `pane` sets the in-memory default, persists it to `config.json`, and notifies the user; any other argument prints the current default plus accepted values without changing anything. Verify: unit test over the handler logic (stubbed config store) for set, show, and invalid-arg cases; manual check in a Luvus pane that `/subagent-surface tab` confirms and survives a pi restart.
- [x] 3.2 Update `config.json.example` and the README so the new key and command are documented. Verify: example parses as JSON and README section exists.

## 4. Verification

- [x] 4.1 Run the verification suite. Revised scope per user (2026-09-28): the LLM-backed `subagent-lifecycle` suite is vetoed — it burns provider tokens spawning real models and hung without an Anthropic credential. Verification instead: `npm test` unit suite 143/143 (config parsing, placement resolution, stubbed createSurface tab paths, slash command, tool schemas), `mux-surface` integration 7/7 against live Luvus (no LLM calls), and the manual live spike from task 2.1 (split → `pane move --new-tab` → `tab focus` restore → `pane run`/`close`, no model calls).