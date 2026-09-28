/**
 * Luvus backend for subagent panes — the only supported terminal host.
 *
 * Every CLI call executes the binary at `$LUVUS_BIN_PATH` directly (no shell,
 * no PATH lookup) and parses the JSON envelope: `.result` on success, `.error`
 * thrown as an Error otherwise. Availability is an env check: pi must run
 * inside a Luvus pane (`LUVUS_ENV`, `LUVUS_BIN_PATH`, `LUVUS_PANE_ID`).
 */
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const execFileAsync = promisify(execFile);

function luvusBinPath(): string {
  const bin = process.env.LUVUS_BIN_PATH;
  if (!bin) throw new Error("LUVUS_BIN_PATH is not set. Start pi inside a Luvus pane.");
  return bin;
}

/** Shape of `Luvus` CLI `.result` payloads this backend consumes. */
interface LuvusResult {
  /** `pane split` — the new pane id */
  pane?: string | number;
  /** `pane read` — the visible screen text */
  text?: string;
  [key: string]: unknown;
}

function parseEnvelope(stdout: string): LuvusResult {
  let parsed: { result?: unknown; error?: { message?: unknown } & Record<string, unknown> };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Unexpected Luvus output (not JSON): ${stdout.trim().slice(0, 200)}`);
  }
  if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error) {
    const message = parsed.error.message;
    throw new Error(typeof message === "string" && message ? message : JSON.stringify(parsed.error));
  }
  return parsed?.result && typeof parsed.result === "object" ? (parsed.result as LuvusResult) : {};
}

/** Run a Luvus CLI command by exact path, no shell; resolve to `.result`. */
function luvus(args: string[]): LuvusResult {
  try {
    return parseEnvelope(execFileSync(luvusBinPath(), args, { encoding: "utf8" }));
  } catch (error) {
    // Non-zero exit: the envelope (with `.error`) is on stdout, but
    // execFileSync only reports "Command failed" — re-parse to surface
    // Luvus's own message, which the error contracts require.
    const stdout = (error as { stdout?: unknown }).stdout;
    if (typeof stdout === "string" && stdout.includes('"error"')) {
      parseEnvelope(stdout); // throws with the Luvus message
    }
    throw error;
  }
}

async function luvusAsync(args: string[]): Promise<LuvusResult> {
  try {
    const { stdout } = await execFileAsync(luvusBinPath(), args, { encoding: "utf8" });
    return parseEnvelope(stdout);
  } catch (error) {
    const stdout = (error as { stdout?: unknown }).stdout;
    if (typeof stdout === "string" && stdout.includes('"error"')) {
      parseEnvelope(stdout); // throws with the Luvus message
    }
    throw error;
  }
}

export function isMuxAvailable(): boolean {
  return !!(process.env.LUVUS_ENV && process.env.LUVUS_BIN_PATH && process.env.LUVUS_PANE_ID);
}

export function muxSetupHint(): string {
  return "Start pi inside a Luvus pane.";
}

export function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function tailLines(text: string, lines: number): string {
  const split = text.split("\n");
  if (split.length <= lines) return text;
  return split.slice(-lines).join("\n");
}

/**
 * Luvus pane names must match [a-z][a-z0-9_-]{0,31} (verified live), while
 * subagent names are free text — slugify ("Review: API diff!" → "review-api-diff").
 */
function slugifyPaneName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  const slug = (cleaned.length > 0 ? cleaned : "subagent").slice(0, 32);
  return /^[a-z]/.test(slug) ? slug : `s-${slug.slice(0, 30)}`;
}

function paneReadText(result: LuvusResult): string {
  const { text } = result;
  if (typeof text !== "string") {
    throw new Error(`Unexpected pane read result: ${JSON.stringify(result)}`);
  }
  return text;
}

/**
 * Create a new terminal surface for a subagent: split the caller's pane
 * (`$LUVUS_PANE_ID`) without taking focus, then name the new pane after the
 * subagent. Returns the new pane id.
 */
export function createSurface(name: string): string {
  const caller = process.env.LUVUS_PANE_ID;
  if (!caller) {
    throw new Error("LUVUS_PANE_ID is not set. Start pi inside a Luvus pane.");
  }

  const result = luvus(["pane", "split", caller, "--no-focus"]);
  // Verified live (fixture in test/test.ts): the new pane id is `result.pane`.
  const { pane } = result;
  if (pane === undefined || pane === null || pane === "") {
    throw new Error(`Unexpected pane split result (no pane id): ${JSON.stringify(result)}`);
  }
  const surface = String(pane);

  try {
    luvus(["pane", "name", slugifyPaneName(name), "--pane", surface]);
  } catch {
    // Optional — naming is cosmetic, the pane works unnamed.
  }
  return surface;
}

/**
 * Send a command string to a pane and execute it there.
 */
function sendCommand(surface: string, command: string): void {
  luvus(["pane", "run", surface, command]);
}

/**
 * Send a long command to a pane by writing it to a script file first.
 * This avoids terminal line-wrapping issues that break commands exceeding the
 * pane's column width when sent character-by-character.
 *
 * By default the script is written to a temp directory, but callers can pass a
 * stable path (for example under session artifacts) so the exact invocation is
 * preserved for debugging.
 *
 * Returns the script path.
 */
export function sendLongCommand(
  surface: string,
  command: string,
  options?: { scriptPath?: string; scriptPreamble?: string },
): string {
  const scriptPath =
    options?.scriptPath ??
    join(
      tmpdir(),
      "pi-subagent-scripts",
      `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.sh`,
    );
  mkdirSync(dirname(scriptPath), { recursive: true });

  const scriptParts = ["#!/bin/bash"];
  if (options?.scriptPreamble) {
    scriptParts.push(options.scriptPreamble.trimEnd());
  }
  scriptParts.push(command);

  writeFileSync(scriptPath, scriptParts.join("\n") + "\n", {
    mode: 0o755,
  });
  sendCommand(surface, `bash ${shellEscape(scriptPath)}`);
  return scriptPath;
}

/**
 * Read the screen contents of a pane (sync). `pane read` takes no --lines
 * flag (it silently ignores unknown flags, verified live), so tail here.
 */
export function readScreen(surface: string, lines = 50): string {
  return tailLines(paneReadText(luvus(["pane", "read", surface])), lines);
}

/**
 * Read the screen contents of a pane (async).
 */
export async function readScreenAsync(surface: string, lines = 50): Promise<string> {
  return tailLines(paneReadText(await luvusAsync(["pane", "read", surface])), lines);
}

/**
 * Send one Escape keypress to an active pane.
 */
export function sendEscape(surface: string): void {
  luvus(["agent", "keys", surface, "esc"]);
}

/**
 * Close a pane.
 */
export function closeSurface(surface: string): void {
  luvus(["pane", "close", surface]);
}

export interface PollResult {
  /** How the subagent exited */
  reason: "done" | "ping" | "sentinel" | "error";
  /** Shell exit code (from sentinel). 0 for file-based exits. */
  exitCode: number;
  /** Ping data if reason is "ping" */
  ping?: { name: string; message: string };
  /** Error message if reason is "error" (auto-retry exhausted, provider overload, etc.) */
  errorMessage?: string;
}

/**
 * Interpret an `.exit` sidecar payload (written by subagent_done / caller_ping /
 * the error path in subagent-done.ts). Centralized so both the fast and slow
 * paths in pollForExit decode the payload the same way.
 */
function interpretExitSidecar(data: any): PollResult {
  if (data?.type === "ping") {
    return {
      reason: "ping",
      exitCode: 0,
      ping: { name: data.name, message: data.message },
    };
  }
  if (data?.type === "error") {
    const errorMessage =
      typeof data.errorMessage === "string" && data.errorMessage.trim() !== ""
        ? data.errorMessage
        : "Subagent exited with stopReason=error (no errorMessage in sidecar).";
    return { reason: "error", exitCode: 1, errorMessage };
  }
  return { reason: "done", exitCode: 0 };
}

export const __pollForExitTest__ = { interpretExitSidecar };

/**
 * Poll until the subagent exits. Checks for a `.exit` sidecar file first
 * (written by subagent_done / caller_ping), falling back to the terminal
 * sentinel for crash detection.
 */
export async function pollForExit(
  surface: string,
  signal: AbortSignal,
  options: {
    interval: number;
    sessionFile?: string;
    sentinelFile?: string;
    onTick?: (elapsed: number) => void;
  },
): Promise<PollResult> {
  const start = Date.now();

  for (;;) {
    if (signal.aborted) {
      throw new Error("Aborted while waiting for subagent to finish");
    }

    // Fast path: check for .exit sidecar file (written by subagent_done / caller_ping)
    if (options.sessionFile) {
      try {
        const exitFile = `${options.sessionFile}.exit`;
        if (existsSync(exitFile)) {
          const data = JSON.parse(readFileSync(exitFile, "utf8"));
          rmSync(exitFile, { force: true });
          return interpretExitSidecar(data);
        }
      } catch {}
    }

    // Check Claude sentinel file (written by plugin Stop hook)
    if (options.sentinelFile) {
      try {
        if (existsSync(options.sentinelFile)) {
          return { reason: "sentinel", exitCode: 0 };
        }
      } catch {}
    }

    // Slow path: read terminal screen for sentinel (crash detection)
    try {
      const screen = await readScreenAsync(surface, 5);
      const match = screen.match(/__SUBAGENT_DONE_(\d+)__/);
      if (match) {
        return { reason: "sentinel", exitCode: parseInt(match[1], 10) };
      }
    } catch {
      // Surface may have been destroyed — check if .exit file appeared in the meantime
      if (options.sessionFile) {
        try {
          const exitFile = `${options.sessionFile}.exit`;
          if (existsSync(exitFile)) {
            const data = JSON.parse(readFileSync(exitFile, "utf8"));
            rmSync(exitFile, { force: true });
            return interpretExitSidecar(data);
          }
        } catch {}
      }
    }

    const elapsed = Math.floor((Date.now() - start) / 1000);
    options.onTick?.(elapsed);

    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new Error("Aborted"));
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, options.interval);
      function onAbort() {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
