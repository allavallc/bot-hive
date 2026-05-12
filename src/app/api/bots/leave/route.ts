// POST /api/bots/leave — sign a bot off cleanly.
//
// Marks the row offline, renumbers survivors (so seats stay
// contiguous), and broadcasts `bot-left` to the project SSE stream.
// The bot prints "Safe to close this window" only after a 200 from
// this route — that's the gate against half-completed leaves.
//
// Auth: none in v1.
// Body: { repo_full_name, colony, handle }.
// Response: { ok: true, departed: {handle, seat}, seat_map: [...] }.

import { db } from "@/db";
import { projects } from "@/db/schema";
import { broadcast } from "@/lib/broadcast";
import { markOffline, renumberAfter, seatMap } from "@/lib/seats";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type LeaveBody = {
  repo_full_name?: unknown;
  colony?: unknown;
  handle?: unknown;
};

export async function POST(req: Request) {
  let body: LeaveBody;
  try {
    body = (await req.json()) as LeaveBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const repoFullName = typeof body.repo_full_name === "string" ? body.repo_full_name : "";
  const colony = typeof body.colony === "string" ? body.colony : "";
  const handle = typeof body.handle === "string" ? body.handle : "";
  if (!repoFullName || !colony || !handle) {
    return NextResponse.json(
      { error: "repo_full_name, colony, and handle are required" },
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

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${project.id} || ':' || ${colony}))`,
    );
    const departingSeat = await markOffline(tx, project.id, colony, handle);
    if (departingSeat === null) return null;
    await renumberAfter(tx, project.id, colony, departingSeat);
    const map = await seatMap(tx, project.id, colony);
    return { departingSeat, map };
  });

  if (!result) {
    return NextResponse.json(
      { error: `no active bot for ${colony}.${handle} in ${repoFullName}` },
      { status: 404 },
    );
  }

  broadcast({
    type: "bot-left",
    projectId: project.id,
    colony,
    departed: { handle, seat: result.departingSeat },
    seatMap: result.map,
  });

  return NextResponse.json({
    ok: true,
    departed: { handle, seat: result.departingSeat },
    seat_map: result.map,
  });
}
