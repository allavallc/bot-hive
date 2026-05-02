import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/db";
import { features as featuresTable, projects, syncState, tickets } from "@/db/schema";
import { installationOctokit } from "@/lib/github";
import { parseFeatureSet, parseTicket } from "@/lib/parse";
import { and, eq, notInArray } from "drizzle-orm";

const VALID_STATES = new Set([
  "backlog",
  "in-progress",
  "in-review",
  "done",
  "blocked",
  "not-doing",
]);

function getHiveMdTemplate(): string {
  try {
    return readFileSync(join(process.cwd(), "hive", "HIVE.md"), "utf8");
  } catch {
    return "# Bot Hive\n\nSee https://github.com/allavallc/bot-hive for the format.\n";
  }
}

const STARTER_CONFIG_JSON = `${JSON.stringify({ auto_commit_board: false }, null, 2)}\n`;

const STARTER_PATHS_WITHOUT_HIVE_MD = [
  { path: "hive/config.json", content: STARTER_CONFIG_JSON },
  { path: "hive/backlog/.gitkeep", content: "" },
  { path: "hive/in-progress/.gitkeep", content: "" },
  { path: "hive/in-review/.gitkeep", content: "" },
  { path: "hive/done/.gitkeep", content: "" },
  { path: "hive/blocked/.gitkeep", content: "" },
  { path: "hive/not-doing/.gitkeep", content: "" },
  { path: "hive/feature-sets/.gitkeep", content: "" },
];

export async function ensureHiveFolder(
  installationId: number,
  owner: string,
  repo: string,
): Promise<{ created: boolean }> {
  const oct = await installationOctokit(installationId);

  const repoInfo = await oct.request("GET /repos/{owner}/{repo}", {
    owner,
    repo,
  });
  const defaultBranch = repoInfo.data.default_branch;

  try {
    await oct.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: "hive",
      ref: defaultBranch,
    });
    return { created: false };
  } catch (err: unknown) {
    if ((err as { status?: number }).status !== 404) throw err;
  }

  const refResp = await oct.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const headSha = refResp.data.object.sha;
  const headCommit = await oct.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", {
    owner,
    repo,
    commit_sha: headSha,
  });
  const baseTreeSha = headCommit.data.tree.sha;

  const filesToCreate = [
    { path: "hive/HIVE.md", content: getHiveMdTemplate() },
    ...STARTER_PATHS_WITHOUT_HIVE_MD,
  ];

  const blobs = await Promise.all(
    filesToCreate.map(async (f) => {
      const blob = await oct.request("POST /repos/{owner}/{repo}/git/blobs", {
        owner,
        repo,
        content: f.content,
        encoding: "utf-8",
      });
      return { path: f.path, sha: blob.data.sha };
    }),
  );

  const newTree = await oct.request("POST /repos/{owner}/{repo}/git/trees", {
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: blobs.map((b) => ({
      path: b.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: b.sha,
    })),
  });

  const commit = await oct.request("POST /repos/{owner}/{repo}/git/commits", {
    owner,
    repo,
    message: "chore: bootstrap Bot Hive folder",
    tree: newTree.data.sha,
    parents: [headSha],
  });

  await oct.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
    sha: commit.data.sha,
  });

  return { created: true };
}

type TreeEntry = { path?: string; sha?: string; type?: string };

function deriveState(filePath: string): string | null {
  const m = /^hive\/([^/]+)\/[^/]+\.md$/.exec(filePath);
  if (!m) return null;
  return VALID_STATES.has(m[1]) ? m[1] : null;
}

function fsIdFromFilename(filePath: string): string | null {
  const m = /^hive\/feature-sets\/([^/]+)\.md$/.exec(filePath);
  return m ? m[1] : null;
}

export async function initialSync(projectId: string): Promise<{
  ticketsUpserted: number;
  featuresUpserted: number;
  filesSkipped: number;
  headSha: string;
}> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  const [owner, repo] = project.githubRepo.split("/");
  if (!owner || !repo) {
    throw new Error(`Bad githubRepo format: ${project.githubRepo}`);
  }

  const oct = await installationOctokit(project.installId);

  const repoInfo = await oct.request("GET /repos/{owner}/{repo}", {
    owner,
    repo,
  });
  const defaultBranch = repoInfo.data.default_branch;
  const refResp = await oct.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const headSha = refResp.data.object.sha;

  const tree = await oct.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
    owner,
    repo,
    tree_sha: headSha,
    recursive: "1",
  });

  const entries = (tree.data.tree as TreeEntry[]).filter(
    (e): e is Required<TreeEntry> =>
      e.type === "blob" &&
      typeof e.path === "string" &&
      typeof e.sha === "string" &&
      e.path.startsWith("hive/") &&
      e.path.endsWith(".md"),
  );

  type TicketUpsert = {
    hvId: string;
    state: string;
    title: string;
    frontmatter: Record<string, string>;
    body: string;
    filePath: string;
    fileSha: string;
  };
  type FeatureUpsert = {
    fsId: string;
    title: string;
    body: string;
    fileSha: string;
  };

  const ticketRows: TicketUpsert[] = [];
  const featureRows: FeatureUpsert[] = [];
  let filesSkipped = 0;

  for (const entry of entries) {
    try {
      const blob = await oct.request("GET /repos/{owner}/{repo}/git/blobs/{file_sha}", {
        owner,
        repo,
        file_sha: entry.sha,
      });
      const content = Buffer.from(blob.data.content, "base64").toString("utf8");

      const fsId = fsIdFromFilename(entry.path);
      if (fsId) {
        const parsed = parseFeatureSet(content);
        featureRows.push({
          fsId,
          title: parsed.title,
          body: parsed.body,
          fileSha: entry.sha,
        });
        continue;
      }

      const state = deriveState(entry.path);
      if (!state) continue;

      const parsed = parseTicket(content);
      ticketRows.push({
        hvId: parsed.hvId,
        state,
        title: parsed.title,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        filePath: entry.path,
        fileSha: entry.sha,
      });
    } catch (err) {
      console.warn(`[sync] skipping ${entry.path}: ${err instanceof Error ? err.message : err}`);
      filesSkipped += 1;
    }
  }

  await db.transaction(async (tx) => {
    for (const row of ticketRows) {
      await tx
        .insert(tickets)
        .values({
          projectId,
          hvId: row.hvId,
          state: row.state,
          title: row.title,
          frontmatter: row.frontmatter,
          body: row.body,
          filePath: row.filePath,
          fileSha: row.fileSha,
        })
        .onConflictDoUpdate({
          target: [tickets.projectId, tickets.hvId],
          set: {
            state: row.state,
            title: row.title,
            frontmatter: row.frontmatter,
            body: row.body,
            filePath: row.filePath,
            fileSha: row.fileSha,
          },
        });
    }

    const presentHvIds = ticketRows.map((r) => r.hvId);
    if (presentHvIds.length > 0) {
      await tx
        .delete(tickets)
        .where(and(eq(tickets.projectId, projectId), notInArray(tickets.hvId, presentHvIds)));
    } else {
      await tx.delete(tickets).where(eq(tickets.projectId, projectId));
    }

    for (const row of featureRows) {
      await tx
        .insert(featuresTable)
        .values({
          projectId,
          fsId: row.fsId,
          title: row.title,
          body: row.body,
          fileSha: row.fileSha,
        })
        .onConflictDoUpdate({
          target: [featuresTable.projectId, featuresTable.fsId],
          set: {
            title: row.title,
            body: row.body,
            fileSha: row.fileSha,
          },
        });
    }

    const presentFsIds = featureRows.map((r) => r.fsId);
    if (presentFsIds.length > 0) {
      await tx
        .delete(featuresTable)
        .where(
          and(eq(featuresTable.projectId, projectId), notInArray(featuresTable.fsId, presentFsIds)),
        );
    } else {
      await tx.delete(featuresTable).where(eq(featuresTable.projectId, projectId));
    }

    const now = new Date();
    await tx
      .insert(syncState)
      .values({ projectId, lastSha: headSha, lastRunAt: now })
      .onConflictDoUpdate({
        target: syncState.projectId,
        set: { lastSha: headSha, lastRunAt: now },
      });

    await tx
      .update(projects)
      .set({ lastSyncSha: headSha, lastSyncedAt: now, status: "active" })
      .where(eq(projects.id, projectId));
  });

  return {
    ticketsUpserted: ticketRows.length,
    featuresUpserted: featureRows.length,
    filesSkipped,
    headSha,
  };
}
