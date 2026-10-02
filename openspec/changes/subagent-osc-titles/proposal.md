# Proposal

## Why

Subagent panes are anonymous in Luvus's AGENTS sidebar: pi emits no OSC title (verified across its 0.87.1 dist), and the `=alias` we set via `luvus pane name` is deliberately not used by the sidebar's title line, which prefers the pane's live OSC title. Every subagent row therefore reads `workspace · =pane`, so the user cannot tell agents apart from the sidebar when triaging parallel work.

## What Changes

- Subagent launch scripts (spawn, resume, and the Claude CLI path) emit an OSC 2 title sequence into the pane's tty before starting the child, titling the pane with the subagent's name and a truncated first line of its task (`<name> — <task>`, capped for sidebar readability).
- Title text is sanitized before emission: control characters and escape sequences are stripped so untrusted task text cannot inject terminal control sequences.
- Title emission is best-effort: it adds no Luvus CLI calls and can never fail a spawn.
- No change to pane placement, aliases (`luvus pane name` stays), or any completion/messaging behavior.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `luvus-backend`: the "Subagent pane creation" requirement gains the title behavior — subagent panes SHALL carry an OSC 2 title derived from the subagent name and task, sanitized and best-effort.

## Impact

- Code: `pi-extension/subagents/index.ts` (title construction at the three `sendLongCommand` call sites: pi spawn, claude spawn, resume), `pi-extension/subagents/luvus.ts` (sanitize helper colocated with `slugifyPaneName`).
- Tests: `test/test.ts` unit coverage for the title sanitizer and the title line in generated launch scripts.
- Docs: `README.md` (AGENTS sidebar / pane naming mention).
- Spec: `openspec/specs/luvus-backend/spec.md` delta applied at archive.
