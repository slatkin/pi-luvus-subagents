# Spec Delta

## MODIFIED Requirements

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
