import { db } from "@/db";
import { features as featuresTable, projects, tickets } from "@/db/schema";
import { auth } from "@/lib/auth";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
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

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.billingOwnerId, session.user.id)))
    .limit(1);
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

  return (
    <Board
      project={{
        id: project.id,
        displayName: project.displayName,
        githubRepo: project.githubRepo,
      }}
      initialTickets={initialTickets}
      initialFeatures={initialFeatures}
    />
  );
}
