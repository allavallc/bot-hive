import { db } from "@/db";
import { tickets } from "@/db/schema";
import { auth } from "@/lib/auth";
import { broadcast } from "@/lib/broadcast";
import { getProjectForUser } from "@/lib/projects";
import { rejectTicket } from "@/lib/ticket-review";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { reason } = (body ?? {}) as Record<string, unknown>;
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  try {
    const actorName = session.user.name ?? session.user.id;
    const actorEmail = session.user.email ?? `${actorName}@users.noreply.github.com`;
    const result = await rejectTicket(project, ticket, reason, actorName, actorEmail);

    // Broadcast a `ticket-action` so the board can render an optimistic
    // column move within ~200ms of the click — well before the PR merges
    // and Render redeploys. (HV-055 / HV-072 / HV-082.)
    broadcast({
      type: "ticket-action",
      projectId,
      hvId,
      kind: "rejected",
      actor: actorName,
      message: `Rejected by ${actorName} (PR #${result.prNumber})`,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[reject] failed:", err);
    return NextResponse.json({ error: "failed to create PR" }, { status: 500 });
  }
}
