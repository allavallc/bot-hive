// Text-based bot activity and event logging.
//
// Two files per colony under logs/<colony>/:
//   events.log   — server-written: connect, disconnect, role change, sweep reap.
//   activity.log — agent-written: ticket claims, findings, decisions, thinking.
//
// Line format: handle-role-sessionId8-ISO8601: message
// The sessionId is the first 8 chars of the SSE connectionId, constant for
// the bot's lifetime. Grep for it to trace one bot across both files.
//
// Non-fatal: write failures are silently ignored so they can never crash the server.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function normalizeRole(role: string): string {
  return role
    .replace(/\s*\(([^)]+)\)\s*/g, "-$1")
    .replace(/\s+/g, "+")
    .toLowerCase();
}

export function appendBotLog(
  colony: string,
  file: "activity" | "events",
  handle: string,
  role: string,
  sessionId: string,
  message: string,
): void {
  try {
    const dir = join(process.cwd(), "logs", colony);
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString();
    const roleNorm = normalizeRole(role);
    const sid = sessionId.slice(0, 8);
    const line = `${handle}-${roleNorm}-${sid}-${ts}: ${message}\n`;
    appendFileSync(join(dir, `${file}.log`), line, "utf-8");
  } catch {
    // Non-fatal.
  }
}
