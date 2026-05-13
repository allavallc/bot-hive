import { randomUUID } from "node:crypto";
import { projects, user } from "@/db/schema";
import { test } from "@/lib/test-db";
import { describe, expect } from "vitest";
import { connectBot, disconnectBot } from "./bot-stream";

async function seedProject(tx: Parameters<typeof connectBot>[4] & object) {
  const userId = `vitest-${randomUUID()}`;
  const githubRepo = `vitest/${userId.slice(0, 8)}`;
  await tx.insert(user).values({
    id: userId,
    name: "vitest",
    email: `${userId}@example.invalid`,
  });
  const [project] = await tx
    .insert(projects)
    .values({
      billingOwnerId: userId,
      githubRepo,
      installId: Math.floor(Math.random() * 1_000_000),
      displayName: "vitest",
    })
    .returning({ id: projects.id });
  return project.id;
}

describe("connectBot — colony grows from 0 to 5", () => {
  test("solo bot at seat 1 gets the full consolidation", async ({ tx }) => {
    const pid = await seedProject(tx);
    const result = await connectBot(pid, "allavallc", "wren", "conn-wren", tx);
    expect(result.seat).toBe(1);
    expect(result.selfRole).toBe("PM + coder + tester");
    expect(result.peerPushes).toEqual([]);
    expect(result.snapshot).toEqual([{ handle: "wren", seat: 1, role: "PM + coder + tester" }]);
  });

  test("second bot demotes the first", async ({ tx }) => {
    const pid = await seedProject(tx);
    await connectBot(pid, "allavallc", "wren", "conn-wren", tx);
    const second = await connectBot(pid, "allavallc", "buzz", "conn-buzz", tx);
    expect(second.seat).toBe(2);
    expect(second.selfRole).toBe("coder");
    // Wren's role changed from PM+coder+tester to PM+tester — must be pushed.
    expect(second.peerPushes).toEqual([
      { connectionId: "conn-wren", handle: "wren", role: "PM + tester", seat: 1 },
    ]);
  });

  test("third bot promotes everyone toward 3-bot table", async ({ tx }) => {
    const pid = await seedProject(tx);
    await connectBot(pid, "allavallc", "wren", "conn-wren", tx);
    await connectBot(pid, "allavallc", "buzz", "conn-buzz", tx);
    const third = await connectBot(pid, "allavallc", "scout", "conn-scout", tx);
    expect(third.seat).toBe(3);
    expect(third.selfRole).toBe("tester");
    // wren PM+tester → PM. buzz coder → coder (unchanged). Only wren in peerPushes.
    expect(third.peerPushes).toEqual([
      { connectionId: "conn-wren", handle: "wren", role: "PM", seat: 1 },
    ]);
  });

  test("fourth bot adds a coder and changes nobody else", async ({ tx }) => {
    const pid = await seedProject(tx);
    await connectBot(pid, "allavallc", "wren", "conn-wren", tx);
    await connectBot(pid, "allavallc", "buzz", "conn-buzz", tx);
    await connectBot(pid, "allavallc", "scout", "conn-scout", tx);
    const fourth = await connectBot(pid, "allavallc", "kestrel", "conn-kestrel", tx);
    expect(fourth.seat).toBe(4);
    expect(fourth.selfRole).toBe("coder (additional)");
    expect(fourth.peerPushes).toEqual([]);
  });

  test("fifth bot also adds a coder; no peer pushes", async ({ tx }) => {
    const pid = await seedProject(tx);
    await connectBot(pid, "allavallc", "wren", "conn-wren", tx);
    await connectBot(pid, "allavallc", "buzz", "conn-buzz", tx);
    await connectBot(pid, "allavallc", "scout", "conn-scout", tx);
    await connectBot(pid, "allavallc", "kestrel", "conn-kestrel", tx);
    const fifth = await connectBot(pid, "allavallc", "falcon", "conn-falcon", tx);
    expect(fifth.seat).toBe(5);
    expect(fifth.selfRole).toBe("coder (additional)");
    expect(fifth.peerPushes).toEqual([]);
  });
});

describe("disconnectBot — colony shrinks from 5 to 0", () => {
  test("removing middle bot (seat 2) flips survivor roles", async ({ tx }) => {
    const pid = await seedProject(tx);
    await connectBot(pid, "allavallc", "wren", "conn-wren", tx);
    await connectBot(pid, "allavallc", "buzz", "conn-buzz", tx);
    await connectBot(pid, "allavallc", "scout", "conn-scout", tx);
    await connectBot(pid, "allavallc", "kestrel", "conn-kestrel", tx);
    await connectBot(pid, "allavallc", "falcon", "conn-falcon", tx);

    const result = await disconnectBot(pid, "allavallc", "buzz", "conn-buzz", tx);
    expect(result).not.toBeNull();
    expect(result?.departed).toEqual({ handle: "buzz", seat: 2 });
    // After renumber: wren=1 PM, scout=2 coder (was tester), kestrel=3 tester (was coder), falcon=4 coder.
    expect(result?.snapshot).toEqual([
      { handle: "wren", seat: 1, role: "PM" },
      { handle: "scout", seat: 2, role: "coder" },
      { handle: "kestrel", seat: 3, role: "tester" },
      { handle: "falcon", seat: 4, role: "coder (additional)" },
    ]);
    // Pushes only for bots whose role changed.
    const pushHandles = result?.peerPushes.map((p) => p.handle).sort();
    expect(pushHandles).toEqual(["kestrel", "scout"]);
  });

  test("removing the PM (seat 1) promotes the next bot", async ({ tx }) => {
    const pid = await seedProject(tx);
    await connectBot(pid, "allavallc", "wren", "conn-wren", tx);
    await connectBot(pid, "allavallc", "buzz", "conn-buzz", tx);
    await connectBot(pid, "allavallc", "scout", "conn-scout", tx);

    const result = await disconnectBot(pid, "allavallc", "wren", "conn-wren", tx);
    // 3 → 2: buzz becomes seat 1 (PM + tester), scout becomes seat 2 (coder).
    expect(result?.snapshot).toEqual([
      { handle: "buzz", seat: 1, role: "PM + tester" },
      { handle: "scout", seat: 2, role: "coder" },
    ]);
    // buzz coder → PM+tester (changed). scout tester → coder (changed). Both push.
    const pushHandles = result?.peerPushes.map((p) => p.handle).sort();
    expect(pushHandles).toEqual(["buzz", "scout"]);
  });

  test("removing tail (seat 3) doesn't renumber; only consolidation re-derive", async ({ tx }) => {
    const pid = await seedProject(tx);
    await connectBot(pid, "allavallc", "wren", "conn-wren", tx);
    await connectBot(pid, "allavallc", "buzz", "conn-buzz", tx);
    await connectBot(pid, "allavallc", "scout", "conn-scout", tx);

    const result = await disconnectBot(pid, "allavallc", "scout", "conn-scout", tx);
    expect(result?.snapshot).toEqual([
      { handle: "wren", seat: 1, role: "PM + tester" },
      { handle: "buzz", seat: 2, role: "coder" },
    ]);
    const pushHandles = result?.peerPushes.map((p) => p.handle).sort();
    expect(pushHandles).toEqual(["wren"]);
  });

  test("last bot leaves; colony is empty", async ({ tx }) => {
    const pid = await seedProject(tx);
    await connectBot(pid, "allavallc", "wren", "conn-wren", tx);
    const result = await disconnectBot(pid, "allavallc", "wren", "conn-wren", tx);
    expect(result?.snapshot).toEqual([]);
    expect(result?.peerPushes).toEqual([]);
  });

  test("disconnect with stale connectionId is a no-op", async ({ tx }) => {
    const pid = await seedProject(tx);
    await connectBot(pid, "allavallc", "wren", "conn-old", tx);
    // Re-open with a new connectionId — rebinds the row.
    await connectBot(pid, "allavallc", "wren", "conn-new", tx);
    // Old connection's disconnect should be a no-op.
    const stale = await disconnectBot(pid, "allavallc", "wren", "conn-old", tx);
    expect(stale).toBeNull();
  });

  test("reconnect with same handle keeps seat", async ({ tx }) => {
    const pid = await seedProject(tx);
    const first = await connectBot(pid, "allavallc", "wren", "conn-a", tx);
    const second = await connectBot(pid, "allavallc", "wren", "conn-b", tx);
    expect(second.seat).toBe(first.seat);
  });
});
