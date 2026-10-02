# Tasks

## 1. Implementation

- [x] 1.1 Add `buildOscTitleLine(name, task?)` to `pi-extension/subagents/luvus.ts`: strip C0 controls/`ESC`/`BEL`/`CAP` from the derived text, truncate the task part to 48 visible characters, return the single-quoted `printf '\033]2;<title>\007'` script line, or `""` when the name is empty.
- [x] 1.2 Thread the title line into the three `sendLongCommand` call sites in `pi-extension/subagents/index.ts` (pi spawn, claude spawn, resume): derive the task part from the task's first non-empty line (resume: the follow-up message) and append the line to the existing `scriptPreamble` array.

## 2. Tests

- [x] 2.1 Unit tests in `test/test.ts` for `buildOscTitleLine`: normal name+task, hostile task text (embedded `ESC [2J`, BEL, newlines) comes out stripped, missing/empty task yields name-only, empty name yields `""`, task truncation at 48 characters.

## 3. Docs

- [ ] 3.1 Note in `README.md` (pane naming / AGENTS sidebar context) that subagent panes carry an OSC title `<name> — <task>` shown in the sidebar, and that aliases are unchanged.

## 4. Verification

- [ ] 4.1 `npm test` green; `npx tsc --noEmit` clean.
- [ ] 4.2 Manual check: spawn a subagent, confirm its AGENTS sidebar row shows the `name — task` title (second line), and `/reload` cleanliness.
