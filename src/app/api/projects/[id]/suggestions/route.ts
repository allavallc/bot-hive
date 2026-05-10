// FS-025: GET /api/projects/[id]/suggestions — list pending suggestions
// POST /api/projects/[id]/suggestions — file a suggestion (admin-only v1).
//
// V1 access: gated to allavallc only (same admin gate as the swarm-health
// panel). Bot-side API tokens for direct bot writes ship in v2; for now
// the human files suggestions manually via the panel form (or by manual
// API call) so the inbox has data to render and the Approve/Reject flow
// can be exercised end-to-end.

import { db } from "@/db";
import { botSuggestions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { broadcast } from "@/lib/broadcast";
import { getProjectForUser } from "@/lib/projects";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.name !== "allavallc") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(botSuggestions)
    .where(and(eq(botSuggestions.projectId, projectId), eq(botSuggestions.status, "pending")))
    .orderBy(desc(botSuggestions.createdAt));

  return NextResponse.json({ suggestions: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.name !== "allavallc") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { suggesterActor?: unknown; targetPmActor?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const suggesterActor = typeof body.suggesterActor === "string" ? body.suggesterActor.trim() : "";
  const targetPmActor = typeof body.targetPmActor === "string" ? body.targetPmActor.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!suggesterActor || !targetPmActor || !message) {
    return NextResponse.json(
      { error: "suggesterActor, targetPmActor, and message are required" },
      { status: 400 },
    );
  }
  if (message.length > 1000) {
    return NextResponse.json({ error: "message exceeds 1000 chars" }, { status: 400 });
  }

  const [row] = await db
    .insert(botSuggestions)
    .values({ projectId, suggesterActor, targetPmActor, message })
    .returning();

  // Reuse the generic project-changed signal so any open panel re-fetches.
  // A dedicated "suggestion-created" event is a future refinement.
  broadcast({ type: "project-changed", projectId });

  return NextResponse.json({ suggestion: row });
}
