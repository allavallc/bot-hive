import type { tickets } from "@/db/schema";
import { graphqlInstallation, installationOctokit } from "@/lib/github";
import type { ProjectRow } from "@/lib/projects";

type TicketRow = typeof tickets.$inferSelect;

async function getDefaultBranch(
  oct: Awaited<ReturnType<typeof installationOctokit>>,
  owner: string,
  repo: string,
): Promise<string> {
  const info = await oct.request("GET /repos/{owner}/{repo}", { owner, repo });
  return info.data.default_branch;
}

async function getHeadState(
  oct: Awaited<ReturnType<typeof installationOctokit>>,
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

async function getFileContent(
  oct: Awaited<ReturnType<typeof installationOctokit>>,
  owner: string,
  repo: string,
  path: string,
): Promise<{ content: string; sha: string }> {
  const resp = await oct.request("GET /repos/{owner}/{repo}/contents/{path}", {
    owner,
    repo,
    path,
  });
  const data = resp.data as { content: string; sha: string };
  const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { content, sha: data.sha };
}

async function getFileContentOrEmpty(
  oct: Awaited<ReturnType<typeof installationOctokit>>,
  owner: string,
  repo: string,
  path: string,
): Promise<string> {
  try {
    const { content } = await getFileContent(oct, owner, repo, path);
    return content;
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return "";
    throw err;
  }
}

function actorSlug(actorName: string): string {
  return (
    actorName
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "anon"
  );
}

function appendEventLine(existing: string, line: string): string {
  const trimmed = existing.trimEnd();
  return trimmed ? `${trimmed}\n${line}\n` : `${line}\n`;
}

async function createBlob(
  oct: Awaited<ReturnType<typeof installationOctokit>>,
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

async function pushBranchAndPR(
  oct: Awaited<ReturnType<typeof installationOctokit>>,
  installationId: number,
  owner: string,
  repo: string,
  base: string,
  headSha: string,
  baseTreeSha: string,
  treeEntries: Array<{ path: string; sha: string | null }>,
  commitMessage: string,
  prTitle: string,
  prBody: string,
  commitAuthor: { name: string; email: string },
): Promise<{ prUrl: string; prNumber: number }> {
  const newTree = await oct.request("POST /repos/{owner}/{repo}/git/trees", {
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeEntries.map((e) => ({
      path: e.path,
      mode: "100644" as const,
      type: "blob" as const,
      // biome-ignore lint/suspicious/noExplicitAny: GitHub API accepts null sha for file deletion
      sha: e.sha as any,
    })),
  });

  const newCommit = await oct.request("POST /repos/{owner}/{repo}/git/commits", {
    owner,
    repo,
    message: commitMessage,
    tree: newTree.data.sha,
    parents: [headSha],
    author: { ...commitAuthor, date: new Date().toISOString() },
  });

  const branchName = `review-${Date.now()}`;
  await oct.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: newCommit.data.sha,
  });

  const pr = await oct.request("POST /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    title: prTitle,
    body: prBody,
    head: branchName,
    base,
  });

  // Enable auto-merge via GraphQL (non-fatal if repo doesn't have auto-merge on)
  try {
    await graphqlInstallation<unknown>(
      installationId,
      `mutation EnableAutoMerge($id: ID!) {
        enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) {
          pullRequest { number }
        }
      }`,
      { id: pr.data.node_id },
    );
  } catch {
    // Auto-merge may not be enabled on the repo; PR is still created
  }

  return { prUrl: pr.data.html_url, prNumber: pr.data.number };
}

export async function acceptTicket(
  project: ProjectRow,
  ticket: TicketRow,
  actorName: string,
  actorEmail: string,
): Promise<{ prUrl: string; prNumber: number }> {
  const [owner, repo] = project.githubRepo.split("/");
  const oct = await installationOctokit(project.installId);
  const branch = await getDefaultBranch(oct, owner, repo);
  const { headSha, baseTreeSha } = await getHeadState(oct, owner, repo, branch);

  const { content: ticketContent } = await getFileContent(oct, owner, repo, ticket.filePath);
  const today = new Date().toISOString().slice(0, 10);
  const updatedTicket = ticketContent
    .replace(/^- \*\*Status\*\*:.*$/m, "- **Status**: done")
    .replace(/^- \*\*Completed\*\*:.*$/m, `- **Completed**: ${today}`);

  const slug = actorSlug(actorName);
  const actorLogPath = `hive/events/${slug}.log`;
  const existingActorLog = await getFileContentOrEmpty(oct, owner, repo, actorLogPath);
  const isoNow = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const updatedActorLog = appendEventLine(
    existingActorLog,
    `${isoNow} ${ticket.hvId} accepted ${actorName}`,
  );

  const parts = ticket.filePath.split("/");
  const fileName = parts[parts.length - 1] ?? ticket.hvId;
  const newPath = `hive/done/${fileName}`;

  const [ticketBlobSha, actorLogBlobSha] = await Promise.all([
    createBlob(oct, owner, repo, updatedTicket),
    createBlob(oct, owner, repo, updatedActorLog),
  ]);

  const summary = `${ticket.hvId}: accepted by ${actorName}`;
  return pushBranchAndPR(
    oct,
    project.installId,
    owner,
    repo,
    branch,
    headSha,
    baseTreeSha,
    [
      { path: newPath, sha: ticketBlobSha },
      { path: ticket.filePath, sha: null },
      { path: actorLogPath, sha: actorLogBlobSha },
    ],
    `${summary}\n\nAccepted-by: ${actorName}\nTrigger: ${ticket.hvId} accepted`,
    summary,
    `Accepted by ${actorName}.\n\n🤖 Generated with [Bot Hive](https://bot-hive-j0ax.onrender.com)`,
    { name: actorName, email: actorEmail },
  );
}

export async function rejectTicket(
  project: ProjectRow,
  ticket: TicketRow,
  reason: string,
  actorName: string,
  actorEmail: string,
): Promise<{ prUrl: string; prNumber: number }> {
  const [owner, repo] = project.githubRepo.split("/");
  const oct = await installationOctokit(project.installId);
  const branch = await getDefaultBranch(oct, owner, repo);
  const { headSha, baseTreeSha } = await getHeadState(oct, owner, repo, branch);

  const { content: ticketContent } = await getFileContent(oct, owner, repo, ticket.filePath);
  const today = new Date().toISOString().slice(0, 10);
  const reasonTrimmed = reason.trim();
  const updatedTicket = ticketContent
    .replace(/^- \*\*Status\*\*:.*$/m, "- **Status**: in-progress")
    .replace(/^- \*\*Rejected by\*\*:.*$/m, `- **Rejected by**: ${actorName}`)
    .replace(/^- \*\*Rejected\*\*:.*$/m, `- **Rejected**: ${today}`)
    .replace(/^- \*\*Rejection reason\*\*:.*$/m, `- **Rejection reason**: ${reasonTrimmed}`);

  const slug = actorSlug(actorName);
  const actorLogPath = `hive/events/${slug}.log`;
  const existingActorLog = await getFileContentOrEmpty(oct, owner, repo, actorLogPath);
  const isoNow = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const updatedActorLog = appendEventLine(
    existingActorLog,
    `${isoNow} ${ticket.hvId} rejected ${actorName}`,
  );

  const parts = ticket.filePath.split("/");
  const fileName = parts[parts.length - 1] ?? ticket.hvId;
  const newPath = `hive/in-progress/${fileName}`;

  const [ticketBlobSha, actorLogBlobSha] = await Promise.all([
    createBlob(oct, owner, repo, updatedTicket),
    createBlob(oct, owner, repo, updatedActorLog),
  ]);

  const reasonSummary =
    reasonTrimmed.length > 70 ? `${reasonTrimmed.slice(0, 67)}...` : reasonTrimmed;
  const title = `${ticket.hvId}: rejected — ${reasonSummary}`;
  const commitMsg = [
    title,
    "",
    reasonTrimmed !== reasonSummary ? reasonTrimmed : "",
    `Rejected-by: ${actorName}`,
    `Trigger: ${ticket.hvId} rejected`,
  ]
    .filter((l, i) => i === 0 || l.length > 0)
    .join("\n");

  return pushBranchAndPR(
    oct,
    project.installId,
    owner,
    repo,
    branch,
    headSha,
    baseTreeSha,
    [
      { path: newPath, sha: ticketBlobSha },
      { path: ticket.filePath, sha: null },
      { path: actorLogPath, sha: actorLogBlobSha },
    ],
    commitMsg,
    title,
    `Rejected by ${actorName}.\n\n**Reason:** ${reasonTrimmed}\n\n🤖 Generated with [Bot Hive](https://bot-hive-j0ax.onrender.com)`,
    { name: actorName, email: actorEmail },
  );
}
