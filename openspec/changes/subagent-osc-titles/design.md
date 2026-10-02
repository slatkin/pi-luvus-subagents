# Design

## Context

Luvus's AGENTS sidebar second line prefers the pane's live OSC title (then a module-published `ui.agenttitle.push`, then `workspace · =pane`; aliases are never used). pi 0.87.1 emits no OSC sequences anywhere in its dist, and `luvus pane name` sets only an alias — so every subagent pane is anonymous in the sidebar. The extension's launch scripts already run inside the pane's tty before the child starts, which is exactly where a title can be set with plain bytes on the wire.

## Decisions

- **Emit the title from the launch script, not from the extension process, delayed and backgrounded.** The script runs in the pane's tty, and the `printf` is backgrounded behind a fixed delay so it lands after pi has booted. pi 1.0.0 enters the alternate screen at startup and wipes any title emitted before it owns the screen, so an immediate write is lost; the current implementation uses `( sleep 8; printf ... ) &`, with a comment in `luvus.ts` naming the upgrade path away from the heuristic. The alternative — a Luvus-side module publishing `ui.agenttitle.push` — titles retroactively from session data and lives in another repo. The extension cannot printf from inside pi's TUI without corrupting its frame buffer, so the parent pane is out of scope.
- **Title derivation is a pure, unit-testable function** colocated with `slugifyPaneName` in `luvus.ts`: `buildOscTitleLine(name, task)` returns the full `printf` shell line (or `""` when there is nothing to title). Pure function keeps the sanitization and the 48-char cap testable without spawning panes; the three call sites (pi spawn, claude spawn, resume) only thread the line into the existing `scriptPreamble` array.
- **Sanitize against terminal injection, not shell injection.** The title string is passed to `printf` as an argument (never as the format string), and all C0 control characters, `ESC` (`\x1b`), and the OSC terminators (`\x07` BEL, `\x9c`) are stripped first — a task line containing an embedded `ESC [2J` must arrive in the title as nothing. Shell metacharacters are already safe: the whole line goes through the script file, and the title is single-quoted by `shellEscape`.
- **Cap the task part at 48 characters** (visible, post-strip) so sidebar rows stay readable; the em-dash separator uses a plain `—` character. Name-only when the task's first non-empty line is empty. Resume uses the follow-up message as the "task" part when present.
- **Best-effort by construction.** The `printf` is a standalone script line; a shell without a tty-printing terminal or a printf failure cannot fail the script's exit path, because the script continues to the launch command regardless. No Luvus CLI calls are added.
- **Keep the alias.** `luvus pane name` continues to run: aliases are used elsewhere (`=name` references), and the title and alias serving different sidebar roles matches Luvus's documented model.

## Risks / Trade-offs

- [pi 1.0.0 wipes titles emitted before it boots] → handled by delaying and backgrounding the emission from the launch script; the 8s delay is a fixed heuristic (upgrade path noted in `luvus.ts`).
- [The delayed title may land mid-boot on an unusually slow boot, or the backgrounded emission may not survive, leaving the pane with the sidebar fallback] → accepted; emission stays best-effort and the spawn result is unchanged.
- [A future pi version could emit its own OSC title, overwriting ours once it boots] → accepted; last-writer-wins is the mechanism's semantics, and a pi-supplied title would be at least as informative as ours.
- [48-char cap truncates long task names mid-word] → accepted; the sidebar truncates per-row regardless, and the full task remains in the tool result and launch script.
- [OSC support inside Luvus's pty recordkeeping could differ from the doc] → verified behavior is claimed by the current AGENTS guide; the feature degrades to invisible if Luvus ignores the sequence.

## Migration Plan

Package update only; titles appear on the next spawn after reload. No data migration. Rollback: revert the commit.

## Open Questions

None.
