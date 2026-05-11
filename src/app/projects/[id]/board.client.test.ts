import { describe, expect, it } from "vitest";
import { effectiveState } from "./board-state";

// HV-075: optimistic column placement.
// effectiveState is the pure function the bucketing loop uses to decide
// which column a card renders in. The actual ticket.state is unchanged.

describe("effectiveState (HV-075 optimistic column placement)", () => {
  it("returns the raw state when no pending transition is set", () => {
    expect(effectiveState("backlog", undefined)).toBe("backlog");
    expect(effectiveState("in-progress", undefined)).toBe("in-progress");
    expect(effectiveState("in-review", undefined)).toBe("in-review");
    expect(effectiveState("done", undefined)).toBe("done");
  });

  it("renders an in-review ticket in 'done' when pending=approved", () => {
    expect(effectiveState("in-review", "approved")).toBe("done");
  });

  it("renders an in-review ticket in 'in-progress' when pending=rejected", () => {
    expect(effectiveState("in-review", "rejected")).toBe("in-progress");
  });

  it("ignores pending if the ticket is no longer in-review (defensive)", () => {
    // SSE refresh has caught up — ticket already moved by the server. The
    // pending entry hasn't been cleared yet, but we don't want it to drag
    // the card back. Trust the real state.
    expect(effectiveState("done", "approved")).toBe("done");
    expect(effectiveState("in-progress", "rejected")).toBe("in-progress");
    expect(effectiveState("backlog", "approved")).toBe("backlog");
  });
});
