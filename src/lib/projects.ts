import { type DbHandle, db as defaultDb } from "@/db";
import { projects } from "@/db/schema";
import { listUserRepos, userHasRepoAccess } from "@/lib/access";
import { desc, eq, inArray } from "drizzle-orm";

export type ProjectRow = typeof projects.$inferSelect;

export async function getProjectsForUser(
  userId: string,
  db: DbHandle = defaultDb,
): Promise<ProjectRow[]> {
  const userRepos = await listUserRepos(userId);
  if (userRepos.length === 0) return [];
  return db
    .select()
    .from(projects)
    .where(inArray(projects.githubRepo, userRepos))
    .orderBy(desc(projects.createdAt));
}

export async function getProjectForUser(
  userId: string,
  projectId: string,
  db: DbHandle = defaultDb,
): Promise<ProjectRow | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const hasAccess = await userHasRepoAccess(userId, project.githubRepo);
  if (!hasAccess) return null;
  return project;
}
