import { db } from "@/db";
import { account, features as featuresTable, tickets, user } from "@/db/schema";
import { listRepoCollaborators } from "@/lib/access";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/projects";
import { and, asc, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BillingOwnerPanel } from "./billing-owner.client";
import { Board } from "./board.client";

export const dynamic = "force-dynamic";

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) notFound();

  // Fetch repo collaborators (via the App's installation token) and
  // resolve each one to a Bot Hive user (if they've signed in here).
  // Only collaborators who *have* signed in can be a billing owner —
  // we need a `user.id` to set as `billingOwnerId`. Non-signed-in
  // collaborators show in lists but can't be picked.
  const ghCollaborators = await listRepoCollaborators(project.githubRepo, project.installId).catch(
    () => [],
  );
  const ghIds = ghCollaborators.map((c) => String(c.id));

  const linkedAccounts: Array<{ userId: string; githubId: string }> =
    ghIds.length > 0
      ? await db
          .select({
            userId: account.userId,
            githubId: account.accountId,
          })
          .from(account)
          .where(and(eq(account.providerId, "github"), inArray(account.accountId, ghIds)))
      : [];

  const linkedUserIds = linkedAccounts.map((a) => a.userId);
  const userRows =
    linkedUserIds.length > 0
      ? await db.select().from(user).where(inArray(user.id, linkedUserIds))
      : [];

  // Build collaborator records for the UI (only ones with linked Bot Hive accounts).
  const collaboratorMap = new Map<string, { userId: string; login: string; avatarUrl: string }>();
  for (const ghc of ghCollaborators) {
    const ghIdStr = String(ghc.id);
    const linked = linkedAccounts.find((a) => a.githubId === ghIdStr);
    if (!linked) continue;
    collaboratorMap.set(linked.userId, {
      userId: linked.userId,
      login: ghc.login,
      avatarUrl: ghc.avatarUrl,
    });
  }

  // Resolve current billing owner.
  const currentOwnerRow = userRows.find((u) => u.id === project.billingOwnerId);
  const currentOwnerCollaborator = collaboratorMap.get(project.billingOwnerId);
  const currentOwner = currentOwnerCollaborator ?? {
    userId: project.billingOwnerId,
    login: currentOwnerRow?.name ?? "unknown",
    avatarUrl: "",
  };

  const ticketRows = await db
    .select()
    .from(tickets)
    .where(eq(tickets.projectId, projectId))
    .orderBy(asc(tickets.hvId));

  const featureRows = await db
    .select()
    .from(featuresTable)
    .where(eq(featuresTable.projectId, projectId))
    .orderBy(asc(featuresTable.fsId));

  const initialTickets = ticketRows.map((t) => ({
    id: t.id,
    hvId: t.hvId,
    state: t.state,
    title: t.title,
    frontmatter: (t.frontmatter as Record<string, string>) ?? {},
    body: t.body,
  }));

  const initialFeatures = featureRows.map((f) => ({
    id: f.id,
    fsId: f.fsId,
    title: f.title,
    body: f.body,
  }));

  return (
    <>
      <BillingOwnerPanel
        projectId={project.id}
        currentOwner={currentOwner}
        isOwner={project.billingOwnerId === session.user.id}
        collaborators={Array.from(collaboratorMap.values())}
      />
      <Board
        project={{
          id: project.id,
          displayName: project.displayName,
          githubRepo: project.githubRepo,
        }}
        initialTickets={initialTickets}
        initialFeatures={initialFeatures}
      />
    </>
  );
}
