import type { DbHandle } from "@/db";
import { botEvents, humanNotes } from "@/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";

export type ProjectEventKind = "lifecycle" | "note-to-bots" | "note-to-humans" | "bot-event";

export type ProjectEventEntry = {
  kind: ProjectEventKind;
  ts: string;
  actor: string;
  raw: string;
  meta?: Record<string, unknown>;
};

export async function appendDbProjectEvents(
  db: DbHandle,
  projectId: string,
  cutoffDate: Date,
  limit: number,
  sink: ProjectEventEntry[],
): Promise<void> {
  const [noteRows, botEventRows] = await Promise.all([
    db
      .select()
      .from(humanNotes)
      .where(and(eq(humanNotes.projectId, projectId), gt(humanNotes.createdAt, cutoffDate)))
      .orderBy(desc(humanNotes.createdAt))
      .limit(limit),
    db
      .select()
      .from(botEvents)
      .where(and(eq(botEvents.projectId, projectId), gt(botEvents.createdAt, cutoffDate)))
      .orderBy(desc(botEvents.createdAt))
      .limit(limit),
  ]);

  for (const n of noteRows) {
    sink.push({
      kind: "note-to-bots",
      ts: n.createdAt.toISOString(),
      actor: n.actor,
      raw: n.message,
    });
  }

  for (const e of botEventRows) {
    sink.push({
      kind: "bot-event",
      ts: e.createdAt.toISOString(),
      actor: `${e.colony}.${e.handle}`,
      raw: e.message,
      meta: {
        id: e.id,
        colony: e.colony,
        handle: e.handle,
        eventKind: e.kind,
        targetHandle: e.targetHandle,
        targetRole: e.targetRole,
        data: e.data,
      },
    });
  }
}
