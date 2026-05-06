import { auth } from "@/lib/auth";
import { createToken, listActiveTokens } from "@/lib/bot-tokens";
import { getProjectForUser } from "@/lib/projects";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_DISPLAY_NAME = 64;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const tokens = await listActiveTokens(projectId);
  return NextResponse.json({ tokens });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { displayName } = body as Record<string, unknown>;
  if (
    typeof displayName !== "string" ||
    displayName.trim().length === 0 ||
    displayName.length > MAX_DISPLAY_NAME
  ) {
    return NextResponse.json(
      { error: `displayName required, 1-${MAX_DISPLAY_NAME} chars` },
      { status: 400 },
    );
  }

  const { id, raw } = await createToken({
    projectId,
    createdBy: session.user.id,
    displayName: displayName.trim(),
  });

  return NextResponse.json(
    {
      id,
      raw,
      displayName: displayName.trim(),
      createdAt: new Date().toISOString(),
    },
    { status: 201 },
  );
}
