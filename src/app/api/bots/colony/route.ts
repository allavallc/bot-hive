// GET /api/bots/colony?repo_full_name=… — return the project-wide seat
// map (every active bot grouped by colony, seat-ascending). Sweeps stale
// rows in each active colony before responding; broadcasts `bot-left`
// for each reclaimed row.
//
// Auth: none in v1.
// Response: { colonies: [{ colony, seats: [{handle, seat, role}, ...] }, ...] }.

import { db } from "@/db";
import { projects } from "@/db/schema";
import { broadcast } from "@/lib/broadcast";
import { listActiveColonies, seatMap, sweepStale } from "@/lib/seats";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const repoFullName = url.searchParams.get("repo_full_name") ?? "";
  if (!repoFullName) {
    return NextResponse.json({ error: "repo_full_name query param is required" }, { status: 400 });
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.githubRepo, repoFullName))
    .limit(1);
  if (!project) {
    return NextResponse.json(
      { error: `no project registered for repo '${repoFullName}'` },
      { status: 404 },
    );
  }

  const colonies = await listActiveColonies(db, project.id);

  // Sweep + read per colony. Each sweep runs inside its own transaction
  // with the (project, colony) advisory lock.
  const result: Array<{
    colony: string;
    seats: Awaited<ReturnType<typeof seatMap>>;
  }> = [];
  for (const colony of colonies) {
    const swept = await db.transaction(async (tx) => {
      const reclaimed = await sweepStale(tx, project.id, colony);
      const map = await seatMap(tx, project.id, colony);
      return { reclaimed, map };
    });
    for (const departed of swept.reclaimed) {
      broadcast({
        type: "bot-left",
        projectId: project.id,
        colony,
        departed,
        seatMap: swept.map,
      });
    }
    if (swept.map.length > 0) {
      result.push({ colony, seats: swept.map });
    }
  }

  return NextResponse.json({ colonies: result });
}
