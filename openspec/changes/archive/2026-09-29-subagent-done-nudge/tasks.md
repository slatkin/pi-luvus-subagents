# Tasks

## 1. Nudge state machine in subagent-done.ts

- [x] 1.1 Add `shouldScheduleAgentEndNudge(messages)`: returns true only when the latest assistant message has `stopReason: "stop"`. Verify: port maplezzk's 4 unit tests (stop/error/aborted/length) in `test/test.ts`; all pass.
- [x] 1.2 Add the nudge machinery: `NUDGE_DELAY_MS` (`max(1000, PI_SUBAGENT_NUDGE_DELAY_MS ?? 5000)`), `NUDGE_DISABLE`, `doneCalled`, `userInputAfterAgentEnd`, `agentStarted`, `nudgeTimer`, `clearNudgeTimer`, `scheduleAgentEndNudge` (fires `pi.sendUserMessage` with `deliverAs: "followUp"`), and the `input` / `before_agent_start` / `agent_start` / `session_shutdown` cancel paths (input after first agent run also marks `userTookOver`). Verify: unit tests covering pending-nudge cancellation on user input, new agent cycle, and done/ping (`doneCalled`); `npm test` green.
- [x] 1.3 Rewire the `agent_end` handler: remove the `autoExit && shouldAutoExitOnAgentEnd(...)` done-exit branch; instead schedule/clear the nudge via `shouldScheduleAgentEndNudge`; keep the error sidecar write when `findLatestAssistantError` reports `stopReason: "error"`. Verify: unit test that a normal stop does not write `.exit` and an error stop still writes the error sidecar (stubbed `writeFileSync`/session env); existing `subagent-done.ts` tests still pass.
- [x] 1.4 Set `doneCalled` and clear the nudge timer inside the `subagent_done` and `caller_ping` executors before writing the sidecar. Verify: unit test that executing `subagent_done` marks done (no nudge fires afterwards).

## 2. Parent-side wording

- [x] 2.1 In `pi-extension/subagents/index.ts`, change the auto-exit `modeHint` to `"Complete your task autonomously. Call subagent_done when finished."` (non-auto-exit hint unchanged). Verify: unit test asserting the injected task prompt contains the tool call instruction for an `auto-exit: true` agent.

## 3. Docs

- [x] 3.1 Update the README: rewrite the `auto-exit` section (no longer auto-terminates; shapes `interactive` default and task hint only; `subagent_done`/nudge now the exit path for all agents) and document the nudge (`PI_SUBAGENT_NUDGE_DELAY_MS`, `PI_SUBAGENT_NUDGE_DISABLE`, cancellation behavior). Verify: README section reads accurately against the implementation; no stale "auto-shutdown on agent_end" claims remain.

## 4. Verification

- [x] 4.1 Run `npm test` (full unit suite) — all green. Then one live check inside Luvus: spawn a bare subagent (no agent defs) with a trivial task, confirm it finishes, receives the nudge when it forgets `subagent_done`, calls it, and the parent gets the result. Verify: suite green and the live spawn observed end-to-end.
