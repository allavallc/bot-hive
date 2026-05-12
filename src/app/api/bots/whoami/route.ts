// GET /api/bots/whoami?repo_full_name=…&colony=…&handle=… —
// return the bot's current seat + role. Always fresh from DB.
//
// Auth: none in v1.
// Response: { seat, total, role, skill_files }.

import { db } from "@/db";
import { projects } from "@/db/schema";
import { getSeatState } from "@/lib/seats";
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
