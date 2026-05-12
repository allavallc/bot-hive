// POST /api/bots/heartbeat — bump `last_heartbeat_at` for an active bot.
//
// No-op for offline rows (do not silently reactivate). 200 always
// (idempotent) — the bot doesn't need to know whether a row was
// updated; only `/join` is allowed to reactivate.
//
// Auth: none in v1.
// Body: { repo_full_name, colony, handle }.
// Response: { ok: true, last_heartbeat_at: <ISO> }.

import { db } from "@/db";
import { projects } from "@/db/schema";
import { bumpHeartbeat } from "@/lib/seats";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type HeartbeatBody = {
  repo_full_name?: unknown;
  colony?: unknown;
  handle?: unknown;
};

export async function POST(req: Request) {
  let body: HeartbeatBody;
  try {
    body = (await req.json()) as HeartbeatBody;
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
    // Unknown project: silently OK so a misconfigured bot doesn't get a
    // useful error. Heartbeat is a fire-and-forget liveness signal.
    return NextResponse.json({ ok: true, last_heartbeat_at: new Date().toISOString() });
  }

  const now = new Date();
  await bumpHeartbeat(db, project.id, colony, handle, now);

  return NextResponse.json({ ok: true, last_heartbeat_at: now.toISOString() });
}
