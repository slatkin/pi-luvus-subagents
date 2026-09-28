/**
 * Integration tests for the Luvus surface layer.
 *
 * These tests exercise real Luvus operations: splitting panes, running
 * commands, reading screen output, sending Escape, and closing panes.
 * No LLM calls — fast and free.
 *
 * Run inside a Luvus pane (skips elsewhere):
 *   LUVUS_ENV=1 pi  # then: npm run test:integration
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import {
  luvusAvailable,
  createTestEnv,
  cleanupTestEnv,
  createTrackedSurface,
  untrackSurface,
  sendLongCommand,
  readScreen,
  readScreenAsync,
  closeSurface,
  sendEscape,
  sleep,
  uniqueId,
  trackTempFile,
  waitForFile,
  waitForScreen,
  type TestEnv,
} from "./harness.ts";

const available = luvusAvailable();

if (!available) {
  console.log("⚠️  Not inside a Luvus pane — skipping mux-surface integration tests");
  console.log("   Run pi inside Luvus (LUVUS_ENV set) to enable these tests.");
}

describe(
  "mux-surface [luvus]",
  { timeout: 60_000, skip: !available },
  () => {
    let env: TestEnv;

    after(() => {
      cleanupTestEnv(env);
    });

    it("creates a pane (split, unfocused), runs a command, reads output, and closes it", async () => {
      env ??= createTestEnv();
      const surface = createTrackedSurface(env, "echo-test");
      await sleep(1000);

      const marker = uniqueId();
      sendLongCommand(surface, `echo "MARKER_${marker}"`);
      await sleep(1500);

      const screen = readScreen(surface, 50);
      assert.ok(
        screen.includes(`MARKER_${marker}`),
        `Expected screen to contain MARKER_${marker}. Got:\n${screen}`,
      );

      closeSurface(surface);
      untrackSurface(env, surface);

      // The pane is gone — reading it must fail.
      assert.throws(() => readScreen(surface, 5));
    });

    it("preserves shell special characters in echo output", async () => {
      env ??= createTestEnv();
      const surface = createTrackedSurface(env, "escape-test");
      await sleep(1000);

      const marker = uniqueId();
      // Single-quoted string — $ and " are literal inside single quotes
      sendLongCommand(surface, `echo 'SPEC_${marker}_$HOME_"quotes"_done'`);
      await sleep(1500);

      const screen = readScreen(surface, 50);
      assert.ok(
        screen.includes(`SPEC_${marker}`),
        `Expected special-char output. Got:\n${screen}`,
      );
      // $ should be literal inside single quotes
      assert.ok(
        screen.includes("$HOME"),
        `Expected literal $HOME in output. Got:\n${screen}`,
      );
    });

    it("sends a long command via script file without truncation", async () => {
      env ??= createTestEnv();
      const surface = createTrackedSurface(env, "long-cmd-test");
      await sleep(1000);

      const marker = uniqueId();
      const longValue = "X".repeat(500);
      const command = `echo "LONG_${marker}_${longValue}_END"`;

      sendLongCommand(surface, command);
      await sleep(2000);

      const screen = readScreen(surface, 50);
      assert.ok(
        screen.includes(`LONG_${marker}`),
        `Expected long command output. Got:\n${screen.slice(0, 300)}...`,
      );
      assert.ok(
        screen.includes("_END"),
        `Expected full output (not truncated). Got:\n${screen.slice(-300)}`,
      );
    });

    it("reads screen asynchronously", async () => {
      env ??= createTestEnv();
      const surface = createTrackedSurface(env, "async-read-test");
      await sleep(1000);

      const marker = uniqueId();
      sendLongCommand(surface, `echo "ASYNC_${marker}"`);
      await sleep(1500);

      const screen = await readScreenAsync(surface, 50);
      assert.ok(
        screen.includes(`ASYNC_${marker}`),
        `Async read should find marker. Got:\n${screen}`,
      );
    });

    it("manages multiple panes concurrently", async () => {
      env ??= createTestEnv();
      const s1 = createTrackedSurface(env, "multi-1");
      const s2 = createTrackedSurface(env, "multi-2");
      await sleep(1500);

      const m1 = uniqueId();
      const m2 = uniqueId();
      sendLongCommand(s1, `echo "S1_${m1}"`);
      sendLongCommand(s2, `echo "S2_${m2}"`);
      await sleep(1500);

      const screen1 = readScreen(s1, 50);
      const screen2 = readScreen(s2, 50);

      assert.ok(screen1.includes(`S1_${m1}`), `Pane 1 missing marker. Got:\n${screen1}`);
      assert.ok(screen2.includes(`S2_${m2}`), `Pane 2 missing marker. Got:\n${screen2}`);
    });

    it("writes output to a file and verifies via the pane", async () => {
      env ??= createTestEnv();
      const surface = createTrackedSurface(env, "file-test");
      await sleep(1000);

      const marker = uniqueId();
      const filePath = `/tmp/pi-mux-test-${marker}.txt`;
      trackTempFile(env, filePath);

      sendLongCommand(
        surface,
        `echo "FILE_${marker}" > ${filePath} && echo "WRITTEN_${marker}"`,
      );

      await waitForScreen(surface, new RegExp(`WRITTEN_${marker}`), 10_000, 50);
      const content = await waitForFile(filePath, 10_000, new RegExp(`FILE_${marker}`));
      assert.ok(content.includes(`FILE_${marker}`), `File content wrong. Got: ${content}`);

      // Clean up
      try {
        unlinkSync(filePath);
      } catch {
        // Best effort — the file may already be gone.
      }
    });

    it("surfaces the Luvus error when Escape targets a non-agent pane", async () => {
      // Luvus `agent keys` only accepts detected agent panes. Subagent panes
      // always run pi (an agent), so the happy path is covered by the live
      // checks and the lifecycle/E2E tests; here we pin the error contract:
      // a failing agent-keys call surfaces Luvus's own error message.
      env ??= createTestEnv();
      const surface = createTrackedSurface(env, "plain-shell");
      await sleep(1000);

      sendLongCommand(surface, "sleep 30");
      await sleep(500);

      assert.throws(() => sendEscape(surface), /agent_not_ready|not a running agent/);
    });
  },
);
