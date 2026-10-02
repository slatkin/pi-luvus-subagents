/**
 * Pi → Luvus live-status bridge.
 *
 * Luvus detects pi panes via the process tree but has no screen rules for
 * pi's TUI, so every pi pane reads `idle` (`no_positive_state_evidence`)
 * even mid-turn. This module publishes a leased status instead, the same
 * `agent report` API the Claude hook uses: `working` while a turn runs,
 * `idle` while the session waits for input, released on shutdown so a
 * clean exit never leaves a stale lease behind. Reports carry a short TTL
 * as a backstop for unclean kills, and repeat statuses are skipped so
 * high-frequency events cost nothing.
 */
import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Lease source id for `agent report` / `agent release`. */
export const LUVUS_STATUS_SOURCE = "pi-luvus-status";
/** Lease TTL in seconds — re-reported on every transition, so a short
 *  backstop is safe even for long turns (worst case after kill -9). */
export const LUVUS_STATUS_TTL_S = 300;

/** Module-level, so it dies with the extension runtime on /reload — a
 *  globalThis flag would survive the runtime replacement and leave the
 *  reloaded extension with no listeners at all. Within one runtime, index.ts
 *  and subagent-done.ts share the module instance, so this still dedupes. */
let registeredInRuntime = false;

/** Test hook: reset the per-runtime registration guard. */
export function __resetRegistrationForTests__(): void {
  registeredInRuntime = false;
}
export type LuvusAgentStatus = "working" | "idle";

export function buildReportArgs(pane: string, status: LuvusAgentStatus): string[] {
  return [
    "agent",
    "report",
    pane,
    "--source",
    LUVUS_STATUS_SOURCE,
    "--kind",
    "pi",
    "--status",
    status,
    "--ttl",
    String(LUVUS_STATUS_TTL_S),
  ];
}

export function buildReleaseArgs(pane: string): string[] {
  return ["agent", "release", pane, "--source", LUVUS_STATUS_SOURCE];
}

/** Bind the pane to pi's native session id so Mission Control usage and
 *  resume work. pi publishes its session file via PI_SESSION_FILE; the id is
 *  the uuid after the timestamp prefix in the basename. */
export function piSessionId(env: NodeJS.ProcessEnv = process.env): string | null {
  const file = env.PI_SESSION_FILE;
  if (!file) return null;
  const base = file.split("/").pop() ?? "";
  const id = base.replace(/\.jsonl$/, "").split("_").pop() ?? "";
  return id || null;
}

export function buildSessionBindArgs(pane: string, sessionId: string): string[] {
  return ["pane", "report", pane, "--agent", "pi", "--session", sessionId];
}

/** The caller's pane when pi runs inside Luvus, else null (same env check
 *  as isMuxAvailable in luvus.ts, plus the pane id self-reports target). */
export function luvusStatusPane(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!env.LUVUS_ENV || !env.LUVUS_BIN_PATH || !env.LUVUS_PANE_ID) return null;
  return env.LUVUS_PANE_ID;
}

export interface LuvusStatusReporter {
  report(status: LuvusAgentStatus): void;
  release(): void;
  register(pi: ExtensionAPI): void;
}

export function createLuvusStatusReporter(
  exec: (bin: string, args: string[]) => void = (bin, args) =>
    execFileSync(bin, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "ignore", "ignore"] }),
  env: NodeJS.ProcessEnv = process.env,
): LuvusStatusReporter {
  let lastReported: LuvusAgentStatus | null = null;

  function report(status: LuvusAgentStatus): void {
    const pane = luvusStatusPane(env);
    if (!pane || lastReported === status) return;
    try {
      exec(env.LUVUS_BIN_PATH as string, buildReportArgs(pane, status));
      lastReported = status;
    } catch {
      // Best effort — a failed report retries on the next transition.
    }
  }

  function release(): void {
    const pane = luvusStatusPane(env);
    if (!pane || lastReported === null) return;
    try {
      exec(env.LUVUS_BIN_PATH as string, buildReleaseArgs(pane));
    } catch {
      // Releasing a missing/expired lease errors — the lease is gone either way.
    } finally {
      lastReported = null;
    }
  }

  function bindSession(sessionId: string | null): void {
    const pane = luvusStatusPane(env);
    if (!pane || !sessionId) return;
    try {
      exec(env.LUVUS_BIN_PATH as string, buildSessionBindArgs(pane, sessionId));
    } catch {
      // Best effort — Mission Control usage stays unbound until next start.
    }
  }

  function register(pi: ExtensionAPI): void {
    if (registeredInRuntime) return;
    registeredInRuntime = true;
    pi.on("session_start", (_event, ctx) => {
      // pi injects PI_SESSION_FILE only into spawned children, not into its own
      // process env — read the live id from the session manager.
      const id =
        (ctx as { sessionManager?: { getSessionId?: () => string | null } } | undefined)?.sessionManager?.getSessionId?.() ??
        piSessionId(env);
      bindSession(id || null);
      report("idle");
    });
    pi.on("agent_start", () => report("working"));
    pi.on("turn_start", () => report("working"));
    pi.on("agent_end", () => report("idle"));
    pi.on("session_shutdown", () => release());
  }

  return { report, release, register };
}
