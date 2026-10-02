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
  /** `pane split` / `pane move` — the pane id */
  pane?: string | number;
  /** `pane read` — the visible screen text */
  text?: string;
  /** `agent list` — every agent across all workspaces/tabs */
  agents?: Array<{ pane?: unknown; tab?: unknown; focused?: unknown; [key: string]: unknown }>;
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

/** C0 controls, DEL, and C1 controls (includes ESC, BEL, and the 8-bit CAP). */
const OSC_TITLE_CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/g;

function firstNonEmptyLine(text: string): string {
  for (const line of text.split("\n")) {
    if (line.trim().length > 0) return line;
  }
  return "";
}

/**
 * Build the OSC 2 title line for a subagent pane, or "" when the name has no
 * printable text. The title is `<name> — <task>`, with the task taken from its
 * first non-empty line and truncated to 48 characters; the name alone when
 * there is no task text. Control characters are stripped so untrusted task
 * text cannot smuggle terminal escape sequences, and the title is passed to
 * printf as an argument (never as the format string).
 */
export function buildOscTitleLine(name: string, task?: string): string {
  const cleanName = name.replace(OSC_TITLE_CONTROL_CHARS, "").trim();
  if (cleanName.length === 0) return "";
  const taskText = firstNonEmptyLine(task ?? "")
    .replace(OSC_TITLE_CONTROL_CHARS, "")
    .trim();
  const title = taskText.length > 0 ? `${cleanName} — ${taskText.slice(0, 48)}` : cleanName;
  // 8s is a fixed heuristic: pi wipes a title emitted before it boots (it
  // enters the alternate screen), so emit it late and backgrounded. If pi
  // boots slower the title lands mid-boot and is wiped again — upgrade path
  // is a longer delay or polling for readiness.
  return `( sleep 8; printf '\\033]2;%s\\007' ${shellEscape(title)} ) &`;
}

function paneReadText(result: LuvusResult): string {
  const { text } = result;
  if (typeof text !== "string") {
    throw new Error(`Unexpected pane read result: ${JSON.stringify(result)}`);
  }
  return text;
}

/**
 * Surface placement for a subagent: a split of the caller's pane to the right
 * (side by side) or down (stacked), or its own tab.
 */
export type SurfacePlacement = "right" | "down" | "tab";

export const DEFAULT_SURFACE_PLACEMENT: SurfacePlacement = "right";

/** Parse a placement value. The legacy "pane" (auto split) means the default split. */
export function parseSurfacePlacement(value: unknown): SurfacePlacement | undefined {
  if (value === "pane") return DEFAULT_SURFACE_PLACEMENT;
  return value === "right" || value === "down" || value === "tab" ? value : undefined;
}

/**
 * Find the tab hosting the caller's pane via `agent list` (entries carry
 * `pane` and `tab` fields). Returns null when the caller cannot be found —
 * callers must then keep pane placement, since a tab move cannot be undone
 * by a focus restore we cannot compute.
 */
function findCallerTab(caller: string): string | null {
  try {
    const { agents } = luvus(["agent", "list"]);
    const mine = agents?.find((agent) => String(agent?.pane) === caller);
    if (mine && mine.tab !== undefined && mine.tab !== null && mine.tab !== "") {
      return String(mine.tab);
    }
  } catch {
    // Discovery failed — fall back to pane placement.
  }
  return null;
}

/**
 * Create a new terminal surface for a subagent. Right/down placement splits
 * the caller's pane (`$LUVUS_PANE_ID`) without taking focus. Tab
 * placement additionally moves the new pane to its own workspace tab and then
 * restores focus to the caller's tab, because `pane move --new-tab` always
 * focuses the moved pane (no --no-focus exists on `pane move` or `tab new`).
 * Returns the new pane id — valid for pane run/read/close regardless of tab.
 */
export function createSurface(name: string, placement: SurfacePlacement = DEFAULT_SURFACE_PLACEMENT): string {
  const caller = process.env.LUVUS_PANE_ID;
  if (!caller) {
    throw new Error("LUVUS_PANE_ID is not set. Start pi inside a Luvus pane.");
  }

  // Look up the caller's tab before the split: tab positions shift as other
  // sessions open and close tabs, so a stale lookup could restore the wrong
  // tab. An unknown caller tab downgrades the spawn to pane placement.
  const callerTab = placement === "tab" ? findCallerTab(caller) : null;

  const result = luvus(["pane", "split", caller, placement === "down" ? "--down" : "--right", "--no-focus"]);
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

  if (callerTab !== null) {
    try {
      luvus(["pane", "move", surface, "--new-tab"]);
      // ponytail: a user refocusing another tab between move and restore gets
      // yanked back; an upstream `focus: false` on tab.new removes the race.
      luvus(["tab", "focus", callerTab]);
    } catch {
      // Move failed → the pane is still a correct split of the caller's pane.
      // Restore failed → focus stays on the subagent's tab, still functional.
    }
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

/** Shape of the `agent prompt` `.result` payload. */
export interface AgentPromptResult {
  submitted?: boolean;
  evidence?: string;
  pane?: string | number;
  status?: string;
  [key: string]: unknown;
}

/**
 * Deliver `text` to a pane as input and submit it: Luvus `agent prompt` with no
 * `--wait`. Resolves as soon as Luvus reports the text queued, without waiting
 * for the target to act. A blocked target (an approval screen, for example)
 * throws the Luvus `agent_not_ready` error, which callers report rather than
 * retry.
 */
export function agentPrompt(pane: string, text: string): AgentPromptResult {
  return luvus(["agent", "prompt", pane, text]) as AgentPromptResult;
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
