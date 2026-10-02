# pi-luvus-subagents

Async subagents for [pi](https://github.com/badlogic/pi-mono) — spawn, orchestrate, and manage sub-agent sessions in [Luvus](https://luvus.dev) panes. **Fully non-blocking** — the main agent keeps working while subagents run in the background.

This is a Luvus-only fork of [HazAT/pi-interactive-subagents](https://github.com/HazAT/pi-interactive-subagents); the completion-nudge design credits [maplezzk's port](https://github.com/maplezzk). Luvus is the only supported terminal host. Design decisions are recorded in [`LUVUS-FORK.md`](LUVUS-FORK.md). It is rewritten to work with Luvus (only), with tab vs pane and Luvus-based interagent messaging.

## How It Works

Call `subagent()` and it **returns immediately**. The sub-agent runs in its own Luvus pane, split from the caller's pane without stealing focus. A live widget above the input shows all running agents with their current state — `starting`, `active`, `waiting`, `stalled`, or `running`. When a sub-agent finishes, its result is **steered back** into the main session as an async notification — triggering a new turn so the agent can process it.

```
╭─ Subagents ──────────────────────────── 2 running ─╮
│ 00:23  Scout: Auth (scout)        active · bash 7m │
│ 00:45  Scout: DB (scout)                waiting 2m │
╰────────────────────────────────────────────────────╯
```

For parallel execution, just call `subagent` multiple times — they all run concurrently:

```typescript
subagent({ name: "Scout: Auth", agent: "scout", task: "Analyze auth module" });
subagent({ name: "Scout: DB", agent: "scout", task: "Map database schema" });
// Both return immediately, results steer back independently
```

## Install

```bash
pi install npm:pi-luvus-subagents
# or pinned to a git ref:
pi install git:github.com/slatkin/pi-luvus-subagents@v3.7.3
# or from a local checkout:
pi install /path/to/pi-luvus-subagents
```

**Luvus is required.** Run pi inside a Luvus pane — the extension refuses to spawn anything outside Luvus (it checks `LUVUS_ENV`, `LUVUS_BIN_PATH` and `LUVUS_PANE_ID`, which Luvus sets for every managed pane).

If your shell startup is slow and subagent commands sometimes get dropped before the prompt is ready, set `PI_SUBAGENT_SHELL_READY_DELAY_MS` to a higher value (defaults to `500`):

```bash
export PI_SUBAGENT_SHELL_READY_DELAY_MS=2500
```

Subagent panes are created without stealing keyboard focus (`pane split --no-focus`). Launch commands target child panes by explicit ID, so focus and command delivery are independent. Note: the `interactive` option controls parent status notifications, not terminal focus.

## What's Included

### Extensions

**Subagents** — 5 main-session tools + 4 commands, plus 2 subagent-only tools (`caller_ping`, `subagent_done`):

| Tool                 | Description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `subagent`           | Spawn a sub-agent in a dedicated Luvus pane (async — returns immediately)                    |
| `subagent_interrupt` | Interrupt a running Pi-backed subagent's current turn                                        |
| `subagent_message`   | Message the parent, a running child, or a running sibling without ending the session (async) |
| `subagents_list`     | List available agent definitions                                                             |
| `subagent_resume`    | Resume a previous sub-agent session (async)                                                  |

| Command                    | Description                          |
| -------------------------- | ------------------------------------ |
| `/plan`                    | Start a full planning workflow       |
| `/iterate`                 | Fork into a subagent for quick fixes |
| `/subagent <agent> <task>` | Spawn a named agent directly         |
| `/subagent-surface [pane\|tab]` | Show or set the default subagent surface |

### Bundled Agents

| Agent             | Model                       | Role                                                                                     |
| ----------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| **claude-code**   | Claude Code CLI (`sonnet`)  | Self-driving Claude Code session for deep investigation, experimentation, code exploration |
| **planner**       | Opus (medium thinking)      | Brainstorming — clarifies requirements, explores approaches, writes plans, creates todos |
| **scout**         | Haiku                       | Fast codebase reconnaissance — maps files, patterns, conventions                         |
| **worker**        | Sonnet (minimal thinking)   | Implements tasks from todos — writes code, runs tests, makes polished commits            |
| **reviewer**      | Opus (medium thinking)      | Reviews code for bugs, security issues, correctness                                      |
| **visual-tester** | Sonnet                      | Visual QA via Chrome CDP — screenshots, responsive testing, interaction testing          |

Agent discovery follows priority: **project-local** (`.pi/agents/`) > **global** (`~/.pi/agent/agents/`) > **package-bundled**. Override any bundled agent by placing your own version in the higher-priority location.

---

## Async Subagent Flow

```
1. Agent calls subagent()          → returns immediately ("started")
2. Sub-agent runs in a Luvus pane  → widget shows live status
3. User keeps chatting             → main session fully interactive
4. Sub-agent finishes              → result steered back as a normal completion/failure
5. Main agent processes result     → continues with new context
```

Multiple subagents run concurrently — each steers its result back independently as it finishes. The live widget above the input tracks all running agents:

```
╭─ Subagents ───────────────────────────────── 3 running ─╮
│ 01:23  Scout: Auth (scout)            active · write 7m │
│ 00:45  Researcher (researcher)               stalled 4m │
│ 00:12  Scout: DB (scout)                      starting… │
╰─────────────────────────────────────────────────────────╯
```

Completion messages render with a colored background and are expandable with `Ctrl+O` to show the full summary and session file path.

### In-progress status updates

The widget tracks each Pi-backed sub-agent from a child-written runtime snapshot and labels it with a coarse state:

- `starting` — launched, but no valid child snapshot has been observed yet
- `active` — the child is doing observed runtime work: agent turn, provider request, streaming, or tool execution
- `waiting` — the child finished a turn and is intentionally open for more input or another stage
- `stalled` — the parent has gone too long without a valid current child snapshot and can no longer trust the run is healthy
- `running` — fallback for backends without child snapshots (e.g. Claude)

These labels are no longer derived from session-file growth. Session JSONL is still used for transcript, resume, lineage, and result extraction, but Pi-backed liveness now comes from a small activity snapshot written by the child extension. A fixed internal watchdog marks a run as `stalled` when valid snapshots never appear, stop being readable, or stop matching the current child; valid long-running `active` or `waiting` states do not become `stalled` just because time passes. When a run enters `stalled` or recovers from it, the parent agent receives a steer message so it can react. All other status transitions stay in the widget only.

**Interactive subagents stay silent.** Long-running user-driven subagents (e.g. `planner`, or any `/iterate` fork) do not wake the parent session on `stalled`/`recovered` transitions — the user is working directly in the subagent's pane, and a steer message there would just burn an orchestrator turn on a no-op "still waiting" ping. The widget still updates normally, and child snapshots are still recorded/classified regardless of the `interactive` setting. By default, agents with `auto-exit: true` are treated as autonomous and get stall pings; agents without it are treated as interactive and stay quiet. Override per-agent with `interactive: true|false` in frontmatter, or per-spawn with `interactive: true|false` on the tool call.

#### Configuration

Status display is controlled by `config.json` in the extension's operating area, `~/.pi/agent/extensions/pi-luvus-subagents/config.json` (under `$PI_CODING_AGENT_DIR` when set — unlike the package root, this survives `pi update`). Seed it from the shipped example:

```bash
mkdir -p ~/.pi/agent/extensions/pi-luvus-subagents
cp config.json.example ~/.pi/agent/extensions/pi-luvus-subagents/config.json
```

A `config.json` left at the package root by an older install is still honored on read; the first `/subagent-surface` save migrates it to the new location.

```json
{
  "status": {
    "enabled": true
  },
  "surface": "pane"
}
```

`config.json` is gitignored so local overrides don't get committed.

Set `"surface": "tab"` to open subagents in their own workspace tab instead of splitting your pane (focus always returns to your pane). Change it live with `/subagent-surface pane|tab`, or override a single spawn with the `subagent` tool's `surface` parameter.

---

## Spawning Subagents

```typescript
// Named agent with defaults from agent definition
subagent({ name: "Scout", agent: "scout", task: "Analyze the codebase..." });

// Force a full-context fork for this spawn
subagent({ name: "Iterate", fork: true, task: "Fix the bug where..." });

// Agent defaults can choose a different session-mode via frontmatter
subagent({ name: "Planner", agent: "planner", task: "Work through the design with me" });

// Custom working directory
subagent({ name: "Designer", agent: "game-designer", cwd: "agents/game-designer", task: "..." });
```

### Parameters

| Parameter              | Type    | Default        | Description                                                                                       |
| ---------------------- | ------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `name`                 | string  | required       | Display name (shown in widget and pane title)                                                     |
| `task`                 | string  | required       | Task prompt for the sub-agent                                                                     |
| `agent`                | string  | —              | Load defaults from agent definition                                                               |
| `fork`                 | boolean | `false`        | Force the full-context fork mode for this spawn, overriding any agent `session-mode` frontmatter  |
| `interactive`          | boolean | derived        | Mark this spawn as interactive (don't wake the parent on stall/recovery). Defaults to the agent's `interactive` frontmatter, otherwise the inverse of `auto-exit`. |
| `model`                | string  | —              | Override agent's default model                                                                    |
| `systemPrompt`         | string  | —              | Append to system prompt                                                                           |
| `skills`               | string  | —              | Comma-separated skill names                                                                       |
| `tools`                | string  | —              | Comma-separated tool names                                                                        |
| `cwd`                  | string  | —              | Working directory for the sub-agent (see [Role Folders](#role-folders))                           |
| `surface`              | string  | config default | `"pane"` splits the caller's pane; `"tab"` opens the subagent in its own workspace tab (focus always returns to the caller). Overrides the `surface` key in `config.json` for this spawn. |

---

## Interrupting a running subagent

Use `subagent_interrupt` to cancel the active turn of a running Pi-backed subagent:

```typescript
subagent_interrupt({ id: "abcd1234" });
// or
subagent_interrupt({ name: "Scout" });
```

This sends Escape to the child pane, cancelling the in-progress model turn. The subagent session stays alive — the pane, session file, and background polling all remain intact. After the interrupt, the widget immediately moves the child back to `waiting`, and stale pre-interrupt snapshots are ignored. If the child starts work later, newer snapshots return it to `active`; completion, failure, and `caller_ping` still flow through normally.

This is a turn-level interrupt, not a method for forcibly terminating a subagent session.

> **Note:** Only Pi-backed subagents are supported. Claude-backed runs will return an error.

---

## Messaging other agents

Use `subagent_message` to pass text to another agent in the same tree while everyone keeps working:

```typescript
subagent_message({ to: "parent", message: "Which DB driver should I use?" });
subagent_message({ to: "Reviewer", message: "API is in src/api.ts" });
```

**Reachable targets** — exactly these three, nothing else:

- `parent` — the agent that spawned you (subagents only)
- the display name or id of one of your own running children
- the display name or id of a running sibling (another running child of your parent)

Grandchildren, grandparents, finished subagents, and unrelated agents are not reachable. Sending to a finished child returns an error listing what _is_ reachable; use `subagent_resume` for a finished session. If a name is ambiguous, pass the exact subagent id.

**Delivery** — messages to children and siblings go through Luvus `agent prompt` and appear in the target's pane as input, prefixed with a sender header like `[subagent message from Worker (sibling)]`. Messages to `parent` are appended to the child's message file and injected into the parent as a steering message, so they never touch a draft the user is typing in the parent's composer.

Delivery is asynchronous: the tool returns once the message is queued, and any reply arrives later as a separate message. A Luvus error such as `agent_not_ready` is reported, never retried automatically.

`subagent_message`, `caller_ping` and `subagent_done` are different: `caller_ping` and `subagent_done` **end** the sending session; `subagent_message` does not.

> **Note:** Claude Code subagents can receive messages, but they have no `subagent_message` sending tool.

---

## caller_ping — Child-to-Parent Help Request

The `caller_ping` tool lets a subagent request help from its parent agent. When called, the child session **exits** and the parent receives a notification with the help message. The parent can then **resume** the child session with a response using `subagent_resume`.

**`caller_ping` parameters:**
- `message` (required): What you need help with

**`subagent_resume` parameters:**
- `sessionPath` (required): Path to the child session `.jsonl` file
- `name` (optional): Display name for the resumed pane (defaults to `Resume`)
- `message` (optional): Follow-up prompt to send after resuming
- `autoExit` (optional): Whether the resumed session should auto-exit after its next response. Defaults to `true` for autonomous follow-up work; set `false` when resuming for an interactive handoff.
- `surface` (optional): `"pane"` (default) splits the caller's pane; `"tab"` opens the resumed session in its own workspace tab. Overrides the `surface` key in `config.json` for this resume.

**Interaction flow:**
1. Child calls `caller_ping({ message: "Not sure which schema to use" })`
2. Child session exits (like `subagent_done`)
3. Parent receives a steer notification: *"Sub-agent Worker needs help: Not sure which schema to use"*
4. Parent resumes the child session via `subagent_resume` with the response
5. Child picks up where it left off with the parent's guidance

**Example:**
```typescript
// Inside a worker subagent
await caller_ping({
  message: "Found two conflicting migration files — should I use v1 or v2?"
});
// Session exits here. Parent receives the ping, then resumes this session
// with guidance like "Use v2, v1 is deprecated"
```

> **Note:** `caller_ping` is only available inside subagent contexts. Calling it from a standalone pi session returns an error.

---

## The `/plan` Workflow

The `/plan` command orchestrates a full planning-to-implementation pipeline.

```
/plan Add a dark mode toggle to the settings page
```

```
Phase 1: Investigation    → Quick codebase scan
Phase 2: Planning         → Interactive planner subagent (user collaborates)
Phase 3: Review Plan      → Confirm todos, adjust if needed
Phase 4: Execute          → Scout + sequential workers implement todos
Phase 5: Review           → Reviewer subagent checks all changes
```

---

## The `/iterate` Workflow

For quick, focused work without polluting the main session's context.

```
/iterate Fix the off-by-one error in the pagination logic
```

This always forks the current session into a subagent with full conversation context. It does not inherit an agent default `session-mode`. Make the fix, verify it, and exit to return. The main session gets a summary of what was done.

---

## Custom Agents

Place a `.md` file in `.pi/agents/` (project) or `~/.pi/agent/agents/` (global):

```markdown
---
name: my-agent
description: Does something specific
model: anthropic/claude-sonnet-4-6
thinking: minimal
tools: read, bash, edit, write
session-mode: lineage-only
spawning: false
---

# My Agent

You are a specialized agent that does X...
```

### Frontmatter Reference

| Field         | Type    | Description                                                                                                                                                                                                                                                                 |
| ------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | string  | Agent name (used in `agent: "my-agent"`)                                                                                                                                                                                                                                    |
| `description` | string  | Shown in `subagents_list` output                                                                                                                                                                                                                                            |
| `model`       | string  | Default model (e.g. `anthropic/claude-sonnet-4-6`)                                                                                                                                                                                                                          |
| `thinking`    | string  | Thinking level: `minimal`, `medium`, `high`                                                                                                                                                                                                                                 |
| `tools`       | string  | Comma-separated **native pi tools only**: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`                                                                                                                                                                             |
| `skills`      | string  | Comma-separated skill names to auto-load                                                                                                                                                                                                                                    |
| `session-mode` | string | Default child-session mode: `standalone`, `lineage-only`, or `fork` |
| `spawning`    | boolean | Set `false` to deny all subagent-spawning tools                                                                                                                                                                                                                             |
| `deny-tools`  | string  | Comma-separated extension tool names to deny                                                                                                                                                                                                                                |
| `auto-exit`   | boolean | Auto-shutdown when the agent finishes its turn — no `subagent_done` call needed. If the user sends any input, auto-exit is permanently disabled and the user takes over the session. Recommended for autonomous agents (scout, worker); not for interactive ones (planner). Also determines the default value of `interactive` (see below). |
| `interactive` | boolean | derived        | Override whether stall/recovery transitions wake the parent session. Defaults to the inverse of `auto-exit`: autonomous agents (`auto-exit: true`) are non-interactive and get stall pings; agents without `auto-exit` are interactive and stay quiet. Explicit values take precedence. |
| `cwd`         | string  | Default working directory (absolute or relative to project root)                                                                                                                                                                                                            |
| `disable-model-invocation` | boolean | Hide this agent from discovery surfaces like `subagents_list`. The agent still remains directly invokable by explicit name via `subagent({ agent: "name", ... })`. |

---

Discovery still resolves precedence before visibility filtering. If a project-local hidden agent has the same name as a visible global or bundled agent, the hidden project agent wins and the lower-precedence agent does not appear in `subagents_list`.

### `session-mode`

Choose how a subagent session starts:

- `standalone` — default fresh session with no lineage link to the caller
- `lineage-only` — fresh blank child session with `parentSession` linkage, but no copied turns from the caller
- `fork` — linked child session seeded with the caller's prior conversation context

`lineage-only` is useful when you want session discovery and fork lineage UX to show the relationship later, but you do **not** want the child to inherit the parent's turns.

`fork: true` on the tool call always forces the `fork` mode for that specific spawn. `/iterate` uses this explicit override on purpose.

```yaml
---
name: planner
session-mode: lineage-only
---
```

### `auto-exit` and the completion nudge

Every sub-agent session exits through an explicit tool call: `subagent_done` to finish, or `caller_ping` to hand a question back to the parent. There is no silent auto-shutdown — even agents with `auto-exit: true` must call `subagent_done` when they finish.

To make that reliable, the child extension **nudges itself**: when the agent finishes a turn normally without calling `subagent_done`, it receives a follow-up reminder after 5 seconds:

> [Auto reminder]
> • Done → call subagent_done to finish.
> • Before finishing, self-check: are you spinning in place? If so, converge your result immediately and hand it back to the main agent with caller_ping — don't overthink.
> • Still working → ignore.

A pending nudge is cancelled when the agent starts new work, the user types into the pane, or the agent calls `subagent_done`/`caller_ping`. Error stops never nudge — they still exit immediately and report the failure to the parent.

Configure the nudge with environment variables (read by the child at launch):

| Variable                   | Default | Purpose                                              |
| -------------------------- | ------- | ---------------------------------------------------- |
| `PI_SUBAGENT_NUDGE_DELAY_MS` | `5000` | Delay before the reminder (minimum 1000)             |
| `PI_SUBAGENT_NUDGE_DISABLE`  | unset  | Set to `1` to disable the nudge entirely              |

**Parent-side idle watchdog.** The child's nudge depends on the child and the model, so the parent backs it up. For non-interactive subagents, if the child's activity file has said `waiting` (turn ended) for 30 seconds without the session exiting, the parent types a reminder into the pane itself. After two such reminders, if the child is still waiting another 30 seconds, the parent finishes it as if `subagent_done` had been called: the last assistant message becomes the result and the pane is closed. Interactive subagents (for example `planner`) are never touched. The timings live in `pi-extension/subagents/idle-watchdog.ts`.

**What `auto-exit: true` still does** — it no longer terminates anything. It shapes defaults:

- The task hint tells the agent upfront to call `subagent_done` when finished ("Complete your task autonomously. Call subagent_done when finished.")
- It is the default for `interactive` (see below): `auto-exit: true` agents are treated as autonomous and get stall pings; agents without it are interactive and stay quiet

```yaml
---
name: scout
auto-exit: true
---
```

### `interactive`

Controls whether status transitions (`stalled`, `recovered`) wake the parent session with a steer message.

**Default:** the inverse of `auto-exit`. Autonomous agents (`auto-exit: true`) are non-interactive and ping the parent on stall/recovery; agents without `auto-exit` are interactive and stay quiet. Bare spawns with no agent defs (e.g. `/iterate` with `fork: true`) are treated as interactive.

**Why it exists:** Interactive agents can run for minutes or hours while the user thinks, types, and reads in the subagent's pane. Child snapshots still update the widget, but stalled/recovered supervision messages rarely need to wake the parent for user-driven sessions. Skipping the steer keeps the parent quiet until the child actually finishes.

**When to override:**

- Set `interactive: false` on an agent that doesn't auto-exit but you still want stall pings for
- Set `interactive: true` on an autonomous agent you'd rather check on yourself

```yaml
---
name: planner
# interactive defaults to true because auto-exit is not set
---
```

Or per spawn:

```typescript
subagent({ name: "Scout", agent: "scout", interactive: true, task: "..." });
```

---

## Tool Access Control

By default, every sub-agent can spawn further sub-agents. Control this with frontmatter:

### `spawning: false`

Denies all subagent lifecycle tools (`subagent`, `subagent_interrupt`, `subagents_list`, `subagent_resume`):

```yaml
---
name: worker
spawning: false
---
```

### `deny-tools`

Fine-grained control over individual extension tools:

```yaml
---
name: focused-agent
deny-tools: subagent
---
```

### Recommended Configuration

| Agent      | `spawning`  | Rationale                                    |
| ---------- | ----------- | -------------------------------------------- |
| planner    | _(default)_ | Legitimately spawns scouts for investigation |
| worker     | `false`     | Should implement tasks, not delegate         |
| researcher | `false`     | Should research, not spawn                   |
| reviewer   | `false`     | Should review, not spawn                     |
| scout      | `false`     | Should gather context, not spawn             |

---

## Role Folders

The `cwd` parameter lets sub-agents start in a specific directory with its own configuration:

```
project/
├── agents/
│   ├── game-designer/
│   │   └── CLAUDE.md          ← "You are a game designer..."
│   ├── sre/
│   │   ├── CLAUDE.md          ← "You are an SRE specialist..."
│   │   └── .pi/skills/        ← SRE-specific skills
│   └── narrative/
│       └── CLAUDE.md          ← "You are a narrative designer..."
```

```typescript
subagent({ name: "Game Designer", cwd: "agents/game-designer", task: "Design the combat system" });
subagent({ name: "SRE", cwd: "agents/sre", task: "Review deployment pipeline" });
```

Set a default `cwd` in agent frontmatter:

```yaml
---
name: game-designer
cwd: ./agents/game-designer
spawning: false
---
```

---

## Tools Widget

Every sub-agent session displays a compact tools widget showing available and denied tools. Toggle with `Ctrl+J`:

```
[scout] — 12 tools · 4 denied  (Ctrl+J)              ← collapsed
[scout] — 12 available  (Ctrl+J to collapse)          ← expanded
  read, bash, edit, write, todo, ...
  denied: subagent, subagents_list, ...
```

---

## Requirements

- [pi](https://github.com/badlogic/pi-mono) — the coding agent
- [Luvus](https://luvus.dev) — run pi inside a Luvus pane; there is no headless fallback

---

## Acknowledgements

- [HazAT](https://github.com/HazAT) — original pi-interactive-subagents
- [maplezzk](https://github.com/maplezzk) — the completion-nudge design ported here
- The sub-agent status supervision and turn-only interruption features were inspired by [RepoPrompt](https://repoprompt.com/)'s sub-agent snapshot polling and run cancellation features.

---

## License

MIT
