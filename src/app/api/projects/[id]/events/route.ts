// GET /api/projects/[id]/events — returns the last N lines of `hive/events.log`
// from the connected repo. Read via the GitHub App's installation token; no
// bot tokens, no setup, no client-side auth beyond the user's session cookie.
//
// The swarm panel calls this on mount and after every `project-changed`
// broadcast on the existing SSE stream — so newly-pushed events.log lines
// appear in the panel within seconds of the webhook firing.

import { auth } from "@/lib/auth";
import { installationOctokit } from "@/lib/github";
import { getProjectForUser } from "@/lib/projects";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_LINES = 200;

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
      // No events.log yet (fresh repo). Return empty rather than 404 so the
      // swarm panel can render its empty state.
      return NextResponse.json({ entries: [] });
    }
    console.error("[events] read failed:", err);
    return NextResponse.json({ error: "failed to read events.log" }, { status: 500 });
  }

  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Last MAX_LINES lines, oldest → newest.
  const tail = lines.slice(-MAX_LINES);

  return NextResponse.json({ entries: tail });
}
