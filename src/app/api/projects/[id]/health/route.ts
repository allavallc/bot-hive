// GET /api/projects/[id]/health — return open swarm-health anomalies
// for one project, sorted by severity then last-seen.
//
// FS-022 rollout gate: hardcoded to `session.user.name === "allavallc"`.
// Other Bot Hive customers see no health panel at all until we widen.

import { db } from "@/db";
import { swarmAnomalies } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/projects";
import { and, desc, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Admin-only during the rollout phase.
  if (session.user.name !== "allavallc") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(swarmAnomalies)
    .where(and(eq(swarmAnomalies.projectId, projectId), isNull(swarmAnomalies.resolvedAt)))
    .orderBy(desc(swarmAnomalies.lastSeenAt));

  rows.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99));

  return NextResponse.json({ anomalies: rows });
}
