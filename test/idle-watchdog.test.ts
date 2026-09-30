import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_MAX_NUDGES,
  IDLE_STEP_MS,
  decideIdleAction,
  type IdleWatchState,
} from "../pi-extension/subagents/idle-watchdog.ts";

const T0 = 1_000_000;

function decide(overrides: Partial<Parameters<typeof decideIdleAction>[0]> & { state?: IdleWatchState }) {
  return decideIdleAction({
    interactive: false,
    phase: "waiting",
    waitingSince: T0,
    now: T0 + IDLE_STEP_MS,
    state: { nudges: 0 },
    ...overrides,
  });
}

describe("idle-watchdog decideIdleAction", () => {
  it("does nothing before the child has waited a full step", () => {
    assert.equal(decide({ now: T0 + IDLE_STEP_MS - 1 }), "none");
  });

  it("nudges after a full step of waiting", () => {
    assert.equal(decide({}), "nudge");
  });

  it("never acts on interactive children or children that are not waiting", () => {
    assert.equal(decide({ interactive: true, now: T0 + 10 * IDLE_STEP_MS }), "none");
    assert.equal(decide({ phase: "active" }), "none");
    assert.equal(decide({ phase: "done" }), "none");
    assert.equal(decide({ waitingSince: undefined }), "none");
  });

  it("waits a step between reminders", () => {
    const state: IdleWatchState = { nudges: 1, lastNudgeAt: T0 + IDLE_STEP_MS };
    assert.equal(decide({ now: T0 + IDLE_STEP_MS + IDLE_STEP_MS - 1, state }), "none");
    assert.equal(decide({ now: T0 + 2 * IDLE_STEP_MS, state }), "nudge");
  });

  it("finishes once the reminders are used up and the child is still waiting", () => {
    const state: IdleWatchState = { nudges: IDLE_MAX_NUDGES, lastNudgeAt: T0 + IDLE_STEP_MS };
    assert.equal(decide({ now: T0 + 2 * IDLE_STEP_MS - 1, state }), "none");
    assert.equal(decide({ now: T0 + 2 * IDLE_STEP_MS, state }), "finish");
  });

  it("a child that answers a reminder and stops again gets a fresh wait before the next step", () => {
    // Reminder at T0+step; child ran, then stopped again at T0+step+5s (new waitingSince).
    const state: IdleWatchState = { nudges: IDLE_MAX_NUDGES, lastNudgeAt: T0 + IDLE_STEP_MS };
    const restartedAt = T0 + IDLE_STEP_MS + 5_000;
    assert.equal(decide({ waitingSince: restartedAt, now: restartedAt + IDLE_STEP_MS - 1, state }), "none");
    assert.equal(decide({ waitingSince: restartedAt, now: restartedAt + IDLE_STEP_MS, state }), "finish");
  });

  it("walks a silent child from waiting to finished in nudge, nudge, finish", () => {
    const state: IdleWatchState = { nudges: 0 };
    const actions: string[] = [];
    for (let now = T0; now <= T0 + 4 * IDLE_STEP_MS; now += 1_000) {
      const action = decide({ now, state });
      if (action === "nudge") {
        state.nudges += 1;
        state.lastNudgeAt = now;
      }
      if (action !== "none") actions.push(action);
      if (action === "finish") break;
    }
    assert.deepEqual(actions, ["nudge", "nudge", "finish"]);
  });
});
