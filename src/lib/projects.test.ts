import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { projects, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { mockListUserRepos, mockUserHasRepoAccess } = vi.hoisted(() => ({
  mockListUserRepos: vi.fn(),
  mockUserHasRepoAccess: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  listUserRepos: mockListUserRepos,
  userHasRepoAccess: mockUserHasRepoAccess,
}));

import { getProjectForUser, getProjectsForUser } from "./projects";

describe("project access helpers", () => {
  let testUserId: string;
  let testProjectId: string;
  let testGithubRepo: string;

  beforeEach(async () => {
    testUserId = `vitest-${randomUUID()}`;
    testGithubRepo = `vitest/${testUserId.slice(0, 8)}`;
    await db.insert(user).values({
      id: testUserId,
      name: "vitest",
      email: `${testUserId}@example.invalid`,
    });
    const [project] = await db
      .insert(projects)
      .values({
        billingOwnerId: testUserId,
        githubRepo: testGithubRepo,
        installId: Date.now(),
        displayName: "vitest",
      })
      .returning();
    testProjectId = project.id;

    mockListUserRepos.mockReset();
    mockUserHasRepoAccess.mockReset();
  });

  afterEach(async () => {
    await db.delete(user).where(eq(user.id, testUserId));
  });

  test("getProjectsForUser returns projects whose repo is in the user's list", async () => {
    mockListUserRepos.mockResolvedValue([testGithubRepo]);
    const result = await getProjectsForUser(testUserId);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(testProjectId);
  });

  test("getProjectsForUser returns empty when user has no repos", async () => {
    mockListUserRepos.mockResolvedValue([]);
    const result = await getProjectsForUser(testUserId);
    expect(result).toEqual([]);
  });

  test("getProjectsForUser excludes projects on repos the user can't access", async () => {
    mockListUserRepos.mockResolvedValue(["other/repo"]);
    const result = await getProjectsForUser(testUserId);
    expect(result).toEqual([]);
  });

  test("getProjectForUser returns the project when user has access", async () => {
    mockUserHasRepoAccess.mockResolvedValue(true);
    const result = await getProjectForUser(testUserId, testProjectId);
    expect(result?.id).toBe(testProjectId);
  });

  test("getProjectForUser returns null when user lacks access", async () => {
    mockUserHasRepoAccess.mockResolvedValue(false);
    const result = await getProjectForUser(testUserId, testProjectId);
    expect(result).toBeNull();
  });

  test("getProjectForUser returns null when project does not exist", async () => {
    mockUserHasRepoAccess.mockResolvedValue(true);
    const result = await getProjectForUser(testUserId, randomUUID());
    expect(result).toBeNull();
  });
});
