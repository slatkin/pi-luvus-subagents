import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildReleaseArgs,
  buildReportArgs,
  buildSessionBindArgs,
  createLuvusStatusReporter,
  LUVUS_STATUS_SOURCE,
  LUVUS_STATUS_TTL_S,
  piSessionId,
} from "../pi-extension/subagents/luvus-status.ts";

const ENV = { LUVUS_ENV: "1", LUVUS_BIN_PATH: "/bin/luvus", LUVUS_PANE_ID: "7", PI_SESSION_FILE: "/tmp/2026-10-02T15-25-11-301Z_abc.jsonl" };

function makePi() {
  const handlers = new Map<string, Array<() => void>>();
  return {
    handlers,
    pi: { on: (event: string, fn: () => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
    } },
    fire(event: string) {
      for (const fn of handlers.get(event) ?? []) fn();
    },
  };
}

function makeExec() {
  const calls: string[][] = [];
  return {
    calls,
    exec: (_bin: string, args: string[]) => {
      calls.push(args);
    },
  };
}

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__piLuvusStatusRegistered;
});

describe("luvus-status reporter", () => {
  it("reports idle → working → idle and releases on shutdown, skipping repeats", () => {
    const { calls, exec } = makeExec();
    const target = makePi();
    createLuvusStatusReporter(exec, { ...ENV }).register(target.pi as never);
    target.fire("session_start");
    target.fire("turn_start");
    target.fire("turn_start");
    target.fire("agent_end");
    target.fire("session_shutdown");
    assert.deepEqual(calls, [
      buildSessionBindArgs("7", "abc"),
      buildReportArgs("7", "idle"),
      buildReportArgs("7", "working"),
      buildReportArgs("7", "idle"),
      buildReleaseArgs("7"),
    ]);
  });

  it("binds the pi session id from PI_SESSION_FILE", () => {
    assert.equal(
      piSessionId({ PI_SESSION_FILE: "/home/x/.pi/agent/sessions/--home--/2026-10-02T15-25-11-301Z_01a0fd38-2905-7368-b9f5-a30c7bd41580.jsonl" }),
      "01a0fd38-2905-7368-b9f5-a30c7bd41580",
    );
    assert.equal(piSessionId({}), null);
  });

  it("sends nothing outside a Luvus pane", () => {
    const { calls, exec } = makeExec();
    const target = makePi();
    createLuvusStatusReporter(exec, {}).register(target.pi as never);
    target.fire("session_start");
    target.fire("turn_start");
    target.fire("session_shutdown");
    assert.deepEqual(calls, []);
  });

  it("retries a failed report on the next transition and releases once", () => {
    const { calls } = makeExec();
    let failures = 1;
    const target = makePi();
    const reporter = createLuvusStatusReporter((_bin, args) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error("luvus unreachable");
      }
      calls.push(args);
    }, { ...ENV });
    reporter.report("working");
    reporter.report("idle");
    reporter.release();
    reporter.release();
    assert.deepEqual(calls, [buildReportArgs("7", "idle"), buildReleaseArgs("7")]);
  });

  it("registers listeners only once when both entries load", () => {
    const { exec } = makeExec();
    const target = makePi();
    const reporter = createLuvusStatusReporter(exec, { ...ENV });
    reporter.register(target.pi as never);
    reporter.register(target.pi as never);
    assert.equal(target.handlers.get("turn_start")?.length, 1);
  });

  it("uses the pi-luvus-status source with a short TTL", () => {
    assert.equal(LUVUS_STATUS_SOURCE, "pi-luvus-status");
    assert.ok(LUVUS_STATUS_TTL_S <= 300);
  });
});
