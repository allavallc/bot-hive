// POST /api/bots/join — allocate a seat in (project, colony) for a bot.
//
// Auth: none in v1 (documented in docs/2026-05-12-bot-seat-assignment-design.md
// "Known limitations"). Blast radius is one project's seat strip.
//
// Body: { repo_full_name, colony, handle }.
// Response: { seat, total, role, skill_files }.

import { db } from "@/db";
import { projects } from "@/db/schema";
import { allocateSeat } from "@/lib/seats";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type JoinBody = {
  repo_full_name?: unknown;
  colony?: unknown;
  handle?: unknown;
};

export async function POST(req: Request) {
  let body: JoinBody;
  try {
    body = (await req.json()) as JoinBody;
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

  const seatState = await db.transaction((tx) => allocateSeat(tx, project.id, colony, handle));

  return NextResponse.json({
    seat: seatState.seat,
    total: seatState.total,
    role: seatState.role,
    skill_files: seatState.skillFiles,
  });
}
