import { auth } from "@/lib/auth";
import { revokeToken } from "@/lib/bot-tokens";
import { getProjectForUser } from "@/lib/projects";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; tokenId: string }> },
) {
  const { id: projectId, tokenId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await revokeToken(tokenId, projectId);
  if (!ok) return NextResponse.json({ error: "token not found" }, { status: 404 });

  return NextResponse.json({ revoked: true });
}
