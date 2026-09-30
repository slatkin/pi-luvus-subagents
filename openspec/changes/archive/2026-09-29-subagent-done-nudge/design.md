# Design

## Context

Our `pi-extension/subagents/subagent-done.ts` runs inside every child session. Its `agent_end` handler currently short-circuits: when `PI_SUBAGENT_AUTO_EXIT=1` and the last assistant message did not abort, it writes the `done` (or error) `.exit` sidecar and the session ends without the model ever calling `subagent_done`. Agents without auto-exit have no fallback — a forgotten `subagent_done` means the child idles in `waiting` until the parent's stalled watchdog fires. maplezzk's `pi-interactive-subagents` (the variant the user previously ran) solved this with a child-side completion nudge and by removing the auto-exit short-circuit entirely; his header comment documents the motivation (auto-exit also bypassed structured-output handling in his tree). His `index.ts` keeps parsing `auto-exit` frontmatter, deriving `interactive` from it, and setting `PI_SUBAGENT_AUTO_EXIT=1` — only the child-side `agent_end` behavior changed. Our fork shares this structure, so the port is surgical.

Reference sources: `subagent-done.ts` and `test/subagent-done-nudge.test.ts` at `github.com/maplezzk/pi-extensions` (main, packages/pi-interactive-subagents).

## Goals / Non-Goals

**Goals:**
- Every sub-agent reliably reaches completion: explicit `subagent_done` / `caller_ping`, backed by a self-nudge when forgotten.
- Port maplezzk's nudge semantics faithfully (delay, cancellation paths, error/abort exclusion).
- Keep fast provider-failure surfacing via the error `.exit` sidecar.

**Non-Goals:**
- No i18n layer (maplezzk routes the nudge text through his `pi-extensions-i18n` catalog; we inline English text).
- No changes to parent-side completion detection, polling, or the stalled watchdog (`luvus-backend` spec untouched).
- No change to `interactive` derivation, resume defaults, or frontmatter parsing.

## Decisions

- **Remove the auto-exit success path, keep the error path (deviation from maplezzk).** maplezzk's `agent_end` writes nothing at all — provider errors surface only via his stalled watchdog, minutes later. Our fork has documented, tested error-sidecar behavior (`interpretExitSidecar` `type: "error"`, "auto-retry exhausted" reporting, parent woken with the failure). The port keeps `shouldAutoExitOnAgentEnd`'s error semantics but only for `stopReason === "error"`: the `agent_end` handler writes the error sidecar when `findLatestAssistantError` reports one, and never writes `done` on its own. Alternative considered (faithful removal of both paths) rejected — it would regress failure latency and contradict our `luvus-backend` completion behavior.
- **Nudge state machine, ported as-is:** `doneCalled` flag set by both `subagent_done` and `caller_ping`; pending timer replaced on every `agent_end`; `scheduleAgentEndNudge()` fires `pi.sendUserMessage(text, { deliverAs: "followUp" })` after `NUDGE_DELAY_MS` unless `doneCalled`, `userInputAfterAgentEnd`, or `NUDGE_DISABLE=1`; cancellation on `input`, `before_agent_start`, `agent_start`, `session_shutdown`; `agent_start` also resets `userInputAfterAgentEnd`. Delay: `max(1000, PI_SUBAGENT_NUDGE_DELAY_MS ?? 5000)`.
- **Nudge text inlined in English** (no i18n dependency): "[Auto reminder] • Done → call subagent_done to finish. • Before finishing, self-check: are you spinning in place? If so, converge your result immediately and hand it back to the main agent with caller_ping — don't overthink. • Still working → ignore."
- **`shouldScheduleAgentEndNudge(messages)` exported** as the pure decision function (last assistant message `stopReason === "stop"`), mirroring maplezzk's testable surface; port his 4 nudge tests and add cancellation-condition tests.
- **`shouldAutoExitOnAgentEnd` stays exported** but becomes unused by the extension (maplezzk keeps it "for callers that still use this helper"); its existing unit tests stay. If nothing consumes it after the port, it can be deleted in a later cleanup — not now.
- **Tighten the `modeHint` for auto-exit agents (small deliberate improvement):** "Complete your task autonomously." becomes "Complete your task autonomously. Call subagent_done when finished." maplezzk kept the old wording and lets the nudge catch the gap; telling the agent up front is cheaper than a guaranteed 5s nudge round-trip per spawn. The non-auto-exit hint already names the tool.
- **`claude-code` (cli: claude) unaffected:** its completion flows through the sentinel/plugin path, not the child pi extension.

## Risks / Trade-offs

- [Behavior change for the five bundled `auto-exit: true` agents — sessions now stay open after the final turn until the model calls `subagent_done`] → modeHint now names the tool for these agents; nudge covers forgetting. Worst-case latency per spawn grows by the nudge delay (5s) when the model forgets.
- [Models may treat the nudge as license to keep working instead of finishing] → the nudge text explicitly says "Still working → ignore", matching maplezzk's field-tested wording.
- [Timer-based delivery depends on the child process being alive and idle] → same assumption maplezzk ships; the stalled watchdog remains the backstop for a hung child.

## Migration Plan

No data migration. Deploy is a package update; existing running children keep old behavior until respawned. Rollback: revert the commit. Users who preferred silent auto-exit can approximate it by relying on the nudge (the model exits on the reminder); a hard toggle is not provided (maplezzk ships none beyond `PI_SUBAGENT_NUDGE_DISABLE`).

## Open Questions

None.
