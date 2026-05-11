// FS-025 / ADR-004: GET / PATCH the per-colony always_ask flag.
// Admin-only v1.

import { db } from "@/db";
import { colonySettings } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/projects";
import { and, eq } from "drizzle-orm";
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
    .from(colonySettings)
    .where(eq(colonySettings.projectId, projectId));

  return NextResponse.json({ settings: rows });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.name !== "allavallc") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { colony?: unknown; alwaysAsk?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const colony = typeof body.colony === "string" ? body.colony.trim() : "";
  const alwaysAsk = body.alwaysAsk === true || body.alwaysAsk === false ? body.alwaysAsk : null;

  if (!colony || alwaysAsk === null) {
    return NextResponse.json(
      { error: "colony (string) and alwaysAsk (boolean) are required" },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(colonySettings)
    .values({ projectId, colony, alwaysAsk })
    .onConflictDoUpdate({
      target: [colonySettings.projectId, colonySettings.colony],
      set: { alwaysAsk, updatedAt: new Date() },
    })
    .returning();

  return NextResponse.json({ setting: row });
}
