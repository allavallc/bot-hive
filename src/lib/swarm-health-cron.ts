// FS-022: cron orchestration — for each project, fetch state, evaluate
// invariants, upsert anomalies, mark resolved when violations vanish.
//
// Triggered by an external scheduler (POST /api/health/cron). Designed
// to be idempotent so safe to run more often than once per cycle.

import { db } from "@/db";
import { projects, swarmAnomalies } from "@/db/schema";
import { type AnomalyDetection, evaluate } from "@/lib/swarm-health";
import { fetchRepoState } from "@/lib/swarm-health-fetch";
import { and, eq, isNull, notInArray } from "drizzle-orm";

export type RunResult = {
  projectId: string;
  detected: number;
  newRows: number;
  resolved: number;
  errored?: string;
};

// Process one project end-to-end.
export async function evaluateProject(projectId: string): Promise<RunResult> {
  let anomalies: AnomalyDetection[];
  try {
    const state = await fetchRepoState(projectId);
    anomalies = evaluate(state);
  } catch (err) {
    return {
      projectId,
      detected: 0,
      newRows: 0,
      resolved: 0,
      errored: err instanceof Error ? err.message : String(err),
    };
  }

  const detectedKeys = new Set(anomalies.map((a) => a.dedupKey));
  let newRows = 0;
  const now = new Date();

  // Upsert each detected anomaly. Existing row -> bump lastSeenAt and
  // clear resolvedAt (in case the violation came back). New row -> insert
  // with firstSeenAt = now.
  for (const a of anomalies) {
    const result = await db
      .insert(swarmAnomalies)
      .values({
        projectId,
        code: a.code,
        severity: a.severity,
        message: a.message,
        details: a.details,
        dedupKey: a.dedupKey,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [swarmAnomalies.projectId, swarmAnomalies.dedupKey],
        set: {
          lastSeenAt: now,
          resolvedAt: null,
          // Refresh message + severity in case the rule wording changed.
          message: a.message,
          severity: a.severity,
          details: a.details,
        },
      })
      .returning({ firstSeenAt: swarmAnomalies.firstSeenAt });
    // If the just-returned firstSeenAt equals 'now' (within ~1ms), the row
    // was inserted, not updated. We don't need exact accounting; this is
    // observability only.
    if (result[0] && Math.abs(result[0].firstSeenAt.getTime() - now.getTime()) < 1000) {
      newRows += 1;
    }
  }

  // Mark resolved: any open row whose dedupKey is NOT in the detected set
  // this cycle is no longer a violation.
  let resolved = 0;
  if (detectedKeys.size === 0) {
    // No detections this cycle — every open row resolves.
    const res = await db
      .update(swarmAnomalies)
      .set({ resolvedAt: now })
      .where(and(eq(swarmAnomalies.projectId, projectId), isNull(swarmAnomalies.resolvedAt)))
      .returning({ id: swarmAnomalies.id });
    resolved = res.length;
  } else {
    const detectedArr = Array.from(detectedKeys);
    const res = await db
      .update(swarmAnomalies)
      .set({ resolvedAt: now })
      .where(
        and(
          eq(swarmAnomalies.projectId, projectId),
          isNull(swarmAnomalies.resolvedAt),
          notInArray(swarmAnomalies.dedupKey, detectedArr),
        ),
      )
      .returning({ id: swarmAnomalies.id });
    resolved = res.length;
  }

  return { projectId, detected: anomalies.length, newRows, resolved };
}

export async function runCron(): Promise<RunResult[]> {
  const allProjects = await db.select({ id: projects.id }).from(projects);
  const results: RunResult[] = [];
  for (const p of allProjects) {
    results.push(await evaluateProject(p.id));
  }
  return results;
}
