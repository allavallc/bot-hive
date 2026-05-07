import { db } from "@/db";
import { activeClaims, projects, tickets, webhookDeliveries } from "@/db/schema";
import { broadcast } from "@/lib/broadcast";
import { getApp } from "@/lib/github";
import { initialSync } from "@/lib/sync";
import { and, eq, inArray, lte, ne, or } from "drizzle-orm";

export async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  return getApp().webhooks.verify(rawBody, signature);
}

const projectLocks = new Map<string, Promise<unknown>>();

async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const previous = projectLocks.get(projectId) ?? Promise.resolve();
  const tracked: Promise<T> = previous.catch(() => undefined).then(() => fn());
  const cleanup = tracked.finally(() => {
    if (projectLocks.get(projectId) === cleanup) {
      projectLocks.delete(projectId);
    }
  });
  projectLocks.set(projectId, cleanup);
  return tracked;
}

type PushPayload = {
  installation?: { id: number };
  repository: { full_name: string };
};

export async function handlePushEvent(payload: PushPayload, deliveryId: string): Promise<void> {
  const installationId = payload.installation?.id;
  if (!installationId) return;
  const repoFullName = payload.repository.full_name;

  const matching = await db
    .select()
    .from(projects)
    .where(and(eq(projects.installId, installationId), eq(projects.githubRepo, repoFullName)));

  for (const project of matching) {
    try {
      await withProjectLock(project.id, async () => {
        const existing = await db
          .select()
          .from(webhookDeliveries)
          .where(
            and(
              eq(webhookDeliveries.projectId, project.id),
              eq(webhookDeliveries.deliveryId, deliveryId),
            ),
          )
          .limit(1);
        if (existing.length > 0) return;

        await initialSync(project.id);

        // HV-090: clear any soft-fence claims that have been canonicalized
        // by Git. A claim is canonicalized when the ticket file moves out
        // of `hive/backlog/` (state != "backlog"). Also opportunistically
        // sweep expired claims so the table stays small.
        const movedTickets = await db
          .select({ hvId: tickets.hvId })
          .from(tickets)
          .where(and(eq(tickets.projectId, project.id), ne(tickets.state, "backlog")));
        const movedIds = movedTickets.map((t) => t.hvId);
        if (movedIds.length > 0) {
          await db
            .delete(activeClaims)
            .where(
              and(
                eq(activeClaims.projectId, project.id),
                or(inArray(activeClaims.hvId, movedIds), lte(activeClaims.expiresAt, new Date())),
              ),
            );
        } else {
          await db
            .delete(activeClaims)
            .where(
              and(eq(activeClaims.projectId, project.id), lte(activeClaims.expiresAt, new Date())),
            );
        }

        broadcast({ type: "project-changed", projectId: project.id });
        await db.insert(webhookDeliveries).values({
          projectId: project.id,
          deliveryId,
        });
      });
    } catch (err) {
      console.error(
        `[webhook] sync failed for project ${project.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
