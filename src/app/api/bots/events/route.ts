// FS-031 / HV-147: bot-originated live coordination events.
//
// Bots POST transient operational events here instead of writing questions,
// blockers, handoffs, and review signals through Git. The server stores the
// event in Postgres, broadcasts to the board, and best-effort delivers to
// targeted open bot SSE streams on this instance.

import { db } from "@/db";
import { botEvents, bots, projects } from "@/db/schema";
import { roleMatches, validateBotEventInput } from "@/lib/bot-events";
import { deliverToConnection } from "@/lib/bot-registry";
import { broadcast } from "@/lib/broadcast";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const validation = validateBotEventInput(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const url = new URL(req.url);
  const event = validation.value;
  const repoFullName = url.searchParams.get("repo_full_name") || event.repoFullName || "";
  if (!repoFullName) {
    return NextResponse.json({ error: "repo_full_name is required" }, { status: 400 });
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.githubRepo, repoFullName))
    .limit(1);
  if (!project) {
    return NextResponse.json(
      { error: `no project registered for repo '${repoFullName}'` },
      {
        status: 404,
      },
    );
  }

  const [actor] = await db
    .select({ id: bots.id })
    .from(bots)
    .where(
      and(
        eq(bots.projectId, project.id),
        eq(bots.colony, event.colony),
        eq(bots.handle, event.handle),
        eq(bots.status, "active"),
      ),
    )
    .limit(1);
  if (!actor) {
    return NextResponse.json(
      { error: `no active bot for ${event.colony}.${event.handle} in ${repoFullName}` },
      { status: 404 },
    );
  }

  const [row] = await db
    .insert(botEvents)
    .values({
      projectId: project.id,
      colony: event.colony,
      handle: event.handle,
      kind: event.kind,
      message: event.message,
      targetHandle: event.targetHandle,
      targetRole: event.targetRole,
      data: event.data,
    })
    .returning({
      id: botEvents.id,
      createdAt: botEvents.createdAt,
    });

  const createdAt = row.createdAt.toISOString();
  const streamEvent = {
    type: "bot-event" as const,
    eventId: row.id,
    projectId: project.id,
    colony: event.colony,
    handle: event.handle,
    kind: event.kind,
    message: event.message,
    targetHandle: event.targetHandle,
    targetRole: event.targetRole,
    data: event.data,
    createdAt,
  };

  broadcast({
    type: "bot-event",
    projectId: project.id,
    eventId: row.id,
    colony: event.colony,
    handle: event.handle,
    kind: event.kind,
    message: event.message,
    targetHandle: event.targetHandle,
    targetRole: event.targetRole,
    createdAt,
  });

  let delivered = 0;
  if (event.targetHandle || event.targetRole) {
    const targetFilters = [
      eq(bots.projectId, project.id),
      eq(bots.colony, event.colony),
      eq(bots.status, "active"),
    ];
    if (event.targetHandle) {
      targetFilters.push(eq(bots.handle, event.targetHandle));
    }
    const targets = await db
      .select({
        connectionId: bots.connectionId,
        role: bots.role,
      })
      .from(bots)
      .where(and(...targetFilters));

    for (const target of targets) {
      if (!target.connectionId) continue;
      if (event.targetRole && !roleMatches(target.role, event.targetRole)) continue;
      if (deliverToConnection(target.connectionId, streamEvent)) {
        delivered += 1;
      }
    }
  }

  return NextResponse.json({
    id: row.id,
    delivered,
    event: streamEvent,
  });
}
