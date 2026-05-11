// FS-022: assemble a RepoState snapshot for one project.
//
// Data sources:
// - tickets (already synced into the `tickets` table by sync.ts)
// - features (already synced into the `features` table; we parse Owner /
//   Status out of the body)
// - event logs (fetched fresh from GitHub via the App — not in DB)
//
// Returns a RepoState the pure evaluator (swarm-health.ts) can consume.

import { db } from "@/db";
import { features as featuresTable, projects, tickets as ticketsTable } from "@/db/schema";
import { installationOctokit } from "@/lib/github";
import {
  type EventLog,
  type FeatureSet,
  type RepoState,
  type Ticket,
  parseEventLine,
} from "@/lib/swarm-health";
import { eq } from "drizzle-orm";

type Octokit = Awaited<ReturnType<typeof installationOctokit>>;

async function fetchEventLogs(oct: Octokit, owner: string, repo: string): Promise<EventLog[]> {
  let entries: { name: string; type: string }[] = [];
  try {
    const resp = await oct.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: "hive/events",
    });
    if (Array.isArray(resp.data)) {
      entries = resp.data
        .filter((e) => e.type === "file" && e.name.endsWith(".log"))
        .map((e) => ({ name: e.name, type: e.type }));
    }
  } catch (err) {
    if ((err as { status?: number }).status === 404) return [];
    throw err;
  }

  const logs: EventLog[] = [];
  for (const entry of entries) {
    const basename = entry.name.replace(/\.log$/, "");
    try {
      const fileResp = await oct.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: `hive/events/${entry.name}`,
      });
      const data = fileResp.data as { content?: string };
      if (!data.content) {
        logs.push({ basename, entries: [] });
        continue;
      }
      const text = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
      const lines = text.split(/\r?\n/);
      const parsed = lines
        .map((l) => parseEventLine(l))
        .filter((e): e is NonNullable<typeof e> => e !== null);
      logs.push({ basename, entries: parsed });
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        logs.push({ basename, entries: [] });
        continue;
      }
      throw err;
    }
  }
  return logs;
}

// Parse Owner / Status out of an FS file body. The body is the post-title
// content (per parseFeatureSet) — Owner / Status appear as `**Owner**: <value>`
// and `**Status**: <value>` lines, typically near the top.
export function parseFsOwnerStatus(body: string): { owner: string; status: string } {
  const ownerMatch = body.match(/^\s*\*\*Owner\*\*:[ \t]*(.*)$/m);
  const statusMatch = body.match(/^\s*\*\*Status\*\*:[ \t]*(.*)$/m);
  return {
    owner: (ownerMatch?.[1] || "").trim(),
    status: (statusMatch?.[1] || "").trim(),
  };
}

export async function fetchRepoState(projectId: string): Promise<RepoState> {
  // Project + GitHub coordinates.
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    throw new Error(`project ${projectId} not found`);
  }
  const [owner, repo] = project.githubRepo.split("/");
  if (!owner || !repo) {
    throw new Error(`project ${projectId} has invalid githubRepo: ${project.githubRepo}`);
  }

  // Tickets from DB.
  const ticketRows = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.projectId, projectId));
  const tickets: Ticket[] = ticketRows.map((row) => ({
    hvId: row.hvId,
    filename: row.filePath.split("/").pop() ?? "",
    state: row.state,
    frontmatter: (row.frontmatter ?? {}) as Record<string, string>,
  }));

  // Feature sets from DB (parse Owner/Status out of body).
  const fsRows = await db
    .select()
    .from(featuresTable)
    .where(eq(featuresTable.projectId, projectId));
  const featureSets: FeatureSet[] = fsRows.map((row) => {
    const { owner: fsOwner, status } = parseFsOwnerStatus(row.body);
    return { fsId: row.fsId, owner: fsOwner, status };
  });

  // Event logs fresh from GitHub.
  const oct = await installationOctokit(project.installId);
  const eventLogs = await fetchEventLogs(oct, owner, repo);

  return { tickets, featureSets, eventLogs, now: new Date() };
}
