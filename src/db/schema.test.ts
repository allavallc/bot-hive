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
        ownerId: testUserId,
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
});
