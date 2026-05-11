// POST /api/projects/[id]/notes — record a human-to-bot note in the
// human_notes table and broadcast SSE so the swarm panel renders it in ~1s.
//
// HV-094 rip-out: previously committed each note to Git via PR + auto-merge.
// That's the wrong primitive for advisory chat — it created PR queue noise
// and ~2-3 min visibility lag. Notes are conversational, not canonical
// state, and belong in transient DB rows. Wipe `human_notes` tomorrow and
// the swarm still works (just loses chat history).
//
// Bot→human direction still flows through Git (`hive/notes-to-humans/<bot>.log`)
// because bots have existing git auth but no API session — asymmetric on
// purpose for v1.

import { db } from "@/db";
import { humanNotes } from "@/db/schema";
import { auth } from "@/lib/auth";
import { broadcast } from "@/lib/broadcast";
import { validateMessage } from "@/lib/notes";
import { getProjectForUser } from "@/lib/projects";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: { message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const validation = validateMessage(body.message);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const actor = session.user.name || session.user.email || "user";
  const [row] = await db
    .insert(humanNotes)
    .values({
      projectId: project.id,
      actor,
      message: validation.message,
    })
    .returning();

  broadcast({ type: "project-changed", projectId });

  return NextResponse.json({
    ok: true,
    id: row.id,
    actor: row.actor,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  });
}
