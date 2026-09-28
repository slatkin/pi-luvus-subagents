# Proposal

## Why

Upstream subagents can talk to each other only in coarse, one-way steps. A child reports by exiting, through `subagent_done` or `caller_ping`, the latter of which ends the child's session. A parent reaches a child only by interrupting it or resuming it after it exits. Siblings cannot reach each other at all. So a parent can't redirect a scout that is still working, a worker can't hand a finding to a reviewer running beside it, and a child can't ask a quick question without giving up its session. Luvus already delivers text to a named agent pane in one atomic step (`agent prompt`), with readiness checks. This change gives pi agents a tool on top of that, and tells them the tool exists.

Depends on `luvus-only-backend` (the Luvus CLI helper, `$LUVUS_BIN_PATH`, pane ids per subagent).

## What Changes

- New `subagent_message` tool, available to every pi agent in a subagent tree. It sends a text message to the parent, to one of the caller's own running children, or to a running sibling (another child of the same parent). It is fire-and-forget: it returns once Luvus has queued the message, and any reply arrives later as a new message.
- Messages to children and siblings reach the target as input in its pane via Luvus `agent prompt`, with a header naming the sender. The receiver sees them like user input and can answer with `subagent_message`. Messages to the parent go through a per-child message file that the parent's existing poll loop injects as a steering message. That keeps them from merging with the user's unsent draft in the parent's composer, which `agent prompt` does (confirmed live).
- Each parent keeps a roster of its running children. Children learn their parent's pane and roster location from the environment at spawn, so they can resolve siblings by name.
- The child's launch prompt lists who it can message. The descriptions of `subagent_message`, `caller_ping` and `subagent_done` explain when to use each. The bundled agent definitions (`agents/*.md`) get a short messaging section.
- Claude Code subagents can receive messages (Luvus delivers them to any agent kind) but get no sending tool.
- Deliberately excluded: waiting for a reply, messaging agents outside the tree, and messaging finished subagents (use `subagent_resume`).

## Capabilities

### New Capabilities
- `subagent-messaging`: addressing, delivery, the message format and the failure behavior for messages among a parent, its running children, and siblings.

### Modified Capabilities
<!-- none: luvus-backend is introduced by the luvus-only-backend change and no requirement in it changes -->

## Impact

- Code: `index.ts` (roster upkeep, new child env vars, launch-prompt hint, tool registration), `luvus.ts` (an `agentPrompt` wrapper), `subagent-done.ts` (description updates), `agents/*.md`, and the README.
- Luvus surface: adds `agent prompt` to the commands the extension calls. This goes beyond the pane-only v1 set from `luvus-only-backend` decision #7, deliberately and only in this change.
- Security: a message is plain text typed into another agent's input. The sender header helps the reader but proves nothing, since any process in the Luvus session can type into any pane. This matches Luvus's existing trust model and adds no new privilege.
