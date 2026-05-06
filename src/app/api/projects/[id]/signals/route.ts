import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { broadcast } from "@/lib/broadcast";
import { getProjectForUser } from "@/lib/projects";
import { type Signal, addSignal, isSignalType } from "@/lib/signal-buffer";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const MAX_MESSAGE_LENGTH = 500;
const MAX_REFS = 10;

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { type, message, bot, refs } = body as Record<string, unknown>;

  if (!isSignalType(type)) {
    return NextResponse.json({ error: "invalid signal type" }, { status: 400 });
  }
  if (typeof message !== "string" || message.length === 0) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `message exceeds ${MAX_MESSAGE_LENGTH} chars` },
      { status: 400 },
    );
  }
  if (bot !== undefined && (typeof bot !== "string" || bot.length === 0 || bot.length > 32)) {
    return NextResponse.json({ error: "invalid bot handle" }, { status: 400 });
  }
  if (refs !== undefined) {
    if (!Array.isArray(refs) || refs.length > MAX_REFS) {
      return NextResponse.json(
        { error: "refs must be an array of <= 10 strings" },
        { status: 400 },
      );
    }
    for (const r of refs) {
      if (typeof r !== "string" || r.length === 0 || r.length > 50) {
        return NextResponse.json(
          { error: "refs entries must be 1-50 char strings" },
          { status: 400 },
        );
      }
    }
  }

  const signal: Signal = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    message,
    bot: typeof bot === "string" ? bot : undefined,
    user: session.user.name ?? session.user.id,
    refs: Array.isArray(refs) ? (refs as string[]) : undefined,
  };

  addSignal(projectId, signal);
  broadcast({ type: "signal", projectId, signal });

  return NextResponse.json(signal, { status: 201 });
}
