# Restore auto-exit

## Why

The `2026-09-30-subagent-done-nudge` change removed the child-side auto-exit path (the `agent_end` handler writing the `done` `.exit` sidecar for `auto-exit: true` agents). The owner wants it back: agents should exit themselves when their task's turn completes, not wait on a nudge round-trip or the parent's idle watchdog. The restoration is cheap because the implementation (`shouldAutoExitOnAgentEnd`), its semantics, and its tests were deliberately kept by that change.

## What Changes

- `subagent-done.ts` restores the `agent_end` auto-exit path: when `PI_SUBAGENT_AUTO_EXIT=1` and the latest assistant message did not end with `stopReason: "aborted"`, write the `done` `.exit` sidecar and shut the session down.
- User takeover is restored per the README contract: input from the user after the first agent run keeps the session open (auto-exit does not fire for a taken-over session).
- The error `.exit` sidecar path is unchanged and still runs first.
- The completion nudge and the parent-side idle watchdog stay unchanged as backstops for agents without `auto-exit` and for taken-over sessions.
- The `subagent-completion` spec's "Explicit exit only" requirement is modified to allow the auto-exit exit path again; the nudge requirement is scoped to sessions that remain open.

## Impact

- Specs: `openspec/specs/subagent-completion/spec.md` (two modified requirements)
- Code: `pi-extension/subagents/subagent-done.ts`
- Docs: `README.md` auto-exit sections
- Tests: `test/test.ts` (existing `shouldAutoExitOnAgentEnd` tests remain valid; add takeover-gate coverage)
