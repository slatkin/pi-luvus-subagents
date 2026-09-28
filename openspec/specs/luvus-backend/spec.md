# Luvus Backend

## Purpose

Defines how the subagents extension opens, drives, observes, interrupts and closes subagent panes through the Luvus CLI. Luvus is the only supported terminal host.

## Requirements

### Requirement: Luvus environment is required
The extension SHALL treat Luvus as available only when the `LUVUS_ENV`, `LUVUS_BIN_PATH` and `LUVUS_PANE_ID` environment variables are all set and non-empty. When any of them is missing, `subagent` and `subagent_resume` MUST NOT spawn anything. Each MUST instead return an error result telling the user to run pi inside Luvus. No other terminal backend and no headless fallback SHALL exist.

#### Scenario: Spawn outside Luvus
- **WHEN** `subagent` is called and `LUVUS_PANE_ID` is unset
- **THEN** the tool returns an error result whose text says subagents require running pi inside Luvus, and no pane or process is created

#### Scenario: Other multiplexer present
- **WHEN** pi runs inside tmux (the `TMUX` variable is set) but the `LUVUS_*` variables are unset
- **THEN** `subagent` returns the same "run pi inside Luvus" error

### Requirement: Luvus binary is invoked by exact path
Every Luvus CLI call SHALL execute the binary at `$LUVUS_BIN_PATH` directly, without a shell and without searching `PATH`.

#### Scenario: A different luvus is on PATH
- **WHEN** `PATH` contains a different `luvus` executable than `$LUVUS_BIN_PATH`
- **THEN** all pane operations run the `$LUVUS_BIN_PATH` binary

### Requirement: Subagent pane creation
Spawning or resuming a subagent SHALL split the caller's pane (`$LUVUS_PANE_ID`) without moving focus, take the new pane's id from the CLI's JSON result, and name the pane after the subagent. If the split returns an error or no pane id can be found, the tool MUST return an error result that includes the Luvus error message.

When the resolved placement for the spawn is `tab`, the extension SHALL additionally move the new pane to its own workspace tab with `pane move <id> --new-tab` and then restore focus to the caller's tab. The caller's tab SHALL be determined from the Luvus `agent list` result before the move, by finding the entry whose pane id equals `$LUVUS_PANE_ID`. When the caller's tab cannot be determined, the extension SHALL keep the pane placement instead of moving the pane. Focus restore SHALL be best-effort: if `tab focus` fails, the tool SHALL NOT fail.

#### Scenario: Successful spawn
- **WHEN** `subagent` is called with name "Scout" inside Luvus
- **THEN** a new pane appears next to the caller's pane, focus stays on the caller's pane, and the new pane is named "Scout"

#### Scenario: Tab placement
- **WHEN** `subagent` is spawned with placement `tab` inside Luvus
- **THEN** the new pane is moved to its own workspace tab, named after the subagent, and focus returns to the caller's tab so the user's input stays with the caller

#### Scenario: Caller tab unknown
- **WHEN** `agent list` returns no entry whose pane id equals `$LUVUS_PANE_ID` and placement is `tab`
- **THEN** the subagent opens as a plain split of the caller's pane instead of being moved to a tab

#### Scenario: Focus restore fails
- **WHEN** the `tab focus` call after a `pane move` fails
- **THEN** the spawn still succeeds and the tool result does not report an error

#### Scenario: Split fails
- **WHEN** the Luvus CLI answers the split with an `error` object
- **THEN** the tool returns an error result containing that error's message, and no launch script is run

### Requirement: Subagent launch runs in the pane
The extension SHALL write the subagent's launch command to a bash script file and run `bash <script>` in the new pane through the Luvus CLI, whatever the user's interactive shell is.

#### Scenario: Fish user shell
- **WHEN** the user's `SHELL` is fish and a subagent is spawned
- **THEN** the pi child starts, and a crash still prints the `__SUBAGENT_DONE_<code>__` sentinel with the child's exit code

### Requirement: Completion detection
The extension SHALL detect completion from the `<session>.jsonl.exit` sidecar file first. It SHALL use the pane's recent output only as a fallback, matching the `__SUBAGENT_DONE_<code>__` sentinel to catch crashed children. When the poll ends for any reason (done, ping, sentinel, error or abort), the extension SHALL close the subagent's pane through the Luvus CLI, as upstream does. For Claude Code subagents without a sentinel summary, the extension SHALL read up to 200 lines of pane output as the summary before closing.

#### Scenario: Normal completion
- **WHEN** the child calls `subagent_done` and the `.exit` file appears
- **THEN** the parent receives the result and the subagent's pane is closed

#### Scenario: Child crashes
- **WHEN** the child pi exits without writing an `.exit` file
- **THEN** the parent detects the sentinel in the pane output and reports the exit code

### Requirement: Interrupt sends Escape through Luvus
`subagent_interrupt` SHALL send Escape to the target subagent's pane with the Luvus agent-keys command. If the command fails, the tool MUST return an error that names the subagent and gives the Luvus error.

#### Scenario: Interrupt a running subagent
- **WHEN** `subagent_interrupt` is called for a running subagent
- **THEN** its pane receives Escape, the child's current turn is aborted, and the subagent keeps running

#### Scenario: Pane already gone
- **WHEN** the agent-keys command fails because the pane no longer exists
- **THEN** the tool returns an error of the form `Failed to send Escape to subagent "<name>" via Luvus: <message>`

### Requirement: Current pi packages
The extension SHALL import from `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` and load in the current pi release. No `@mariozechner/*` import SHALL remain.

#### Scenario: Load in current pi
- **WHEN** pi (the `@earendil-works` release) starts with the extension installed
- **THEN** it registers all subagent tools and commands without import or type errors
