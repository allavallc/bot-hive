import { db } from "@/db";
import { features as featuresTable, tickets } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/projects";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

  return NextResponse.json({
    project: {
      id: project.id,
      displayName: project.displayName,
      githubRepo: project.githubRepo,
      lastSyncSha: project.lastSyncSha,
      lastSyncedAt: project.lastSyncedAt,
    },
    tickets: ticketRows,
    features: featureRows,
  });
}
