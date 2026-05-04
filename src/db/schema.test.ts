import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { projects, tickets, user, webhookDeliveries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

describe("schema constraints", () => {
  let testUserId: string;
  let testProjectId: string;

  beforeEach(async () => {
    testUserId = `vitest-${randomUUID()}`;
    await db.insert(user).values({
      id: testUserId,
      name: "vitest",
      email: `${testUserId}@example.invalid`,
    });
    const [project] = await db
      .insert(projects)
      .values({
        billingOwnerId: testUserId,
        githubRepo: `vitest/${testUserId.slice(0, 8)}`,
        installId: Date.now(),
        displayName: "vitest project",
      })
      .returning();
    testProjectId = project.id;
  });

  afterEach(async () => {
    // Cascade: user → projects → tickets / webhook_deliveries
    await db.delete(user).where(eq(user.id, testUserId));
  });

  test("duplicate (project_id, hv_id) on tickets throws", async () => {
    const baseRow = {
      projectId: testProjectId,
      hvId: "HV-TEST",
      state: "backlog",
      title: "test",
      frontmatter: {},
      body: "",
      filePath: "hive/backlog/HV-TEST.md",
      fileSha: "abc",
    };

    await db.insert(tickets).values(baseRow);

    await expect(db.insert(tickets).values(baseRow)).rejects.toThrow();
  });

  test("duplicate (project_id, delivery_id) on webhook_deliveries throws", async () => {
    const baseRow = {
      projectId: testProjectId,
      deliveryId: "delivery-test-123",
    };

    await db.insert(webhookDeliveries).values(baseRow);

    await expect(db.insert(webhookDeliveries).values(baseRow)).rejects.toThrow();
  });

  test("duplicate (install_id, github_repo) on projects throws", async () => {
    const projectRow = {
      billingOwnerId: testUserId,
      githubRepo: `vitest-uniq/${testUserId.slice(0, 8)}`,
      installId: Date.now() + 1,
      displayName: "vitest uniq A",
    };

    await db.insert(projects).values(projectRow);

    // Same (installId, githubRepo) — different displayName/billingOwner
    // should still collide.
    await expect(
      db.insert(projects).values({
        ...projectRow,
        displayName: "vitest uniq B",
      }),
    ).rejects.toThrow();
  });

  test("same billingOwnerId on different repos succeeds", async () => {
    const baseInstallId = Date.now() + 100;

    await db.insert(projects).values({
      billingOwnerId: testUserId,
      githubRepo: `vitest-multi/${testUserId.slice(0, 8)}-a`,
      installId: baseInstallId,
      displayName: "vitest multi A",
    });

    await expect(
      db.insert(projects).values({
        billingOwnerId: testUserId,
        githubRepo: `vitest-multi/${testUserId.slice(0, 8)}-b`,
        installId: baseInstallId + 1,
        displayName: "vitest multi B",
      }),
    ).resolves.toBeDefined();
  });
});
