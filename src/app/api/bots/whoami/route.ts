// GET /api/bots/whoami?repo_full_name=…&colony=…&handle=… —
// return the bot's current seat + role. Always fresh from DB.
//
// Side effects (HV-131): sweeps stale rows in the colony before
// reading so the bot sees an accurate `total` count. Each sweep
// eviction broadcasts `bot-left` to the project SSE stream.
//
// Auth: none in v1.
// Response: { seat, total, role, skill_files }.

import { db } from "@/db";
import { projects } from "@/db/schema";
import { broadcast } from "@/lib/broadcast";
import { getSeatState, seatMap, sweepStale } from "@/lib/seats";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const repoFullName = url.searchParams.get("repo_full_name") ?? "";
  const colony = url.searchParams.get("colony") ?? "";
  const handle = url.searchParams.get("handle") ?? "";
  if (!repoFullName || !colony || !handle) {
    return NextResponse.json(
      { error: "repo_full_name, colony, and handle query params are required" },
      { status: 400 },
    );
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

  const sweep = await db.transaction(async (tx) => {
    const reclaimed = await sweepStale(tx, project.id, colony);
    const map = reclaimed.length > 0 ? await seatMap(tx, project.id, colony) : null;
    return { reclaimed, map };
  });
  if (sweep.map) {
    for (const departed of sweep.reclaimed) {
      broadcast({
        type: "bot-left",
        projectId: project.id,
        colony,
        departed,
        seatMap: sweep.map,
      });
    }
  }

  const state = await getSeatState(project.id, colony, handle);
  if (!state) {
    return NextResponse.json(
      { error: `no active bot for ${colony}.${handle} in ${repoFullName}` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    seat: state.seat,
    total: state.total,
    role: state.role,
    skill_files: state.skillFiles,
  });
}
