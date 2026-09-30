---
name: run-integration-tests
description: Run the integration test suite and verify all sessions end-to-end. Use when asked to "run integration tests", "run e2e tests", "test before release", "verify integration", "run the full test suite", "check everything works".
---

# Run Integration Tests

Unit tests first, then Luvus-backed integration suites. Must run inside a Luvus pane — everything skips elsewhere.

## Step 1: Preflight Checks

```bash
echo "LUVUS_ENV=$LUVUS_ENV LUVUS_BIN_PATH=$LUVUS_BIN_PATH LUVUS_PANE_ID=$LUVUS_PANE_ID"
node --version
```

- All three `LUVUS_*` vars must be set (pi running inside a Luvus pane). If missing, stop and tell the user to start pi inside Luvus.
- Node 22+ required.

## Step 2: Run Unit Tests

Fast, no LLM, no Luvus needed — if these fail, stop here:

```bash
cd ~/Dev/pi-luvus-subagents && npm test
```

All 168 unit tests must pass before touching integration tests.

## Step 3: Run Integration Tests

```bash
cd ~/Dev/pi-luvus-subagents && npm run test:integration
```

This runs `node --test --test-concurrency=1 test/integration/*.test.ts`. The `concurrency=1` flag is required (tests assert global pane state and race in parallel).

| Suite | Tests | LLM? | Approx Duration |
|-------|-------|------|-----------------|
| `mux-surface` | 7 | No — raw pane ops only | ~1 min |
| `subagent-lifecycle` | 9 | Yes — real pi sessions (haiku default, ~$0.01–0.05 each) | ~5–10 min |

For a quick check without spending money, run the surface suite alone:

```bash
node --test --test-concurrency=1 test/integration/mux-surface.test.ts
```

### Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PI_TEST_MODEL` | `anthropic/claude-haiku-4-5` | Model for LLM-backed tests |
| `PI_TEST_TIMEOUT` | `120000` | Per-test timeout in ms |

### How the harness works

Each lifecycle test creates a Luvus pane, launches pi with the working-tree extension force-loaded (`pi -ne -e pi-extension/subagents/index.ts`, so local edits are always the code under test), and ends the remote command with a `__TEST_DONE_<code>__` sentinel. Poll pane output via `$LUVUS_BIN_PATH pane read` until the sentinel appears; a non-zero code means the pi session itself failed.

## Step 4: Verify Outcomes

- Every test's marker file / assertion passed (failures print screen output + the last 1000 chars of pane text).
- Spot-check one lifecycle session if anything looks off: find recent session dirs under `~/.pi/agent/sessions`, confirm the header line is `"type": "session"`, and that parent/child linkage (`parentSession`) exists for the fork test.

## Step 5: Report

Print a final summary:

```
╭─────────────────────────────────────────────╮
│ Integration Test Results                    │
├─────────────────────────────────────────────┤
│ Unit tests:         168/168 ✅              │
│ Mux surface:        7/7   ✅                │
│ Subagent lifecycle: 9/9   ✅                │
╰─────────────────────────────────────────────╯
```

If any step failed, summarize what broke and suggest next steps.
