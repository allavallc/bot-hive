import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type BroadcastEvent, __resetBroadcast, broadcast, subscribe } from "./broadcast";

describe("broadcast", () => {
  beforeEach(() => __resetBroadcast());
  afterEach(() => __resetBroadcast());

  test("subscribe returns a callable unsubscribe function", () => {
    const unsub = subscribe(`p-${randomUUID()}`, vi.fn());
    expect(typeof unsub).toBe("function");
  });

  test("all subscribers for a projectId fire on broadcast", () => {
    const pid = `p-${randomUUID()}`;
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    subscribe(pid, fn1);
    subscribe(pid, fn2);
    const evt: BroadcastEvent = { type: "project-changed", projectId: pid };
    broadcast(evt);
    expect(fn1).toHaveBeenCalledWith(evt);
    expect(fn2).toHaveBeenCalledWith(evt);
  });

  test("unsubscribe removes only that subscriber", () => {
    const pid = `p-${randomUUID()}`;
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const unsub1 = subscribe(pid, fn1);
    subscribe(pid, fn2);
    unsub1();
    broadcast({ type: "project-changed", projectId: pid });
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledOnce();
  });

  test("subscribers for a different projectId do not fire", () => {
    const pid1 = `p-${randomUUID()}`;
    const pid2 = `p-${randomUUID()}`;
    const fn = vi.fn();
    subscribe(pid1, fn);
    broadcast({ type: "project-changed", projectId: pid2 });
    expect(fn).not.toHaveBeenCalled();
  });

  test("last unsubscribe cleans up the projectId entry — no throw on subsequent broadcast", () => {
    const pid = `p-${randomUUID()}`;
    const unsub = subscribe(pid, vi.fn());
    unsub();
    expect(() => broadcast({ type: "project-changed", projectId: pid })).not.toThrow();
  });

  test("subscriber that throws does not prevent other subscribers from firing", () => {
    const pid = `p-${randomUUID()}`;
    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    const safe = vi.fn();
    subscribe(pid, throwing);
    subscribe(pid, safe);
    expect(() => broadcast({ type: "project-changed", projectId: pid })).not.toThrow();
    expect(safe).toHaveBeenCalledOnce();
  });
});
