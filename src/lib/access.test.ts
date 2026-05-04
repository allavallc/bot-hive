import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { mockRequest, mockSelectLimit } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockSelectLimit: vi.fn(),
}));

vi.mock("@octokit/core", () => {
  function Octokit(this: { request: typeof mockRequest }) {
    this.request = mockRequest;
  }
  return { Octokit };
});

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockSelectLimit(),
        }),
      }),
    }),
  },
}));

import { __test, invalidateUserCache, listUserRepos, userHasRepoAccess } from "./access";

beforeEach(() => {
  __test.reset();
  mockRequest.mockReset();
  mockSelectLimit.mockReset();
  mockSelectLimit.mockResolvedValue([{ accessToken: "fake-token" }]);
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function pageOf(count: number, prefix: string) {
  return Array.from({ length: count }, (_, i) => ({ full_name: `${prefix}/r${i}` }));
}

describe("listUserRepos", () => {
  test("cache miss queries GitHub then populates cache", async () => {
    mockRequest.mockResolvedValueOnce({ data: pageOf(2, "u1") });

    const repos = await listUserRepos("user-1");
    expect(repos).toEqual(["u1/r0", "u1/r1"]);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(__test.cacheSize()).toBe(1);
  });

  test("cache hit returns without re-querying GitHub", async () => {
    mockRequest.mockResolvedValueOnce({ data: pageOf(1, "u2") });

    await listUserRepos("user-2");
    await listUserRepos("user-2");

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test("cache expires after 5 minutes and re-queries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    mockRequest.mockResolvedValueOnce({ data: pageOf(1, "u3a") });
    await listUserRepos("user-3");

    vi.setSystemTime(new Date("2026-01-01T00:05:01Z"));

    mockRequest.mockResolvedValueOnce({ data: pageOf(1, "u3b") });
    const second = await listUserRepos("user-3");

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(second).toEqual(["u3b/r0"]);
  });

  test("401 from GitHub clears cache and returns empty", async () => {
    mockRequest.mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { status: 401 }));

    const repos = await listUserRepos("user-4");
    expect(repos).toEqual([]);
    expect(__test.cacheSize()).toBe(0);
  });

  test("user without OAuth token returns empty", async () => {
    mockSelectLimit.mockResolvedValueOnce([]);

    const repos = await listUserRepos("user-5");
    expect(repos).toEqual([]);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  test("paginates across 3 pages of 100", async () => {
    mockRequest
      .mockResolvedValueOnce({ data: pageOf(100, "u6-p1") })
      .mockResolvedValueOnce({ data: pageOf(100, "u6-p2") })
      .mockResolvedValueOnce({ data: pageOf(50, "u6-p3") });

    const repos = await listUserRepos("user-6");

    expect(mockRequest).toHaveBeenCalledTimes(3);
    expect(repos).toHaveLength(250);
    expect(repos[0]).toBe("u6-p1/r0");
    expect(repos[100]).toBe("u6-p2/r0");
    expect(repos[200]).toBe("u6-p3/r0");
  });

  test("LRU re-orders on access (most-recent moves to tail)", async () => {
    mockRequest.mockResolvedValue({ data: pageOf(1, "lru") });

    await listUserRepos("alpha");
    await listUserRepos("beta");
    await listUserRepos("gamma");

    expect(__test.cacheKeys()).toEqual(["alpha", "beta", "gamma"]);

    await listUserRepos("alpha");
    expect(__test.cacheKeys()).toEqual(["beta", "gamma", "alpha"]);
  });
});

describe("userHasRepoAccess", () => {
  test("returns true when repo is in user's list", async () => {
    mockRequest.mockResolvedValueOnce({ data: [{ full_name: "owner/yes" }] });
    expect(await userHasRepoAccess("user-7", "owner/yes")).toBe(true);
  });

  test("returns false when repo is not in user's list", async () => {
    mockRequest.mockResolvedValueOnce({ data: [{ full_name: "owner/yes" }] });
    expect(await userHasRepoAccess("user-7", "owner/no")).toBe(false);
  });
});

describe("invalidateUserCache", () => {
  test("removes the user's cached entry", async () => {
    mockRequest.mockResolvedValueOnce({ data: pageOf(1, "u8") });
    await listUserRepos("user-8");
    expect(__test.cacheSize()).toBe(1);

    invalidateUserCache("user-8");
    expect(__test.cacheSize()).toBe(0);
  });
});
