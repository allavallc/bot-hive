import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { bots, projects, user } from "@/db/schema";
import { test } from "@/lib/test-db";
import { and, eq } from "drizzle-orm";
import { describe, expect, test as vitestTest } from "vitest";
import { allocateSeat, getSeatState } from "./seats";

async function seedProject(tx: Parameters<typeof allocateSeat>[0]) {
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

describe("allocateSeat", () => {
  test("first bot gets seat 1 + consolidated role", async ({ tx }) => {
    const projectId = await seedProject(tx);
    const state = await allocateSeat(tx, projectId, "allavallc", "buzz");
    expect(state).toEqual({
      seat: 1,
      total: 1,
      role: "PM + coder + tester",
      skillFiles: ["hive/skills/pm.md", "hive/skills/coder.md", "hive/skills/tester.md"],
    });
  });

  test("second bot in same (project, colony) gets seat 2 + coder", async ({ tx }) => {
    const projectId = await seedProject(tx);
    await allocateSeat(tx, projectId, "allavallc", "buzz");
    const second = await allocateSeat(tx, projectId, "allavallc", "wren");
    expect(second.seat).toBe(2);
    expect(second.total).toBe(2);
    expect(second.role).toBe("coder");
  });

  test("re-joining same handle is idempotent — same seat returned", async ({ tx }) => {
    const projectId = await seedProject(tx);
    const first = await allocateSeat(tx, projectId, "allavallc", "buzz");
    const again = await allocateSeat(tx, projectId, "allavallc", "buzz");
    expect(again.seat).toBe(first.seat);

    const rows = await tx
      .select()
      .from(bots)
      .where(and(eq(bots.projectId, projectId), eq(bots.colony, "allavallc")));
    expect(rows).toHaveLength(1);
  });

  test("offline row is reactivated on next join with a new lowest-free seat", async ({ tx }) => {
    const projectId = await seedProject(tx);
    await allocateSeat(tx, projectId, "allavallc", "buzz"); // seat 1
    await allocateSeat(tx, projectId, "allavallc", "wren"); // seat 2

    // Mark buzz offline directly (simulates /leave's effect on the row).
    await tx
      .update(bots)
      .set({ status: "offline" })
      .where(and(eq(bots.projectId, projectId), eq(bots.handle, "buzz")));

    const reactivated = await allocateSeat(tx, projectId, "allavallc", "buzz");
    expect(reactivated.seat).toBe(1); // lowest free now that 1 is vacant
    expect(reactivated.total).toBe(2); // buzz active again, wren still seat 2
  });

  test("allocates lowest free seat when there's a gap", async ({ tx }) => {
    const projectId = await seedProject(tx);
    await allocateSeat(tx, projectId, "allavallc", "buzz"); // seat 1
    await allocateSeat(tx, projectId, "allavallc", "wren"); // seat 2
    await allocateSeat(tx, projectId, "allavallc", "kestrel"); // seat 3

    // Simulate wren leaving by hand — mark offline, leave seat 2 vacant.
    await tx
      .update(bots)
      .set({ status: "offline" })
      .where(and(eq(bots.projectId, projectId), eq(bots.handle, "wren")));

    const newcomer = await allocateSeat(tx, projectId, "allavallc", "starling");
    expect(newcomer.seat).toBe(2); // fills the gap before going to seat 4
  });

  test("isolates seat numbering between colonies in the same project", async ({ tx }) => {
    const projectId = await seedProject(tx);
    await allocateSeat(tx, projectId, "allavallc", "buzz"); // allavallc colony, seat 1
    const tonyFirst = await allocateSeat(tx, projectId, "tony", "ant"); // tony colony, seat 1
    expect(tonyFirst.seat).toBe(1);
  });
});

describe("allocateSeat concurrency", () => {
  // Uses the global `db` (not the per-test rollback fixture) because two
  // concurrent `db.transaction()` calls must commit independently for the
  // advisory lock to serialize them. We clean up explicitly afterwards by
  // deleting the test project (cascade drops the bots rows).
  vitestTest("two concurrent /join calls get distinct seats", async () => {
    const userId = `vitest-concurrent-${randomUUID()}`;
    const githubRepo = `vitest/${userId.slice(0, 8)}`;
    await db.insert(user).values({
      id: userId,
      name: "vitest",
      email: `${userId}@example.invalid`,
    });
    const [project] = await db
      .insert(projects)
      .values({
        billingOwnerId: userId,
        githubRepo,
        installId: Math.floor(Math.random() * 1_000_000),
        displayName: "vitest",
      })
      .returning({ id: projects.id });

    try {
      const [first, second] = await Promise.all([
        db.transaction((tx) => allocateSeat(tx, project.id, "allavallc", "buzz")),
        db.transaction((tx) => allocateSeat(tx, project.id, "allavallc", "wren")),
      ]);
      const seats = new Set([first.seat, second.seat]);
      expect(seats.size).toBe(2);
      expect(seats.has(1)).toBe(true);
      expect(seats.has(2)).toBe(true);
    } finally {
      // Cascade deletes the bots rows.
      await db.delete(projects).where(eq(projects.id, project.id));
      await db.delete(user).where(eq(user.id, userId));
    }
  });
});

describe("getSeatState", () => {
  test("returns null for an unknown bot", async ({ tx }) => {
    const projectId = await seedProject(tx);
    const result = await getSeatState(projectId, "allavallc", "ghost", tx);
    expect(result).toBeNull();
  });

  test("returns the seat state for an active bot", async ({ tx }) => {
    const projectId = await seedProject(tx);
    await allocateSeat(tx, projectId, "allavallc", "buzz");
    const state = await getSeatState(projectId, "allavallc", "buzz", tx);
    expect(state?.seat).toBe(1);
    expect(state?.total).toBe(1);
    expect(state?.role).toBe("PM + coder + tester");
  });

  test("returns null for an offline row", async ({ tx }) => {
    const projectId = await seedProject(tx);
    await allocateSeat(tx, projectId, "allavallc", "buzz");
    await tx
      .update(bots)
      .set({ status: "offline" })
      .where(and(eq(bots.projectId, projectId), eq(bots.handle, "buzz")));
    const state = await getSeatState(projectId, "allavallc", "buzz", tx);
    expect(state).toBeNull();
  });
});
