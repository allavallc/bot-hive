// POST /api/projects/[id]/notes — append a human-authored note to
// hive/notes-to-bots/<actor>.log on main, via the GitHub App.
//
// Auth: session cookie. The actor is the logged-in user.
// Body: { message: string }  (single line, max 280 chars; tabs/newlines stripped)
// Targeting: convention via @<agent-id> or @swarm in the message itself.
// Auto-trim: when a writer's file exceeds 1000 lines, the oldest 500 are dropped.

import { auth } from "@/lib/auth";
import { broadcast } from "@/lib/broadcast";
import { installationOctokit } from "@/lib/github";
import { actorSlug, appendAndTrim, validateMessage } from "@/lib/notes";
import { getProjectForUser } from "@/lib/projects";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Octokit = Awaited<ReturnType<typeof installationOctokit>>;

async function getDefaultBranch(oct: Octokit, owner: string, repo: string): Promise<string> {
  const info = await oct.request("GET /repos/{owner}/{repo}", { owner, repo });
  return info.data.default_branch;
}

async function getHeadState(
  oct: Octokit,
  owner: string,
  repo: string,
  branch: string,
): Promise<{ headSha: string; baseTreeSha: string }> {
  const refResp = await oct.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const headSha = refResp.data.object.sha;
  const commitResp = await oct.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", {
    owner,
    repo,
    commit_sha: headSha,
  });
  return { headSha, baseTreeSha: commitResp.data.tree.sha };
}

async function getFileContentOrEmpty(
  oct: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<string> {
  try {
    const resp = await oct.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path,
    });
    const data = resp.data as { content?: string };
    if (!data.content) return "";
    return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return "";
    throw err;
  }
}

async function createBlob(
  oct: Octokit,
  owner: string,
  repo: string,
  content: string,
): Promise<string> {
  const blob = await oct.request("POST /repos/{owner}/{repo}/git/blobs", {
    owner,
    repo,
    content,
    encoding: "utf-8",
  });
  return blob.data.sha;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: { message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const validation = validateMessage(body.message);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const cleaned = validation.message;

  const [owner, repo] = project.githubRepo.split("/");
  if (!owner || !repo) {
    return NextResponse.json({ error: "invalid project repo" }, { status: 500 });
  }

  const actorName = session.user.name || session.user.email || "user";
  const slug = actorSlug(actorName);
  const filePath = `hive/notes-to-bots/${slug}.log`;
  const isoNow = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const newLine = `${isoNow}\t${cleaned}`;

  try {
    const oct = await installationOctokit(project.installId);
    const branch = await getDefaultBranch(oct, owner, repo);
    const { headSha, baseTreeSha } = await getHeadState(oct, owner, repo, branch);

    const existing = await getFileContentOrEmpty(oct, owner, repo, filePath);
    const updated = appendAndTrim(existing, newLine);
    const blobSha = await createBlob(oct, owner, repo, updated);

    const newTree = await oct.request("POST /repos/{owner}/{repo}/git/trees", {
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: [
        {
          path: filePath,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blobSha,
        },
      ],
    });

    const commit = await oct.request("POST /repos/{owner}/{repo}/git/commits", {
      owner,
      repo,
      message: `note: ${cleaned.slice(0, 60)}${cleaned.length > 60 ? "…" : ""}`,
      tree: newTree.data.sha,
      parents: [headSha],
      author: {
        name: actorName,
        email: session.user.email,
        date: new Date().toISOString(),
      },
    });

    await oct.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commit.data.sha,
    });

    // Optimistic SSE: panel can render the new line instantly without
    // waiting for the GitHub webhook round-trip. The webhook will still
    // fire project-changed when the commit propagates; the eventual
    // refetch reconciles to the canonical view.
    broadcast({ type: "project-changed", projectId });

    return NextResponse.json({ ok: true, ts: isoNow });
  } catch (err) {
    console.error("[notes] commit failed:", err);
    return NextResponse.json({ error: "failed to write note" }, { status: 500 });
  }
}
