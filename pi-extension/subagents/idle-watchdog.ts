/**
 * Parent-side backstop for subagents that finish their turn and never exit.
 *
 * The child extension nudges a forgetful agent itself, but that depends on child
 * state and on the model reacting. This watches the child's activity file from
 * the parent instead: a non-interactive child stuck in `waiting` gets reminded
 * from outside, and is finished by the parent if it still does nothing.
 */

/** Continuous `waiting` time before the first reminder, and between later steps. */
export const IDLE_STEP_MS = 30_000;
/** Reminders sent before the parent gives up and finishes the subagent. */
export const IDLE_MAX_NUDGES = 2;

export const IDLE_NUDGE_TEXT =
  "[Auto reminder from the orchestrator]\n" +
  "Your turn has ended but the session is still open. If your task is complete, call subagent_done now. " +
  "If you need input from the caller, call caller_ping. If you are not finished, continue working.";

export type IdleAction = "none" | "nudge" | "finish";

export interface IdleWatchState {
  /** Reminders the parent has sent so far. */
  nudges: number;
  /** When the parent last sent a reminder. */
  lastNudgeAt?: number;
}

export function decideIdleAction(params: {
  interactive: boolean;
  phase: string | undefined;
  waitingSince: number | undefined;
  now: number;
  state: IdleWatchState;
}): IdleAction {
  const { interactive, phase, waitingSince, now, state } = params;
  if (interactive || phase !== "waiting" || waitingSince === undefined) return "none";
  if (now - waitingSince < IDLE_STEP_MS) return "none";

  const sinceNudge = state.lastNudgeAt === undefined ? Infinity : now - state.lastNudgeAt;
  if (sinceNudge < IDLE_STEP_MS) return "none";

  return state.nudges >= IDLE_MAX_NUDGES ? "finish" : "nudge";
}
