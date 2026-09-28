# Design

## Context

Built on `luvus-only-backend`. After that change, every running subagent has a Luvus pane id (`RunningSubagent.surface`), and `luvus.ts` has a `luvus(args)` helper that runs `$LUVUS_BIN_PATH` without a shell and unwraps `.result`/`.error`. The parent tracks its children in memory (`runningSubagents`). Children see only their own `PI_SUBAGENT_*` env vars (`NAME`, `ID`, `SESSION`, `SURFACE`, …), and inside the child's pane Luvus sets `LUVUS_PANE_ID` to the child's own pane. The child also loads the subagents extension, so it can have children of its own.

Findings from the bundled Luvus skill: `agent prompt <target> <text>` resolves a target, checks readiness, and queues the text atomically. Without `--wait` it answers `submitted: true, evidence: "queued"`. For panes showing a blocked prompt it answers `agent_not_ready`, and the skill forbids automatic resends. The skill's own delegation pattern is to name the caller and ask the worker to `agent send lead '...'` back, which is the same fire-and-forget pattern used here.

## Goals / Non-Goals

**Goals:**
- One new tool, one roster file per parent, one new child env var, and one message file per child that the parent's existing poll loop reads. No daemon, socket or per-agent inbox watcher.

**Non-Goals:**
- Guaranteed delivery or read receipts. "Queued" is the only promise, as it is in Luvus.
- Structured payloads. Messages are plain text.
- Luvus `task`/`lease` coordination and `wait` APIs, which could be a later change.

## Decisions

1. **Transport is `agent prompt <paneId> <header+text>`**, called through the existing `luvus()` helper as a new `agentPrompt(pane, text)` in `luvus.ts`. The target is always the numeric pane id, never a name, because Luvus names are global to the session and two trees can both contain a "Scout". Rejected alternative: a mailbox file plus `pi.sendMessage(steer)` in the receiver. It is pi-only, invisible in the pane, and needs a watcher in every agent. The user chose the Luvus route. **Exception:** the `parent` target uses Decision 8, because `agent prompt` clobbers the parent's unsent draft (task 1.1, case d).

2. **Roster file per parent.** Each agent with running children writes `<artifactDir>/subagent-roster.json`. It contains `{ parentPane, parentName, children: [{ id, name, pane, cli }] }` and is rewritten atomically (temp file + rename) whenever a child is added to or removed from `runningSubagents`, on both the spawn and resume paths. The in-memory map stays the source of truth for the parent itself, and the file only mirrors it for the children. Rejected alternative: asking Luvus `agent list` and filtering. Luvus knows nothing about the tree, and names are ambiguous.

3. **Child env var.** The spawn and resume launchers add `PI_SUBAGENT_PARENT_ROSTER` (the parent's roster path). No other new env var is needed: `PI_SUBAGENT_ID`/`NAME` give the child's identity, and `PI_SUBAGENT_SESSION` locates the parent-message file (Decision 8). The parent pane id is not needed, since nothing is typed into the parent's pane.

4. **Resolution happens in the sender, fresh on every call.**
   - `parent` → the Decision 8 message file. If `PI_SUBAGENT_SESSION` is unset, the error is "this agent has no parent".
   - Otherwise, match `to` against the sender's own `runningSubagents`, where these are children, then against the parent roster's children minus the sender's own `PI_SUBAGENT_ID`, where these are siblings. Match an exact id first, then the name. Name matching reuses the logic of `resolveInterruptTarget`, including its ambiguity error.
   - No match returns an error listing `parent` (if one exists), the child names and the sibling names.

5. **Header.** `[subagent message from <sender> (<relation>)]\n<message>`. The sender is `PI_SUBAGENT_NAME`, or `parent` for the top-level agent. The relation is how the sender stands to the receiver: `child`, `sibling`, or omitted when the sender is the receiver's parent, which gives `[subagent message from parent]`. The header is computed by the sender, since that's the only side that knows the relation.

6. **Tool wiring.** `subagent_message` is registered in `index.ts` next to `subagent_interrupt`, so every pi agent, top-level or child, gets it. `subagent_done`/`caller_ping` stay in `subagent-done.ts`, and only their descriptions change. The tool is not registered when `isMuxAvailable()` is false, matching how the other tools refuse to run outside Luvus.

7. **Telling the agents.** Three places:
   - The launch prompt gets one line built from the roster at spawn time: "You can message `parent`, `Worker` with subagent_message; it does not end your session." Siblings started later are discovered through the tool's error listing.
   - The tool descriptions say which tool ends the session and which doesn't.
   - `agents/*.md` get a two-line "Talking to other agents" note. The prose stays short because the tool description does the heavy lifting.

8. **Child → parent goes through the existing poll loop, not the parent's pane.**
   - The child appends one JSON line `{"header": "...", "message": "..."}\n` to `<PI_SUBAGENT_SESSION>.msg` with a single `appendFileSync` call.
   - The parent's per-child poll in `index.ts` (the `onTick` of `pollForExit`) reads from a byte offset it keeps per child, consumes only complete lines, and injects each one with `pi.sendMessage(..., { triggerTurn: true, deliverAs: "steer" })`, the same shape as the existing completion notifications.
   - When `pollForExit` returns, the parent drains the file once more before building the completion result, then deletes it. `luvus.ts` doesn't change.
   - This works the same one level down, because a child with its own children runs the same loop.
   - Rejected alternatives: `agent prompt` into the parent pane, because of the live draft clobbering in task 1.1 (d); per-agent inboxes for every target, which the user declined; and reading the composer before typing, which is fragile screen scraping.
   - Known limit: children and siblings still get `agent prompt`, so a draft typed into a child pane can still be clobbered. The user accepted this, since the parent pane is where people type.

## Risks / Trade-offs

- [`agent prompt` into the parent's pane while the user is typing a draft there could merge with or submit the draft] → **CONFIRMED at task 1.1 (2026-09-28)**: the draft is concatenated with the incoming text and the merged result is submitted (see live results below). **Resolved by Decision 8**: parent-bound messages never touch the parent's pane, and the spec's "Messages to the parent bypass the parent's composer" requirement covers this. The same collision in a child pane the user took over remains a known limit.
- [Multi-line text may be submitted line by line] → **RULED OUT at task 1.1**: embedded newlines arrive as one multi-line prompt.
- [A pi target that is busy streaming may queue or reject the prompt] → **CONFIRMED at task 1.1**: Luvus answered `submitted:true, evidence:"queued"` and pi surfaced the text as a steering message inside the running turn.

### Live results (task 1.1, 2026-09-28)

Run in a split pane (`pi` v0.87.1, `opencode-go/muse-spark-1.3-contributor`) on Luvus, `agent prompt <pane> <text>` without `--wait`. Every case returned `submitted:true, evidence:"queued"`; none was rejected.

| Case | Luvus status | Arrival | Draft |
| --- | --- | --- | --- |
| (a) pi idle | `idle` | one prompt, one turn | n/a |
| (b) pi streaming | `idle` (stale — Luvus does not see pi's `working` state) | queued as a **steering message** for the running turn, not rejected | n/a |
| (c) text containing newlines | `idle` | one multi-line prompt; the model counted all three embedded lines | n/a |
| (d) unsent draft in composer | `idle` | `agent prompt` types into the existing composer and presses Enter, so the draft is **concatenated with no separator and the merged text is submitted** as one message | draft is not preserved; it is sent to the model as part of the message |

(c) needs no fallback. (d) fails the "does not disturb the draft" bar and triggers the documented fallback; see Decision 8.

### Remaining trade-offs

- [Stale roster after the parent crashes] → a send to a dead pane fails with the Luvus error, and the spec says not to retry. That is acceptable.
- [Message loops between agents] → nothing prevents two agents from ping-ponging. Accept this for v1. The tool description tells agents not to acknowledge acknowledgements.
- [Spoofing: any pane can type a fake header] → this is the Luvus trust model, noted in the proposal. No mitigation in scope.

## Migration Plan

This is additive, so there is nothing to migrate. It must land after `luvus-only-backend`.
