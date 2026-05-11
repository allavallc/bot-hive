// FS-025: PATCH /api/projects/[id]/suggestions/[suggestionId] — approve
// or reject a pending suggestion. Body: { action: "approve" | "reject",
// reason?: string }. Reject requires a reason.

import { db } from "@/db";
import { botSuggestions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { broadcast } from "@/lib/broadcast";
import { getProjectForUser } from "@/lib/projects";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; suggestionId: string }> },
) {
  const { id: projectId, suggestionId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.name !== "allavallc") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { action?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const action = body.action;
  const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }
  if (action === "reject" && !reasonRaw) {
    return NextResponse.json({ error: "reject requires a non-empty reason" }, { status: 400 });
  }
  if (reasonRaw.length > 280) {
    return NextResponse.json({ error: "reason exceeds 280 chars" }, { status: 400 });
  }

  const [updated] = await db
    .update(botSuggestions)
    .set({
      status: action === "approve" ? "approved" : "rejected",
      rejectionReason: action === "reject" ? reasonRaw : null,
      resolvedAt: new Date(),
    })
    .where(
      and(
        eq(botSuggestions.id, suggestionId),
        eq(botSuggestions.projectId, projectId),
        eq(botSuggestions.status, "pending"),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: "suggestion not found or already resolved" },
      { status: 404 },
    );
  }

  broadcast({ type: "project-changed", projectId });

  return NextResponse.json({ suggestion: updated });
}
