import { randomUUID } from "node:crypto";
import { botEvents, humanNotes, projects, user } from "@/db/schema";
import { test } from "@/lib/test-db";
import { describe, expect } from "vitest";
import { type ProjectEventEntry, appendDbProjectEvents } from "./project-events";

async function seedProject(tx: Parameters<typeof appendDbProjectEvents>[0]) {
  const userId = `vitest-${randomUUID()}`;
  await tx.insert(user).values({
    id: userId,
    name: "vitest",
    email: `${userId}@example.invalid`,
  });
  const [project] = await tx
    .insert(projects)
    .values({
      billingOwnerId: userId,
      githubRepo: `vitest/${userId.slice(0, 8)}`,
      installId: Math.floor(Math.random() * 1_000_000),
      displayName: "vitest",
    })
    .returning({ id: projects.id });
  return project.id;
}

describe("appendDbProjectEvents", () => {
  test("adds human notes and bot events in the project event shape", async ({ tx }) => {
    const projectId = await seedProject(tx);
    const now = new Date();

    await tx.insert(humanNotes).values({
      projectId,
      actor: "allavallc",
      message: "@swarm ship HV-148",
      createdAt: now,
    });
    await tx.insert(botEvents).values({
      projectId,
      colony: "allavallc",
      handle: "buzz",
      kind: "question",
      message: "Need review on HV-148",
      targetRole: "tester",
      data: { hvId: "HV-148" },
      createdAt: now,
    });

    const sink: ProjectEventEntry[] = [];
    await appendDbProjectEvents(tx, projectId, new Date(now.getTime() - 1000), 20, sink);

    expect(sink).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "note-to-bots",
          actor: "allavallc",
          raw: "@swarm ship HV-148",
        }),
        expect.objectContaining({
          kind: "bot-event",
          actor: "allavallc.buzz",
          raw: "Need review on HV-148",
          meta: expect.objectContaining({
            eventKind: "question",
            targetRole: "tester",
            data: { hvId: "HV-148" },
          }),
        }),
      ]),
    );
  });

  test("excludes old bot events", async ({ tx }) => {
    const projectId = await seedProject(tx);

    await tx.insert(botEvents).values({
      projectId,
      colony: "allavallc",
      handle: "buzz",
      kind: "status",
      message: "old event",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    const sink: ProjectEventEntry[] = [];
    await appendDbProjectEvents(tx, projectId, new Date("2026-02-01T00:00:00Z"), 20, sink);

    expect(sink).toEqual([]);
  });
});
