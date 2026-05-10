// PATCH /api/projects/[id]/health/[anomalyId] — manually mark an
// anomaly resolved. The cron will reopen it on the next cycle if the
// underlying violation is still present, so this is best used after the
// human has actually fixed the issue (or for false-positive triage).

import { db } from "@/db";
import { swarmAnomalies } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/projects";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string; anomalyId: string }> },
) {
  const { id: projectId, anomalyId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.name !== "allavallc") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const updated = await db
    .update(swarmAnomalies)
    .set({ resolvedAt: new Date() })
    .where(and(eq(swarmAnomalies.id, anomalyId), eq(swarmAnomalies.projectId, projectId)))
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: "anomaly not found" }, { status: 404 });
  }

  return NextResponse.json({ anomaly: updated[0] });
}
