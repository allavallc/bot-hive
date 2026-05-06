// GET /api/projects/[id]/events — returns recent `hive/events.log` lines
// from the connected repo. Read via the GitHub App's installation token; no
// bot tokens, no setup, no client-side auth beyond the user's session cookie.
//
// Filters server-side:
//   - Lines older than MAX_AGE_DAYS are dropped (keeps the panel focused on
//     "what's happening now," lets old activity age out gracefully).
//   - Header comments (#-prefixed) and malformed lines are dropped.
//   - Returned newest-first (most recent at index 0) so the swarm panel can
//     render top-down without re-sorting.
//   - Capped at MAX_LINES even after filtering.
//
// Called on board load and after every `project-changed` broadcast on the
// existing SSE stream — so newly-pushed events.log lines appear in seconds.

import { auth } from "@/lib/auth";
import { installationOctokit } from "@/lib/github";
import { getProjectForUser } from "@/lib/projects";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_LINES = 200;
const MAX_AGE_DAYS = 7;
const ISO_TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\b/;

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

  let content: string;
  try {
    const oct = await installationOctokit(project.installId);
    const resp = await oct.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: "hive/events.log",
    });
    const data = resp.data as { content: string; encoding: string };
    content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      return NextResponse.json({ entries: [] });
    }
    console.error("[events] read failed:", err);
    return NextResponse.json({ error: "failed to read events.log" }, { status: 500 });
  }

  const cutoffMs = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  const recent = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .filter((line) => {
      const match = ISO_TS_RE.exec(line);
      if (!match) return false; // malformed line — drop
      const ts = Date.parse(match[1]);
      if (Number.isNaN(ts)) return false;
      return ts >= cutoffMs;
    });

  // Newest first; cap.
  const newestFirst = recent.slice(-MAX_LINES).reverse();

  return NextResponse.json({ entries: newestFirst });
}
