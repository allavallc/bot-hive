// GET /api/projects/[id]/events — returns recent activity from three sources:
//
//   1. Lifecycle events at hive/events/<actor>.log (per-actor, append-only)
//   2. Notes from humans to bots at hive/notes-to-bots/<author>.log
//   3. Notes from bots to humans at hive/notes-to-humans/<author>.log
//
// All three substrates are plain text + Git, written by per-actor split so
// parallel writers never conflict on the same file. The panel renders a
// merged, newest-first view across all three.
//
// Note-file format (TSV): <ISO ts>\t<message>
// Lifecycle-file format: <ISO ts> <hv-id> <action> [unblocked] <actor>
//
// Read via the GitHub App's installation token; auth is the user's
// session cookie.

import { db } from "@/db";
import { activeClaims, humanNotes } from "@/db/schema";
import { auth } from "@/lib/auth";
import { installationOctokit } from "@/lib/github";
import { getProjectForUser } from "@/lib/projects";
import { and, desc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_LINES = 200;
const MAX_AGE_DAYS = 7;
const ISO_TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\b/;

type Octokit = Awaited<ReturnType<typeof installationOctokit>>;
type EntryKind = "lifecycle" | "note-to-bots" | "note-to-humans" | "claim-active";

type Entry = {
  kind: EntryKind;
  ts: string;
  actor: string;
  raw: string;
  // Only set for kind="claim-active" — the ticket the claim covers and
  // when the claim's TTL expires. Lets the swarm panel render claims
  // distinctly and lets bot DAG-walks filter them out.
  hvId?: string;
  expiresAt?: string;
};

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

async function listLogFiles(
  oct: Octokit,
  owner: string,
  repo: string,
  dir: string,
): Promise<{ path: string; name: string }[]> {
  try {
    const resp = await oct.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: dir,
    });
    const data = resp.data;
    if (!Array.isArray(data)) return [];
    return data
      .filter((entry) => entry.type === "file" && entry.name.endsWith(".log"))
      .map((entry) => ({ path: entry.path as string, name: entry.name as string }));
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) return [];
    throw err;
  }
}

function actorFromFilename(name: string): string {
  return name.replace(/\.log$/, "");
}

function parseLifecycle(content: string, cutoffMs: number, sink: Entry[]): void {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = ISO_TS_RE.exec(line);
    if (!match) continue;
    const tsMs = Date.parse(match[1]);
    if (Number.isNaN(tsMs) || tsMs < cutoffMs) continue;
    const parts = line.split(/\s+/);
    const actor = parts[parts.length - 1] ?? "";
    sink.push({ kind: "lifecycle", ts: match[1], actor, raw: line });
  }
}

function parseNotes(
  content: string,
  actor: string,
  kind: "note-to-bots" | "note-to-humans",
  cutoffMs: number,
  sink: Entry[],
): void {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const tabIdx = line.indexOf("\t");
    if (tabIdx === -1) continue;
    const tsField = line.slice(0, tabIdx);
    const message = line.slice(tabIdx + 1);
    const tsMatch = ISO_TS_RE.exec(tsField);
    if (!tsMatch) continue;
    const tsMs = Date.parse(tsMatch[1]);
    if (Number.isNaN(tsMs) || tsMs < cutoffMs) continue;
    if (!message) continue;
    sink.push({ kind, ts: tsMatch[1], actor, raw: message });
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

  let eventFiles: { path: string; name: string }[];
  let toHumansFiles: { path: string; name: string }[];
  let legacyEvents: string | null;
  try {
    [eventFiles, toHumansFiles, legacyEvents] = await Promise.all([
      listLogFiles(oct, owner, repo, "hive/events"),
      listLogFiles(oct, owner, repo, "hive/notes-to-humans"),
      readFile(oct, owner, repo, "hive/events.log"),
    ]);
  } catch (err) {
    console.error("[events] discovery failed:", err);
    return NextResponse.json({ error: "failed to read events" }, { status: 500 });
  }

  let eventContents: (string | null)[];
  let toHumansContents: (string | null)[];
  try {
    [eventContents, toHumansContents] = await Promise.all([
      Promise.all(eventFiles.map((f) => readFile(oct, owner, repo, f.path))),
      Promise.all(toHumansFiles.map((f) => readFile(oct, owner, repo, f.path))),
    ]);
  } catch (err) {
    console.error("[events] per-file read failed:", err);
    return NextResponse.json({ error: "failed to read events" }, { status: 500 });
  }

  const cutoffMs = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const sink: Entry[] = [];

  if (legacyEvents) parseLifecycle(legacyEvents, cutoffMs, sink);
  for (const content of eventContents) {
    if (content) parseLifecycle(content, cutoffMs, sink);
  }
  toHumansFiles.forEach((file, i) => {
    const content = toHumansContents[i];
    if (content) {
      parseNotes(content, actorFromFilename(file.name), "note-to-humans", cutoffMs, sink);
    }
  });

  // HV-094: human-to-bot notes from DB (replaces the old hive/notes-to-bots
  // Git read path). Source of truth is the human_notes table.
  const cutoffDate = new Date(cutoffMs);
  const noteRows = await db
    .select()
    .from(humanNotes)
    .where(and(eq(humanNotes.projectId, project.id), gt(humanNotes.createdAt, cutoffDate)))
    .orderBy(desc(humanNotes.createdAt))
    .limit(MAX_LINES);
  for (const n of noteRows) {
    sink.push({
      kind: "note-to-bots",
      ts: n.createdAt.toISOString(),
      actor: n.actor,
      raw: n.message,
    });
  }

  // HV-090: include unexpired soft-fence claims as transient entries.
  // Rendered by the swarm panel and used by bot DAG-walks to skip
  // tickets a peer has just claimed (before the canonical Git move
  // commits).
  const now = new Date();
  const claims = await db
    .select()
    .from(activeClaims)
    .where(and(eq(activeClaims.projectId, project.id), gt(activeClaims.expiresAt, now)));
  for (const c of claims) {
    sink.push({
      kind: "claim-active",
      ts: c.claimedAt.toISOString(),
      actor: c.handle,
      raw: `claim ${c.hvId}`,
      hvId: c.hvId,
      expiresAt: c.expiresAt.toISOString(),
    });
  }

  sink.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  const entries = sink.slice(0, MAX_LINES);

  return NextResponse.json({ entries });
}
