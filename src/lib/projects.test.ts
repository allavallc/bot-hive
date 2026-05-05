import { randomUUID } from "node:crypto";
import { projects, user } from "@/db/schema";
import { test } from "@/lib/test-db";
import { describe, expect, vi } from "vitest";

const { mockListUserRepos, mockUserHasRepoAccess } = vi.hoisted(() => ({
  mockListUserRepos: vi.fn(),
  mockUserHasRepoAccess: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  listUserRepos: mockListUserRepos,
  userHasRepoAccess: mockUserHasRepoAccess,
}));

import { getProjectForUser, getProjectsForUser } from "./projects";

// Per-test transactional rollback (src/lib/test-db.ts) provides isolation.
// We pass `tx` to production functions so reads see the test's uncommitted
// writes. Test data uses fixed IDs (no Date.now()/Math.random()) — collision
// is impossible because writes never commit.

describe("project access helpers", () => {
  test("getProjectsForUser returns projects whose repo is in the user's list", async ({ tx }) => {
    const testUserId = `vitest-${randomUUID()}`;
    const testGithubRepo = `vitest/${testUserId.slice(0, 8)}`;
    await tx.insert(user).values({
      id: testUserId,
      name: "vitest",
      email: `${testUserId}@example.invalid`,
    });
    const [project] = await tx
      .insert(projects)
      .values({
        billingOwnerId: testUserId,
        githubRepo: testGithubRepo,
        installId: 100,
        displayName: "vitest",
      })
      .returning();

    mockListUserRepos.mockReset();
    mockListUserRepos.mockResolvedValue([testGithubRepo]);

    const result = await getProjectsForUser(testUserId, tx);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(project.id);
  });

  test("getProjectsForUser returns empty when user has no repos", async ({ tx }) => {
    const testUserId = `vitest-${randomUUID()}`;
    await tx.insert(user).values({
      id: testUserId,
      name: "vitest",
      email: `${testUserId}@example.invalid`,
    });
    await tx.insert(projects).values({
      billingOwnerId: testUserId,
      githubRepo: `vitest/${testUserId.slice(0, 8)}`,
      installId: 100,
      displayName: "vitest",
    });

    mockListUserRepos.mockReset();
    mockListUserRepos.mockResolvedValue([]);

    const result = await getProjectsForUser(testUserId, tx);
    expect(result).toEqual([]);
  });

  test("getProjectsForUser excludes projects on repos the user can't access", async ({ tx }) => {
    const testUserId = `vitest-${randomUUID()}`;
    await tx.insert(user).values({
      id: testUserId,
      name: "vitest",
      email: `${testUserId}@example.invalid`,
    });
    await tx.insert(projects).values({
      billingOwnerId: testUserId,
      githubRepo: `vitest/${testUserId.slice(0, 8)}`,
      installId: 100,
      displayName: "vitest",
    });

    mockListUserRepos.mockReset();
    mockListUserRepos.mockResolvedValue(["other/repo"]);

    const result = await getProjectsForUser(testUserId, tx);
    expect(result).toEqual([]);
  });

  test("getProjectForUser returns the project when user has access", async ({ tx }) => {
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
        displayName: "vitest",
      })
      .returning();

    mockUserHasRepoAccess.mockReset();
    mockUserHasRepoAccess.mockResolvedValue(true);

    const result = await getProjectForUser(testUserId, project.id, tx);
    expect(result?.id).toBe(project.id);
  });

  test("getProjectForUser returns null when user lacks access", async ({ tx }) => {
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
        displayName: "vitest",
      })
      .returning();

    mockUserHasRepoAccess.mockReset();
    mockUserHasRepoAccess.mockResolvedValue(false);

    const result = await getProjectForUser(testUserId, project.id, tx);
    expect(result).toBeNull();
  });

  test("getProjectForUser returns null when project does not exist", async ({ tx }) => {
    const testUserId = `vitest-${randomUUID()}`;

    mockUserHasRepoAccess.mockReset();
    mockUserHasRepoAccess.mockResolvedValue(true);

    const result = await getProjectForUser(testUserId, randomUUID(), tx);
    expect(result).toBeNull();
  });
});
