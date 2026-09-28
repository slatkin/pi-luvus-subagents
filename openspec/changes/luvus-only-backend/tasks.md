# Tasks

## 1. Live Luvus checks (inside a Luvus pane)

- [x] 1.1 Run `$LUVUS_BIN_PATH pane split $LUVUS_PANE_ID --no-focus`, save the raw JSON as a fixture comment in `test/test.ts`, and record in design.md Decision 3 which field holds the new pane id. Then close the test pane with `pane close <id>` and verify it is gone in `pane list`.
- [x] 1.2 Start `pi` in a split pane, give it a long prompt, and run `$LUVUS_BIN_PATH agent keys <id> esc`. Verify the turn aborts. If it doesn't, try `pane send <id>` with a raw ESC and record which one works in design.md Decision 3/Risks.
- [x] 1.3 Run `pane read <id> --lines 5` and `pane name X --pane <id>`, and record whether `--lines` is accepted and what `pane read` prints (plain text or JSON `.result`). Verify by noting the outcome in design.md Decision 4.

## 2. Luvus backend

- [x] 2.1 Create `pi-extension/subagents/luvus.ts` with the `luvus()`/`luvusAsync()` helpers (exact `$LUVUS_BIN_PATH`, no shell, `.result`/`.error` handling), `isMuxAvailable`, `muxSetupHint`, `shellEscape`, `createSurface`, `sendLongCommand`, `readScreen`, `readScreenAsync`, `sendEscape`, `closeSurface`, `pollForExit` and `__pollForExitTest__`, as in design.md Decisions 1–6. Carry `pollForExit`/`interpretExitSidecar` over from `cmux.ts` unchanged. Verify with `node --check`-style import in the unit tests (2.3).
- [x] 2.2 Point `index.ts` at `./luvus.ts`. Drop the `getMuxBackend`, `renameCurrentTab` and `renameWorkspace` imports and the `/plan` rename block. Change the interrupt error to `via Luvus` and the unavailable message to "Subagents require Luvus." Delete `cmux.ts`. Verify that `grep -rn "cmux\|tmux\|zellij\|wezterm\|getMuxBackend" pi-extension` returns nothing.
- [x] 2.3 In `test/test.ts`, delete the zellij/cmux/WezTerm tests and imports, and repoint the `interpretExitSidecar` tests to `luvus.ts`. Add unit tests that use a stub `LUVUS_BIN_PATH` script echoing canned JSON: availability true/false over the three env vars, `createSurface` parsing the 1.1 fixture, an `.error` response throwing with its message, and `readScreen` tailing to n lines. Verify with `npm test`.

## 3. Pi package port

- [x] 3.1 Replace the `@mariozechner/*` entries in `package.json` with `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` (peer `*`, dev `^0.87.1`), then run `npm install`. Rewrite the imports in `index.ts`, `subagent-done.ts` and `test/test.ts`. Verify that `grep -rn mariozechner pi-extension test package.json` returns nothing.
- [x] 3.2 Fix the API drift reported by `npx tsc --noEmit --allowImportingTsExtensions` (or the first pi load), using the maplezzk fork as reference. Verify that `npm test` passes and that `pi` inside Luvus loads the extension with no errors and lists the `subagent*` tools.

## 4. Integration tests and docs

- [x] 4.1 Rewrite `test/integration/harness.ts` and `mux-surface.test.ts` against `luvus.ts` (split, run, read, close; skip unless `LUVUS_ENV` is set), and repoint `subagent-lifecycle.test.ts`. Verify that `npm run test:integration` passes inside Luvus and skips outside it.
- [x] 4.2 Rewrite the README's intro, How It Works and Install sections for Luvus only, and remove cmux/tmux/zellij/WezTerm and `PI_SUBAGENT_MUX` mentions. Rename the package in `package.json` to `pi-luvus-subagents` and update its description. Verify that `grep -in "cmux\|tmux\|zellij\|wezterm" README.md package.json` returns nothing.

## 5. End-to-end check

- [x] 5.1 Inside Luvus, spawn a `scout` subagent, interrupt it once, let it finish, and confirm that the pane opens unfocused with the right name, Escape aborts its turn, the result reaches the parent and the pane closes. Then unset `LUVUS_PANE_ID`, run pi, and confirm that `subagent` returns the "run pi inside Luvus" error.
