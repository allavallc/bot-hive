import { randomUUID } from "node:crypto";
import {
  MAX_SIGNALS_PER_PROJECT,
  SIGNAL_TTL_MS,
  type Signal,
  __resetSignals,
  addSignal,
  getSignals,
  isSignalType,
} from "@/lib/signal-buffer";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: "note",
    message: "hello",
    bot: "vitest",
    ...overrides,
  };
}

describe("signal-buffer", () => {
  beforeEach(() => {
    __resetSignals();
    vi.useRealTimers();
  });

  afterEach(() => {
    __resetSignals();
    vi.useRealTimers();
  });

  test("addSignal + getSignals roundtrip on a fresh project", () => {
    const projectId = `proj-${randomUUID()}`;
    const s = makeSignal({ message: "first" });
    addSignal(projectId, s);
    expect(getSignals(projectId)).toEqual([s]);
  });

  test("getSignals on an unknown project returns empty array", () => {
    expect(getSignals("never-existed")).toEqual([]);
  });

  test("buffers are isolated per project", () => {
    const a = `proj-a-${randomUUID()}`;
    const b = `proj-b-${randomUUID()}`;
    addSignal(a, makeSignal({ message: "in a" }));
    addSignal(b, makeSignal({ message: "in b" }));
    expect(getSignals(a)).toHaveLength(1);
    expect(getSignals(b)).toHaveLength(1);
    expect(getSignals(a)[0].message).toBe("in a");
    expect(getSignals(b)[0].message).toBe("in b");
  });

  test("FIFO eviction at MAX_SIGNALS_PER_PROJECT", () => {
    const projectId = `proj-${randomUUID()}`;
    for (let i = 0; i < MAX_SIGNALS_PER_PROJECT + 5; i++) {
      addSignal(projectId, makeSignal({ message: `n=${i}` }));
    }
    const signals = getSignals(projectId);
    expect(signals).toHaveLength(MAX_SIGNALS_PER_PROJECT);
    // Oldest 5 evicted; first remaining is n=5.
    expect(signals[0].message).toBe("n=5");
    expect(signals[signals.length - 1].message).toBe(`n=${MAX_SIGNALS_PER_PROJECT + 4}`);
  });

  test("signals older than TTL are pruned on read", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T00:00:00Z"));

    const projectId = `proj-${randomUUID()}`;
    addSignal(projectId, makeSignal({ message: "old" }));

    // Advance clock past TTL.
    vi.setSystemTime(new Date(Date.now() + SIGNAL_TTL_MS + 1000));
    addSignal(projectId, makeSignal({ message: "new" }));

    const signals = getSignals(projectId);
    expect(signals).toHaveLength(1);
    expect(signals[0].message).toBe("new");
  });

  test("isSignalType validates the enum", () => {
    expect(isSignalType("claim")).toBe(true);
    expect(isSignalType("done")).toBe(true);
    expect(isSignalType("blocked")).toBe(true);
    expect(isSignalType("question")).toBe(true);
    expect(isSignalType("note")).toBe(true);
    expect(isSignalType("handoff")).toBe(true);
    expect(isSignalType("unknown")).toBe(false);
    expect(isSignalType("")).toBe(false);
    expect(isSignalType(123)).toBe(false);
    expect(isSignalType(null)).toBe(false);
    expect(isSignalType(undefined)).toBe(false);
  });
});
