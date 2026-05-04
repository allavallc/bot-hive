import { db } from "@/db";
import { projects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { installationOctokit } from "@/lib/github";
import { ensureHiveFolder, initialSync } from "@/lib/sync";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const installationIdParam = req.nextUrl.searchParams.get("installation_id");
  const installationId = Number(installationIdParam);
  if (!installationId || Number.isNaN(installationId)) {
    return NextResponse.json({ error: "installation_id missing or invalid" }, { status: 400 });
  }

  const oct = await installationOctokit(installationId);
  const reposResp = await oct.request("GET /installation/repositories", {
    per_page: 100,
  });
  const repos = reposResp.data.repositories;

  for (const repoData of repos) {
    const [owner, name] = repoData.full_name.split("/");
    if (!owner || !name) continue;

    try {
      await ensureHiveFolder(installationId, owner, name);
    } catch (err) {
      console.error(`[install/callback] ensureHiveFolder failed for ${repoData.full_name}`, err);
      continue;
    }

    const existing = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.githubRepo, repoData.full_name), eq(projects.installId, installationId)),
      )
      .limit(1);

    let projectId: string;
    if (existing.length > 0) {
      projectId = existing[0].id;
    } else {
      const [inserted] = await db
        .insert(projects)
        .values({
          billingOwnerId: session.user.id,
          githubRepo: repoData.full_name,
          installId: installationId,
          displayName: repoData.name,
          status: "connecting",
        })
        .returning();
      projectId = inserted.id;
    }

    try {
      await initialSync(projectId);
    } catch (err) {
      console.error(`[install/callback] initialSync failed for ${projectId}`, err);
      await db.update(projects).set({ status: "failed" }).where(eq(projects.id, projectId));
    }
  }

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
