import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { bots, projects, user } from "@/db/schema";
import { allocateSeat } from "@/lib/seats";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";
import { GET } from "./route";

type SeededProject = {
  userId: string;
  projectId: string;
  githubRepo: string;
};

const seededProjects: SeededProject[] = [];

async function seedProject(): Promise<SeededProject> {
  const userId = `vitest-colony-${randomUUID()}`;
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
      displayName: "vitest colony route",
    })
    .returning({ id: projects.id });

  const seeded = { userId, projectId: project.id, githubRepo };
  seededProjects.push(seeded);
  return seeded;
}

afterEach(async () => {
  while (seededProjects.length > 0) {
    const seeded = seededProjects.pop();
    if (!seeded) break;
    await db.delete(projects).where(eq(projects.id, seeded.projectId));
    await db.delete(user).where(eq(user.id, seeded.userId));
  }
});

describe("GET /api/bots/colony", () => {
  test("returns 404 when the repo is not registered", async () => {
    const res = await GET(
      new Request("http://localhost/api/bots/colony?repo_full_name=vitest/missing-repo"),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "no project registered for repo 'vitest/missing-repo'",
    });
  });

  test("returns the active seat map and reclaims stale rows without 500ing", async () => {
    const seeded = await seedProject();

    await db.transaction(async (tx) => {
      await allocateSeat(tx, seeded.projectId, "allavallc", "buzz");
      await allocateSeat(tx, seeded.projectId, "allavallc", "wren");
      await allocateSeat(tx, seeded.projectId, "tony", "ant");

      await tx
        .update(bots)
        .set({ lastHeartbeatAt: new Date("2020-01-01T00:00:00Z") })
        .where(
          and(
            eq(bots.projectId, seeded.projectId),
            eq(bots.colony, "allavallc"),
            eq(bots.handle, "wren"),
          ),
        );
    });

    const res = await GET(
      new Request(
        `http://localhost/api/bots/colony?repo_full_name=${encodeURIComponent(seeded.githubRepo)}`,
      ),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      colonies: [
        {
          colony: "allavallc",
          seats: [{ handle: "buzz", seat: 1, role: "PM + coder + tester" }],
        },
        {
          colony: "tony",
          seats: [{ handle: "ant", seat: 1, role: "PM + coder + tester" }],
        },
      ],
    });

    const rows = await db
      .select({ handle: bots.handle, seat: bots.seat, status: bots.status, colony: bots.colony })
      .from(bots)
      .where(eq(bots.projectId, seeded.projectId));

    expect(rows).toEqual(
      expect.arrayContaining([
        { handle: "buzz", seat: 1, status: "active", colony: "allavallc" },
        { handle: "wren", seat: 2, status: "offline", colony: "allavallc" },
        { handle: "ant", seat: 1, status: "active", colony: "tony" },
      ]),
    );
  });
});
