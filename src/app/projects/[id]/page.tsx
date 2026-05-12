import { db } from "@/db";
import { features as featuresTable, tickets } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/projects";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AddBotButton } from "./add-bot-button.client";
import { AdminInbox } from "./admin-inbox.client";
import { Board } from "./board.client";
import { BotTeamButton } from "./bot-team-button.client";
import { SwarmPanel } from "./swarm-panel.client";

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

  // FS-022 + FS-025 admin gate: only allavallc sees the suggestions
  // inbox + swarm-health panel during the rollout. Both ride inside
  // a single slide-over triggered by the AdminInbox chip.
  const isAdmin = session.user.name === "allavallc";

  return (
    <>
      <Board
        project={{
          id: project.id,
          displayName: project.displayName,
          githubRepo: project.githubRepo,
        }}
        initialTickets={initialTickets}
        initialFeatures={initialFeatures}
      />
      <AdminInbox projectId={project.id} isAdmin={isAdmin} />
      <SwarmPanel projectId={project.id} />
      <AddBotButton projectId={project.id} />
      <BotTeamButton projectId={project.id} githubRepo={project.githubRepo} />
    </>
  );
}
