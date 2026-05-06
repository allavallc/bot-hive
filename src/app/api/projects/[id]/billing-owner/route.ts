import { db } from "@/db";
import { account, projects, user } from "@/db/schema";
import { listRepoCollaborators, userHasRepoAccess } from "@/lib/access";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * POST /api/projects/[id]/billing-owner
 *
 * Body: `{ userId: string }` — the new billing owner.
 *
 * Validates: requester has GitHub access to the project's repo; target
 * user exists; target user also has GitHub access to the same repo.
 * Then transactionally updates `projects.billingOwnerId`.
 *
 * The `billing_owner_id` column is NOT NULL — every project always has
 * a billing owner. Releasing without a target isn't allowed; you must
 * always name a successor when transferring.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { userId: targetUserId } = body as Record<string, unknown>;
  if (typeof targetUserId !== "string" || targetUserId.length === 0) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // Look up project.
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Requester must have GitHub access to the repo.
  const requesterHasAccess = await userHasRepoAccess(session.user.id, project.githubRepo);
  if (!requesterHasAccess) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Target user must exist.
  const [targetUser] = await db.select().from(user).where(eq(user.id, targetUserId)).limit(1);
  if (!targetUser) {
    return NextResponse.json({ error: "target user not found" }, { status: 404 });
  }

  // Target user must also have GitHub access to the repo. Their OAuth
  // login on Bot Hive proves they have a token; we check whether their
  // GitHub account is on the repo's collaborator list (per the App's
  // installation token, which is the canonical view).
  const collaborators = await listRepoCollaborators(project.githubRepo, project.installId);
  const [targetAccount] = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eq(account.userId, targetUserId))
    .limit(1);
  if (!targetAccount?.accountId) {
    return NextResponse.json(
      { error: "target user has no linked GitHub account" },
      { status: 400 },
    );
  }
  const targetGithubId = Number.parseInt(targetAccount.accountId, 10);
  const targetIsCollaborator = collaborators.some((c) => c.id === targetGithubId);
  if (!targetIsCollaborator) {
    return NextResponse.json(
      { error: "target user is not a collaborator on this repo" },
      { status: 400 },
    );
  }

  // Transactional update.
  const previousOwnerId = project.billingOwnerId;
  await db.update(projects).set({ billingOwnerId: targetUserId }).where(eq(projects.id, projectId));

  // Audit log (console for v1; HV-something later for a real audit log).
  console.log(
    `[billing-owner] project=${projectId} from=${previousOwnerId} to=${targetUserId} requester=${session.user.id} at=${new Date().toISOString()}`,
  );

  return NextResponse.json({ ok: true, billingOwnerId: targetUserId });
}
