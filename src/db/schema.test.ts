import { randomUUID } from "node:crypto";
import { projects, tickets, user, webhookDeliveries } from "@/db/schema";
import { test } from "@/lib/test-db";
import { describe, expect } from "vitest";

// Test data is deterministic by construction. Per-test transactional rollback
// (see src/lib/test-db.ts) means writes never commit, so we use stable IDs
// here. The randomUUID() for `testUserId` is for cross-test uniqueness within
// the live transaction's snapshot — not for collision-prevention against
// state that survives. There is no surviving state.

describe("schema constraints", () => {
  test("duplicate (project_id, hv_id) on tickets throws", async ({ tx }) => {
    const testUserId = `vitest-${randomUUID()}`;
    await tx.insert(user).values({
      id: testUserId,
      name: "vitest",
      email: `${testUserId}@example.invalid`,
    });
    const [project] = await tx
      .insert(projects)
      .values({
        billingOwnerId: testUserId,
        githubRepo: `vitest/${testUserId.slice(0, 8)}`,
        installId: 100,
        displayName: "vitest project",
      })
      .returning();

    const baseRow = {
      projectId: project.id,
      hvId: "HV-TEST",
      state: "backlog",
      title: "test",
      frontmatter: {},
      body: "",
      filePath: "hive/backlog/HV-TEST.md",
      fileSha: "abc",
    };

    await tx.insert(tickets).values(baseRow);
    await expect(tx.insert(tickets).values(baseRow)).rejects.toThrow();
  });

  test("duplicate (project_id, delivery_id) on webhook_deliveries throws", async ({ tx }) => {
    const testUserId = `vitest-${randomUUID()}`;
    await tx.insert(user).values({
      id: testUserId,
      name: "vitest",
      email: `${testUserId}@example.invalid`,
    });
    const [project] = await tx
      .insert(projects)
      .values({
        billingOwnerId: testUserId,
        githubRepo: `vitest/${testUserId.slice(0, 8)}`,
        installId: 100,
        displayName: "vitest project",
      })
      .returning();

    const baseRow = {
      projectId: project.id,
      deliveryId: "delivery-test-123",
    };

    await tx.insert(webhookDeliveries).values(baseRow);
    await expect(tx.insert(webhookDeliveries).values(baseRow)).rejects.toThrow();
  });

  test("duplicate (install_id, github_repo) on projects throws", async ({ tx }) => {
    const testUserId = `vitest-${randomUUID()}`;
    await tx.insert(user).values({
      id: testUserId,
      name: "vitest",
      email: `${testUserId}@example.invalid`,
    });

    const projectRow = {
      billingOwnerId: testUserId,
      githubRepo: `vitest-uniq/${testUserId.slice(0, 8)}`,
      installId: 200,
      displayName: "vitest uniq A",
    };

    await tx.insert(projects).values(projectRow);

    // Same (installId, githubRepo) — different displayName/billingOwner
    // should still collide.
    await expect(
      tx.insert(projects).values({
        ...projectRow,
        displayName: "vitest uniq B",
      }),
    ).rejects.toThrow();
  });

  test("same billingOwnerId on different repos succeeds", async ({ tx }) => {
    const testUserId = `vitest-${randomUUID()}`;
    await tx.insert(user).values({
      id: testUserId,
      name: "vitest",
      email: `${testUserId}@example.invalid`,
    });

    await tx.insert(projects).values({
      billingOwnerId: testUserId,
      githubRepo: `vitest-multi/${testUserId.slice(0, 8)}-a`,
      installId: 300,
      displayName: "vitest multi A",
    });

    await expect(
      tx.insert(projects).values({
        billingOwnerId: testUserId,
        githubRepo: `vitest-multi/${testUserId.slice(0, 8)}-b`,
        installId: 301,
        displayName: "vitest multi B",
      }),
    ).resolves.toBeDefined();
  });
});
