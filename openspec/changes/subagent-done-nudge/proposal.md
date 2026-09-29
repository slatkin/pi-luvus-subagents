# Proposal

## Why

Sub-agents without `auto-exit: true` (bare spawns, interactive agents like `planner`, `/iterate` forks) rely entirely on the model remembering to call `subagent_done`. When it forgets, the child sits in `waiting` forever and the parent only learns about it through the stalled watchdog — minutes later, with no summary. maplezzk's `pi-interactive-subagents` (the variant the user ran before this fork) solves this with a self-nudge: after a normal turn end without `subagent_done`, the child extension reminds itself to finish. The user wants that behavior ported, including maplezzk's removal of the auto-exit short-circuit.

## What Changes

- Port the **completion nudge** from maplezzk: when a child's turn ends normally (`stopReason === "stop"`) and `subagent_done` has not been called, the child extension schedules a follow-up message (default 5s, `PI_SUBAGENT_NUDGE_DELAY_MS`, disable with `PI_SUBAGENT_NUDGE_DISABLE=1`) reminding the agent to call `subagent_done` — or `caller_ping` if it is spinning in place. New agent activity, user input, or a done/ping call cancels the pending nudge.
- Remove the **auto-exit short-circuit**: `agent_end` no longer writes a `done` `.exit` sidecar on its own, regardless of `PI_SUBAGENT_AUTO_EXIT`. Explicit `subagent_done` / `caller_ping` becomes the only success-path exit, for every agent.
- Keep the **error-exit path**: `agent_end` still writes the error `.exit` sidecar when the turn ended with `stopReason === "error"`, so the parent learns about provider failures promptly (deliberate deviation from maplezzk, who dropped this and leans on the stalled watchdog).
- Frontmatter `auto-exit`, the `PI_SUBAGENT_AUTO_EXIT` env var, `interactive` derivation from `auto-exit`, and the modeHint/summary wording keep working unchanged as metadata — they just no longer trigger an automatic exit.
- README updated: auto-exit section rewritten (it now only shapes `interactive` defaults and mode hints), nudge documented.

## Capabilities

### New Capabilities

- `subagent-completion`: How a sub-agent session reliably reaches completion — explicit `subagent_done`/`caller_ping` as the only success-path exit, and the child-side completion nudge that recovers forgotten exits.

### Modified Capabilities

- *(none — parent-side completion detection in `luvus-backend` is unchanged; auto-exit was never spec'd)*

## Impact

- `pi-extension/subagents/subagent-done.ts`: the bulk of the port — nudge state machine on `agent_end`/`input`/`before_agent_start`/`agent_start`/`session_shutdown`, removal of the auto-exit branch in the `agent_end` handler, `doneCalled` flags in the `subagent_done`/`caller_ping` executors, `shouldScheduleAgentEndNudge` exported for tests. `shouldAutoExitOnAgentEnd` stays exported (now unused by the extension) for compatibility, as maplezzk does.
- `pi-extension/subagents/index.ts`: unchanged except optionally tightening the `modeHint` for `auto-exit` agents to also mention calling `subagent_done` (reduces nudge round-trips).
- Behavior change for every agent with `auto-exit: true`: the turn no longer ends the session silently — the model must call `subagent_done` (nudge backs it up). Bundled agents affected: `scout`, `worker`, `reviewer`, `visual-tester`, `claude-code` (claude-code uses the sentinel path and is unaffected).
- Risk watch: any workflow that depended on auto-exit's guaranteed fast exit now depends on model compliance + nudge latency (~5s worst case per spawn).
