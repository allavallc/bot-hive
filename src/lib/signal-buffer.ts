/**
 * Per-project ring buffer of ephemeral signals.
 *
 * Signals are short-lived chatter between agents (and humans) on the live
 * board's real-time channel. They complement events.log, which is the durable
 * audit trail. Signals are intentionally NOT persisted — process restart wipes
 * them; that's fine because they encode in-the-moment intent ("I'm starting
 * HV-X", "blocked on Y") which has no value once the moment passes.
 *
 * Two bounding rules:
 *  - MAX_SIGNALS_PER_PROJECT — oldest evicted FIFO when buffer is full.
 *  - SIGNAL_TTL_MS — anything older is lazily pruned on read.
 *
 * Substrate-portable: today the buffer is a process-local Map. When/if we go
 * multi-instance, swap to Redis pub/sub + a sliding-window key without
 * changing the API surface.
 */

export const MAX_SIGNALS_PER_PROJECT = 100;
export const SIGNAL_TTL_MS = 60 * 60 * 1000; // 1 hour

export type SignalType = "claim" | "done" | "blocked" | "question" | "note" | "handoff";

export const SIGNAL_TYPES: readonly SignalType[] = [
  "claim",
  "done",
  "blocked",
  "question",
  "note",
  "handoff",
] as const;

export type Signal = {
  id: string;
  timestamp: string;
  type: SignalType;
  message: string;
  bot?: string;
  user?: string;
  refs?: string[];
};

const buffers = new Map<string, Signal[]>();

function pruneStale(buf: Signal[], now: number = Date.now()): Signal[] {
  return buf.filter((s) => now - new Date(s.timestamp).getTime() < SIGNAL_TTL_MS);
}

export function addSignal(projectId: string, signal: Signal): void {
  const existing = buffers.get(projectId) ?? [];
  let next = pruneStale(existing);
  next.push(signal);
  if (next.length > MAX_SIGNALS_PER_PROJECT) {
    next = next.slice(-MAX_SIGNALS_PER_PROJECT);
  }
  buffers.set(projectId, next);
}

export function getSignals(projectId: string): Signal[] {
  const buf = buffers.get(projectId);
  if (!buf || buf.length === 0) return [];
  const fresh = pruneStale(buf);
  if (fresh.length !== buf.length) {
    buffers.set(projectId, fresh);
  }
  return fresh;
}

export function isSignalType(value: unknown): value is SignalType {
  return typeof value === "string" && (SIGNAL_TYPES as readonly string[]).includes(value);
}

// Test-only — clears all buffers. Production code should never call this.
export function __resetSignals(): void {
  buffers.clear();
}
