# Spec Delta

## Purpose

Defines how a sub-agent session reliably reaches completion: explicit `subagent_done` / `caller_ping`, restored child-side auto-exit for `auto-exit: true` agents, and a child-side completion nudge for sessions that remain open.

## MODIFIED Requirements

### Requirement: Explicit exit only
A sub-agent session SHALL end its run (writing the `done` `.exit` sidecar) when the child calls the `subagent_done` tool or the `caller_ping` tool. Additionally, when the session runs with auto-exit active (`PI_SUBAGENT_AUTO_EXIT=1`, set from `auto-exit: true` agent frontmatter), the latest assistant message of the ending turn does not carry `stopReason: "aborted"`, and the user has not taken over the session, the child extension SHALL write the `done` `.exit` sidecar from the `agent_end` event so the session exits automatically. The `auto-exit` frontmatter field and the `PI_SUBAGENT_AUTO_EXIT` environment variable SHALL continue to drive the `interactive` default and the task hint wording.

#### Scenario: Auto-exit agent finishes its turn
- **WHEN** a sub-agent with `auto-exit: true` finishes a turn normally without calling `subagent_done`
- **THEN** the child writes the `done` `.exit` sidecar and the session exits, delivering the completion to the parent

#### Scenario: Auto-exit agent aborted mid-turn
- **WHEN** a sub-agent with `auto-exit: true` has its turn end with `stopReason: "aborted"`
- **THEN** the session stays open for inspection or another prompt and no `done` sidecar is written

#### Scenario: Auto-exit agent after user takeover
- **WHEN** the user has sent input to the sub-agent after its first agent run started, and the agent then finishes a turn normally
- **THEN** the session stays open and the completion nudge path applies instead of auto-exit

#### Scenario: Non-auto-exit agent finishes its turn
- **WHEN** a sub-agent without `auto-exit` finishes a turn normally without calling `subagent_done`
- **THEN** the session stays open and the completion nudge is scheduled

#### Scenario: Explicit exit
- **WHEN** the child calls `subagent_done`
- **THEN** the session exits and the parent receives the completion as before

### Requirement: Completion nudge after a normal stop
When a sub-agent session remains open after a turn ends normally (the latest assistant message has `stopReason: "stop"`) — a non-auto-exit session, or an auto-exit session the user has taken over — and `subagent_done` has not been called, the child extension SHALL schedule a nudge: a follow-up message reminding the agent to call `subagent_done`, or `caller_ping` if it is spinning in place. The nudge SHALL be delivered after a delay (default 5 seconds, configurable via `PI_SUBAGENT_NUDGE_DELAY_MS` with a 1-second minimum, disable entirely with `PI_SUBAGENT_NUDGE_DISABLE=1`). Provider-error and aborted stops SHALL NOT schedule a nudge.

#### Scenario: Model forgets to call subagent_done
- **WHEN** a non-auto-exit child finishes a turn normally without calling `subagent_done` and stays idle for the nudge delay
- **THEN** the child receives a follow-up message reminding it to call `subagent_done` (or `caller_ping` when spinning in place)

#### Scenario: Auto-exit session exits before any nudge
- **WHEN** an auto-exit session (not user-taken-over) finishes its turn normally
- **THEN** the session exits with the `done` sidecar and no nudge is scheduled

#### Scenario: Error stop does not nudge
- **WHEN** the child's turn ends with `stopReason: "error"`
- **THEN** no nudge is scheduled
