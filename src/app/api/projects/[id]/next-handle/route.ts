// GET /api/projects/[id]/next-handle — return the next free pool handle
// + currently-active handles, for the "Add a bot" UI.
//
// Reads `hive/handles.txt` (the curated pool) and `hive/events/*.log`
// (which handles are taken — each file means that handle is in use)
// via the GitHub App. Returns the first pool name without a matching
// events file, or `<first-pool>-N` if all are taken.

import { auth } from "@/lib/auth";
import { installationOctokit } from "@/lib/github";
import { getProjectForUser } from "@/lib/projects";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Octokit = Awaited<ReturnType<typeof installationOctokit>>;

async function readFile(
  oct: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  try {
    const resp = await oct.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path,
    });
    const data = resp.data as { content?: string };
    if (!data.content) return null;
    return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

async function listEventLogs(oct: Octokit, owner: string, repo: string): Promise<string[]> {
  try {
    const resp = await oct.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: "hive/events",
    });
    if (!Array.isArray(resp.data)) return [];
    return resp.data
      .filter((entry) => entry.type === "file" && entry.name.endsWith(".log"))
      .map((entry) => entry.name.replace(/\.log$/, ""));
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return [];
    throw err;
  }
}

function pickHandle(pool: string[], taken: Set<string>): string {
  for (const name of pool) {
    if (!taken.has(name)) return name;
  }
  // Pool exhausted — append lowest free numeric suffix to first pool name.
  const base = pool[0] ?? "anon";
  for (let n = 2; n <= 100; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [owner, repo] = project.githubRepo.split("/");
  if (!owner || !repo) {
    return NextResponse.json({ error: "invalid project repo" }, { status: 500 });
  }

  const oct = await installationOctokit(project.installId);
  const [handlesFile, takenHandles] = await Promise.all([
    readFile(oct, owner, repo, "hive/handles.txt"),
    listEventLogs(oct, owner, repo),
  ]);

  const pool = (handlesFile || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const takenSet = new Set(takenHandles);
  const next = pickHandle(pool, takenSet);

  // Colony name = the human's GitHub login (per ADR-003). Better Auth's
  // session.user.name is the GitHub login when the user signed in via
  // the GitHub OAuth provider, which is Bot Hive's only supported auth.
  const colony = session.user.name || "unknown";

  return NextResponse.json({
    nextHandle: next,
    activeHandles: takenHandles.sort(),
    poolSize: pool.length,
    colony,
  });
}
