# Design

## Context

The 2026-09-30 nudge change (ported from maplezzk) removed the child-side auto-exit short-circuit: `agent_end` never writes a `done` `.exit` sidecar on its own. Completion now relies on the model calling `subagent_done` (prompted by a nudge ~5s after the last turn) plus a parent-side idle watchdog as backstop. The owner has reversed the underlying product decision: agents with `auto-exit: true` should exit as soon as their turn completes.

The restoration is surgical because the nudge change deliberately kept the old implementation exported and tested (`shouldAutoExitOnAgentEnd`, its unit tests, the `PI_SUBAGENT_AUTO_EXIT` parsing, and the `userTookOver` state).

## Decisions

- **Restore the done sidecar on `agent_end` for auto-exit sessions.** Order of checks stays: (1) error path (`findLatestAssistantError` → error sidecar, shutdown) unchanged; (2) restored auto-exit path: `PI_SUBAGENT_AUTO_EXIT=1` AND latest assistant message stopReason ≠ `"aborted"` → `done` sidecar, shutdown; (3) otherwise the nudge path. `shouldAutoExitOnAgentEnd` returns true for `stopReason: "error"`, but the error branch precedes it, so error semantics are untouched.
- **Gate on user takeover.** README has always documented "if the user sends any input, auto-exit is permanently disabled and the user takes over the session." The old `shouldAutoExitOnAgentEnd` ignored its `_userTookOver` param and the `userTookOver` flag was dead state; the restore wires the flag into the gate so the documented behavior is real: a taken-over session falls through to the nudge path and stays open.
- **Nudge unchanged.** For non-auto-exit agents (and taken-over auto-exit agents) the nudge and the parent watchdog are unchanged. The auto-exit `modeHint` wording ("Call subagent_done when finished") is kept — it is harmless when the model does call the tool and still correct when a user takes over.
- **Parent-side idle watchdog unchanged.** It only fires for non-interactive children stuck in `waiting`; an auto-exit child that exits on `agent_end` never reaches it.

## Risks / Trade-offs

- [Auto-exit exits on the final assistant message without giving the model a chance to add a closing summary] → accepted; this is the pre-nudge behavior the owner wants back. The summary instruction ("Your FINAL assistant message should summarize...") still shapes the last message.
- [A user typing into the pane mid-turn no longer disables auto-exit until the turn ends] → takeover is evaluated at `agent_end`; input during an active turn is followed by the turn's own `agent_end`, where the flag is already set. Matches pre-nudge behavior.
- [Rollback] → revert the change commit; the nudge path is untouched, so rollback restores today's behavior exactly.

## Migration Plan

Package update only. Running children keep old behavior until respawned. The `subagent-completion` spec delta is applied at archive.

## Open Questions

None.
