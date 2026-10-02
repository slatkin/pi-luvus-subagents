# Tasks

## 1. Implementation

- [ ] 1.1 Restore the `agent_end` auto-exit path in `pi-extension/subagents/subagent-done.ts`: after the error-sidecar branch, when `PI_SUBAGENT_AUTO_EXIT=1`, the user has not taken over, and the latest assistant message did not end with `stopReason: "aborted"`, write the `done` `.exit` sidecar, record `agentEndDone`, and shut the session down; remove the `void autoExit` stub and re-activate `userTookOver`.

## 2. Tests

- [ ] 2.1 Unit tests in `test/test.ts`: auto-exit agent's normal stop writes the `done` sidecar and shuts down; aborted stop does not; user-taken-over session does not (falls through to nudge); non-auto-exit session keeps the nudge path.

## 3. Docs

- [ ] 3.1 Update `README.md` auto-exit sections (`auto-exit` frontmatter row, "auto-exit and the completion nudge") to describe the restored behavior: auto-exit agents exit on `agent_end`; user takeover keeps the session open; nudge remains the backstop for everyone else.

## 4. Verification

- [ ] 4.1 `npm test` green; `npx tsc --noEmit` clean.
