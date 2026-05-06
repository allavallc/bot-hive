// GET /api/projects/[id]/events — returns recent activity from the
// per-actor event logs at `hive/events/<actor>.log`. Read via the GitHub
// App's installation token; no bot tokens, no setup, no client-side auth
// beyond the user's session cookie.
//
// Per-actor files (instead of one shared `hive/events.log`) eliminate the
// textual append-conflicts that used to leave PRs DIRTY whenever two bots
// landed work in the same window — different writers, different files,
// no race possible.
//
// Filters server-side:
//   - Lines older than MAX_AGE_DAYS are dropped (keeps the panel focused on
//     "what's happening now," lets old activity age out gracefully).
//   - Header comments (#-prefixed) and malformed lines are dropped.
//   - All actors' lines merged and sorted newest-first.
//   - Capped at MAX_LINES even after filtering.
//
// Legacy: the old single-file `hive/events.log` is read alongside for
// continuity until its content ages past the 7-day cutoff. New writes go
// to the per-actor files only.

import { auth } from "@/lib/auth";
import { installationOctokit } from "@/lib/github";
import { getProjectForUser } from "@/lib/projects";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_LINES = 200;
const MAX_AGE_DAYS = 7;
const ISO_TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\b/;

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
    const data = resp.data as { content?: string; encoding?: string };
    if (!data.content) return null;
    return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) return null;
    throw err;
  }
}

async function listEventFiles(oct: Octokit, owner: string, repo: string): Promise<string[]> {
  try {
    const resp = await oct.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: "hive/events",
    });
    const data = resp.data;
    if (!Array.isArray(data)) return [];
    return data
      .filter((entry) => entry.type === "file" && entry.name.endsWith(".log"))
      .map((entry) => entry.path as string);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) return [];
    throw err;
  }
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

  let perActorPaths: string[];
  let legacyContent: string | null;
  try {
    [perActorPaths, legacyContent] = await Promise.all([
      listEventFiles(oct, owner, repo),
      readFile(oct, owner, repo, "hive/events.log"),
    ]);
  } catch (err) {
    console.error("[events] discovery failed:", err);
    return NextResponse.json({ error: "failed to read events" }, { status: 500 });
  }

  let perActorContents: (string | null)[];
  try {
    perActorContents = await Promise.all(perActorPaths.map((p) => readFile(oct, owner, repo, p)));
  } catch (err) {
    console.error("[events] per-actor read failed:", err);
    return NextResponse.json({ error: "failed to read events" }, { status: 500 });
  }

  const allContent = [legacyContent, ...perActorContents].filter((c): c is string => !!c);
  const cutoffMs = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  const recent: { ts: number; line: string }[] = [];
  for (const content of allContent) {
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const match = ISO_TS_RE.exec(line);
      if (!match) continue;
      const ts = Date.parse(match[1]);
      if (Number.isNaN(ts) || ts < cutoffMs) continue;
      recent.push({ ts, line });
    }
  }

  recent.sort((a, b) => b.ts - a.ts);
  const entries = recent.slice(0, MAX_LINES).map((e) => e.line);

  return NextResponse.json({ entries });
}
