import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { auth } from "@/lib/auth";
import { broadcast } from "@/lib/broadcast";
import { getProjectForUser } from "@/lib/projects";
import { type Signal, addSignal } from "@/lib/signal-buffer";
import { acceptTicket } from "@/lib/ticket-review";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; hvId: string }> },
) {
  const { id: projectId, hvId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.projectId, projectId), eq(tickets.hvId, hvId)))
    .limit(1);

  if (!ticket) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }
  if (ticket.state !== "in-review") {
    return NextResponse.json({ error: "ticket is not in-review" }, { status: 409 });
  }

  try {
    const actorName = session.user.name ?? session.user.id;
    const actorEmail = session.user.email ?? `${actorName}@users.noreply.github.com`;
    const result = await acceptTicket(project, ticket, actorName, actorEmail);

    // Publish a real-time signal so the board can render a "pending merge"
    // badge on the card immediately, without waiting for the PR to merge +
    // Render to redeploy. (HV-055: pending-transition badge.)
    const signal: Signal = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "accepted",
      message: `Approved by ${actorName} (PR #${result.prNumber})`,
      user: actorName,
      refs: [hvId],
    };
    addSignal(projectId, signal);
    broadcast({ type: "signal", projectId, signal });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[accept] failed:", err);
    return NextResponse.json({ error: "failed to create PR" }, { status: 500 });
  }
}
