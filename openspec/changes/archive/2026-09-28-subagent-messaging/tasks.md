# Tasks

Prerequisite: `luvus-only-backend` is applied.

## 1. Live Luvus checks (inside a Luvus pane)

- [x] 1.1 In a split pane running `pi`, run `$LUVUS_BIN_PATH agent prompt <pane> "<text>"` in four cases: (a) pi idle, (b) pi streaming, (c) text containing a newline, (d) the target composer holding an unsent draft. Record in design.md Risks, for each case, whether the text arrives as one prompt, whether it is queued or rejected, and what happens to the draft. Apply the documented fallback if (c) or (d) fails. (Done: (d) failed, resolved in design Decision 8 and task 2.4.)

## 2. Roster and addressing

- [x] 2.1 Add `agentPrompt(pane, text)` to `luvus.ts`. It calls `agent prompt` via `luvus()` with no `--wait`. Add a unit test with a stub `LUVUS_BIN_PATH` covering the queued answer and an `agent_not_ready` error. Verify with `npm test`.
- [x] 2.2 In `index.ts`, write `<artifactDir>/subagent-roster.json` atomically whenever `runningSubagents` gains or loses an entry (spawn, resume, exit, abort). Add `PI_SUBAGENT_PARENT_ROSTER` to both the spawn and resume env builders. Verify with a unit test that the roster matches the map after add and remove, and that both env builders include the var.
- [x] 2.3 Implement target resolution (design Decision 4) as a pure function over `{ hasParent, ownChildren, parentRoster, selfId, to }`. Verify with unit tests covering parent, child, sibling, self excluded, finished/unknown (error lists reachable names), ambiguous name, exact id, and no parent.
- [x] 2.4 Implement design Decision 8. The child appends JSON lines to `<PI_SUBAGENT_SESSION>.msg`. The parent's per-child `onTick` injects complete lines as steer messages and tracks the byte offset, then drains and deletes the file after `pollForExit` returns and before building the result. Verify with unit tests that a partial trailing line is held until complete, that a message written just before the `.exit` file is delivered before the completion, and that nothing is sent through `agentPrompt` for the `parent` target.

## 3. Tool and agent guidance

- [x] 3.1 Register `subagent_message` (schema-validated `to` and non-empty `message`), build the header (Decision 5), send with `agentPrompt` (children/siblings) or the Decision 8 message file (`parent`), and return the async-delivery result or the Luvus error without retrying. Verify with unit tests that the header is correct for each relation and that the empty-message case is rejected.
- [x] 3.2 Add the reachable-targets line to the pi launch prompt, and update the `caller_ping`/`subagent_done` descriptions to say they end the session while `subagent_message` does not. Verify with a unit test that a child spawned while a sibling runs gets `parent` and the sibling's name in its prompt.
- [x] 3.3 Add the "Talking to other agents" note to each `agents/*.md` and a messaging section to the README. Verify that `grep -l subagent_message agents/*.md README.md` lists every file.

## 4. End-to-end check

- [x] 4.1 Inside Luvus, spawn "Worker" and "Reviewer" from one parent. Have the parent message Worker mid-task, Worker message Reviewer, and Reviewer message `parent` while an unsent draft sits in the parent's composer. Confirm that each recipient sees the headed message, that the parent's draft is untouched and unsent, that no session exits, and that sending to a finished subagent returns the reachable-targets error. (Done live 2026-09-28: parent↔Worker, Worker→Reviewer and Alpha→Beta sibling delivery all showed the headed message; the parent's composer kept `DRAFT_E2E_MARKER` through an incoming child message; a finished target returned `No reachable agent named "Worker". Reachable: (none).`)
