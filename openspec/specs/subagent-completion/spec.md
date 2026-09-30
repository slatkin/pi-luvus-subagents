# Subagent Completion

## Purpose

Defines how a sub-agent session reliably reaches completion: explicit `subagent_done` / `caller_ping` is the only success-path exit for every agent, and a child-side completion nudge recovers the case where the model finishes its turn without calling either.

## Requirements

### Requirement: Explicit exit only
A sub-agent session SHALL end its run (writing the `done` `.exit` sidecar) only when the child calls the `subagent_done` tool or the `caller_ping` tool. The child extension SHALL NOT write a `done` `.exit` sidecar from the `agent_end` event on its own, regardless of the `PI_SUBAGENT_AUTO_EXIT` environment variable or any agent frontmatter. The `auto-exit` frontmatter field, the `PI_SUBAGENT_AUTO_EXIT` environment variable, and the task hint wording SHALL continue to be parsed and SHALL continue to drive the `interactive` default and the task hint, but SHALL NOT trigger an automatic exit.

#### Scenario: Auto-exit agent finishes its turn
- **WHEN** a sub-agent with `auto-exit: true` finishes a turn normally without calling `subagent_done`
- **THEN** the session stays open and the completion nudge is scheduled, instead of the session exiting automatically

#### Scenario: Explicit exit
- **WHEN** the child calls `subagent_done`
- **THEN** the session exits and the parent receives the completion as before

### Requirement: Error exit is preserved
When a sub-agent's turn ends with the latest assistant message carrying `stopReason: "error"`, the child extension SHALL still write the error `.exit` sidecar so the parent learns about the provider failure promptly, even though the normal-completion auto-exit has been removed.

#### Scenario: Provider error ends the turn
- **WHEN** the child's latest assistant message ends with `stopReason: "error"` (e.g. auto-retry exhausted)
- **THEN** the child writes the error `.exit` sidecar and the parent is woken with the failure

### Requirement: Completion nudge after a normal stop
When a sub-agent's turn ends normally (the latest assistant message has `stopReason: "stop"`) and `subagent_done` has not been called, the child extension SHALL schedule a nudge: a follow-up message telling the agent to call `subagent_done` now without restating its report, or `caller_ping` if it is blocked and needs input. The nudge SHALL be delivered after a delay (default 5 seconds, configurable via `PI_SUBAGENT_NUDGE_DELAY_MS` with a 1-second minimum, disable entirely with `PI_SUBAGENT_NUDGE_DISABLE=1`). Provider-error and aborted stops SHALL NOT schedule a nudge.

#### Scenario: Model forgets to call subagent_done
- **WHEN** the child finishes a turn normally without calling `subagent_done` and stays idle for the nudge delay
- **THEN** the child receives a follow-up message telling it to call `subagent_done` without restating its report (or `caller_ping` when blocked)

#### Scenario: Error stop does not nudge
- **WHEN** the child's turn ends with `stopReason: "error"`
- **THEN** no nudge is scheduled

### Requirement: Nudge cancellation
A pending nudge SHALL be cancelled when the child calls `subagent_done` or `caller_ping`, when the user sends input, when a new agent generation cycle starts, or when the session shuts down. Input that arrives after the first agent run has started SHALL additionally mark the session as user-taken-over.

#### Scenario: User takes over
- **WHEN** the user types into the sub-agent pane after the first agent run has started and a nudge is pending
- **THEN** the pending nudge is cancelled and the session stays open for the user

#### Scenario: Agent resumes work
- **WHEN** a new agent generation cycle starts while a nudge is pending
- **THEN** the pending nudge is cancelled
