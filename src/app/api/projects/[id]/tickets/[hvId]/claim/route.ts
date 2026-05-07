// POST /api/projects/[id]/tickets/[hvId]/claim — soft-fence claim signal.
//
// HV-090. The platform records a transient claim in active_claims and
// broadcasts SSE so the swarm panel + other bots see "sparrow has HV-053"
// within ~1s — without the PR ceremony required to commit a folder move.
//
// IMPORTANT: this is a fence, not the source of truth. Git remains
// canonical. The claim record exists only to:
//   1. Reject simultaneous claims for the same ticket from a peer
//   2. Render an optimistic in-progress state on the live board
//   3. Tell other bots' DAG-walks "skip this; sparrow has it"
//
// Claims expire after CLAIM_TTL_MS if not converted to a real Git commit
// (the webhook handler clears the claim when it sees the ticket file
// move out of `hive/backlog/`).
//
// Auth: session cookie. The user's session is the access boundary
// (project membership). Within a project, any session can claim on
// behalf of any handle — bots running under a user's session pass their
// handle in the request body. This is fine for the small-team trust
// model; if you ever need cross-actor isolation, that's a separate
// feature.

import { db } from "@/db";
import { activeClaims } from "@/db/schema";
import { auth } from "@/lib/auth";
import { broadcast } from "@/lib/broadcast";
import { getProjectForUser } from "@/lib/projects";
import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CLAIM_TTL_MS = 30 * 60 * 1000; // 30 min — long enough for setup + first commit, short enough that abandoned claims expire fast.
const HV_ID_RE = /^HV-\d+$/;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; hvId: string }> },
) {
  const { id: projectId, hvId } = await params;

  if (!HV_ID_RE.test(hvId)) {
    return NextResponse.json({ error: "invalid ticket id" }, { status: 400 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: { handle?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const handleRaw = typeof body.handle === "string" ? body.handle.trim() : "";
  if (!HANDLE_RE.test(handleRaw)) {
    return NextResponse.json(
      { error: "handle must be lowercase alphanumeric/dash, 1-64 chars" },
      { status: 400 },
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CLAIM_TTL_MS);

  // Check for an existing unexpired claim. If one exists for the same
  // handle, treat it as an extension (refresh the TTL). If for a
  // different handle, reject 409 — the fence's whole job.
  const existing = await db
    .select()
    .from(activeClaims)
    .where(
      and(
        eq(activeClaims.projectId, project.id),
        eq(activeClaims.hvId, hvId),
        gt(activeClaims.expiresAt, now),
      ),
    )
    .limit(1);

  if (existing.length > 0 && existing[0].handle !== handleRaw) {
    return NextResponse.json(
      {
        error: "ticket currently held by a peer",
        heldBy: existing[0].handle,
        expiresAt: existing[0].expiresAt.toISOString(),
      },
      { status: 409 },
    );
  }

  // Upsert: insert new or refresh existing same-handle claim. Also
  // sweeps any expired claim for this ticket (not strictly necessary —
  // the where-clause above already ignored it — but keeps the table
  // tidy without a separate cleanup job).
  await db
    .delete(activeClaims)
    .where(and(eq(activeClaims.projectId, project.id), eq(activeClaims.hvId, hvId)));
  await db.insert(activeClaims).values({
    projectId: project.id,
    hvId,
    handle: handleRaw,
    claimedAt: now,
    expiresAt,
  });

  broadcast({
    type: "claim",
    projectId: project.id,
    hvId,
    handle: handleRaw,
    expiresAt: expiresAt.toISOString(),
  });

  return NextResponse.json({
    ok: true,
    hvId,
    handle: handleRaw,
    claimedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttlMs: CLAIM_TTL_MS,
  });
}
