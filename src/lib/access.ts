import { db } from "@/db";
import { account } from "@/db/schema";
import { installationOctokit } from "@/lib/github";
import { Octokit } from "@octokit/core";
import { and, eq } from "drizzle-orm";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;
const REPOS_PER_PAGE = 100;

type CacheEntry = {
  repos: string[];
  expiresAt: number;
};

export type RepoCollaborator = {
  login: string;
  id: number;
  avatarUrl: string;
};

type CollaboratorCacheEntry = {
  collaborators: RepoCollaborator[];
  expiresAt: number;
};

const repoListCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string[]>>();

const collaboratorCache = new Map<string, CollaboratorCacheEntry>();
const collaboratorInFlight = new Map<string, Promise<RepoCollaborator[]>>();

function lruSet(userId: string, entry: CacheEntry): void {
  // Map iterates in insertion order. Re-inserting moves the key to most-recent.
  repoListCache.delete(userId);
  repoListCache.set(userId, entry);
  while (repoListCache.size > CACHE_MAX_ENTRIES) {
    const oldest = repoListCache.keys().next().value;
    if (oldest === undefined) break;
    repoListCache.delete(oldest);
  }
}

async function getUserOAuthToken(userId: string): Promise<string | null> {
  const [acct] = await db
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "github")))
    .limit(1);
  return acct?.accessToken ?? null;
}

async function fetchAllRepos(token: string): Promise<string[]> {
  const octokit = new Octokit({ auth: token });
  const repos: string[] = [];
  let page = 1;
  while (true) {
    const response = await octokit.request("GET /user/repos", {
      visibility: "all",
      affiliation: "owner,collaborator,organization_member",
      per_page: REPOS_PER_PAGE,
      page,
    });
    const data = response.data as Array<{ full_name: string }>;
    for (const repo of data) {
      repos.push(repo.full_name);
    }
    if (data.length < REPOS_PER_PAGE) break;
    page++;
  }
  return repos;
}

function isStatus401(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "status" in err &&
    (err as { status: unknown }).status === 401
  );
}

export async function listUserRepos(userId: string): Promise<string[]> {
  const now = Date.now();
  const hit = repoListCache.get(userId);
  if (hit && hit.expiresAt > now) {
    lruSet(userId, hit);
    return hit.repos;
  }

  const existing = inFlight.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    const token = await getUserOAuthToken(userId);
    if (!token) return [];

    try {
      const repos = await fetchAllRepos(token);
      lruSet(userId, { repos, expiresAt: Date.now() + CACHE_TTL_MS });
      return repos;
    } catch (err) {
      if (isStatus401(err)) {
        repoListCache.delete(userId);
        return [];
      }
      throw err;
    }
  })();

  inFlight.set(userId, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(userId);
  }
}

export async function userHasRepoAccess(userId: string, githubRepo: string): Promise<boolean> {
  const repos = await listUserRepos(userId);
  return repos.includes(githubRepo);
}

export function invalidateUserCache(userId: string): void {
  repoListCache.delete(userId);
}

export async function listRepoCollaborators(
  githubRepo: string,
  installId: number,
): Promise<RepoCollaborator[]> {
  const cacheKey = `${installId}:${githubRepo}`;
  const now = Date.now();

  const hit = collaboratorCache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return hit.collaborators;
  }

  const existing = collaboratorInFlight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const [owner, repo] = githubRepo.split("/");
    if (!owner || !repo) {
      throw new Error(`invalid githubRepo "${githubRepo}" — expected "owner/repo"`);
    }
    const octokit = await installationOctokit(installId);

    const collaborators: RepoCollaborator[] = [];
    let page = 1;
    while (true) {
      const response = await octokit.request("GET /repos/{owner}/{repo}/collaborators", {
        owner,
        repo,
        per_page: REPOS_PER_PAGE,
        page,
      });
      const data = response.data as Array<{ login: string; id: number; avatar_url: string }>;
      for (const c of data) {
        collaborators.push({ login: c.login, id: c.id, avatarUrl: c.avatar_url });
      }
      if (data.length < REPOS_PER_PAGE) break;
      page++;
    }

    collaboratorCache.set(cacheKey, { collaborators, expiresAt: Date.now() + CACHE_TTL_MS });
    return collaborators;
  })();

  collaboratorInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    collaboratorInFlight.delete(cacheKey);
  }
}

export function invalidateCollaboratorCache(githubRepo: string, installId: number): void {
  collaboratorCache.delete(`${installId}:${githubRepo}`);
}

// Test-only helpers.
export const __test = {
  reset(): void {
    repoListCache.clear();
    inFlight.clear();
    collaboratorCache.clear();
    collaboratorInFlight.clear();
  },
  cacheSize(): number {
    return repoListCache.size;
  },
  cacheKeys(): string[] {
    return Array.from(repoListCache.keys());
  },
};
