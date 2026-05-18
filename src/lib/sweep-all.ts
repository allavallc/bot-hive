// Server-side stale-bot sweeper. Called every 60 seconds from instrumentation.ts.
//
// A bot is stale when its SSE keepalive stopped without a graceful disconnect —
// closed terminal, killed agent, broken connection. The threshold is 2 minutes
// (2 missed 30-second keepalives). Stale rows are marked offline, survivors are
// renumbered and get a role push if their role changed.

import { db } from "@/db";
import { bots } from "@/db/schema";
import { appendBotLog } from "@/lib/bot-log";
import { publishPeerPush } from "@/lib/bot-notify";
import type { PeerPush } from "@/lib/bot-stream";
import { broadcast } from "@/lib/broadcast";
import { roleForSeat } from "@/lib/roles";
import { and, asc, eq, lt, sql } from "drizzle-orm";

const STALE_THRESHOLD_MS = 2 * 60 * 1000;

export async function sweepAllStale(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  const stale = await db
    .select({
      id: bots.id,
      projectId: bots.projectId,
      colony: bots.colony,
      handle: bots.handle,
      seat: bots.seat,
      role: bots.role,
      connectionId: bots.connectionId,
    })
    .from(bots)
    .where(and(eq(bots.status, "active"), lt(bots.lastHeartbeatAt, cutoff)))
    .orderBy(asc(bots.seat));

  if (stale.length === 0) return;

  type StaleRow = (typeof stale)[0];
  const groups = new Map<string, StaleRow[]>();
  for (const row of stale) {
    const key = `${row.projectId}:${row.colony}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(row);
  }

  for (const staleRows of groups.values()) {
    const { projectId, colony } = staleRows[0];
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${projectId} || ':' || ${colony}))`,
        );

        // Re-verify each row is still stale (connectionId unchanged means no reconnect).
        // If connectionId changed, the bot reconnected during the sweep window — skip it.
        const confirmed: StaleRow[] = [];
        for (const row of staleRows) {
          const [cur] = await tx
            .select({ status: bots.status, connectionId: bots.connectionId })
            .from(bots)
            .where(eq(bots.id, row.id))
            .limit(1);
          if (cur?.status === "active" && cur.connectionId === row.connectionId) {
            confirmed.push(row);
          }
        }
        if (confirmed.length === 0) return null;

        // Snapshot pre-departure roles for surviving peers.
        const allActive = await tx
          .select({
            id: bots.id,
            handle: bots.handle,
            seat: bots.seat,
            role: bots.role,
            connectionId: bots.connectionId,
          })
          .from(bots)
          .where(
            and(eq(bots.projectId, projectId), eq(bots.colony, colony), eq(bots.status, "active")),
          )
          .orderBy(asc(bots.seat));

        const staleIds = new Set(confirmed.map((r) => r.id));
        const prevRoleByHandle = new Map(
          allActive.filter((r) => !staleIds.has(r.id)).map((r) => [r.handle, r.role ?? ""]),
        );

        const departed: Array<{ handle: string; seat: number; role: string; sessionId: string }> =
          [];
        for (const row of confirmed) {
          await tx
            .update(bots)
            .set({ status: "offline", connectionId: null })
            .where(eq(bots.id, row.id));
          departed.push({
            handle: row.handle,
            seat: row.seat,
            role: row.role ?? "",
            sessionId: (row.connectionId ?? "").slice(0, 8),
          });
        }

        // Renumber survivors. Process departing seats in descending order so
        // each decrement doesn't affect seats we haven't processed yet.
        const seatsDesc = [...departed].sort((a, b) => b.seat - a.seat);
        for (const d of seatsDesc) {
          await tx
            .update(bots)
            .set({ seat: sql`${bots.seat} - 1` })
            .where(
              and(
                eq(bots.projectId, projectId),
                eq(bots.colony, colony),
                eq(bots.status, "active"),
                sql`${bots.seat} > ${d.seat}`,
              ),
            );
        }

        const survivors = await tx
          .select({
            id: bots.id,
            handle: bots.handle,
            seat: bots.seat,
            role: bots.role,
            connectionId: bots.connectionId,
          })
          .from(bots)
          .where(
            and(eq(bots.projectId, projectId), eq(bots.colony, colony), eq(bots.status, "active")),
          )
          .orderBy(asc(bots.seat));

        const total = survivors.length;
        const peerPushes: PeerPush[] = [];

        for (const r of survivors) {
          const derived = roleForSeat(total, r.seat);
          const prev = prevRoleByHandle.get(r.handle) ?? "";
          if (derived.role !== prev) {
            await tx.update(bots).set({ role: derived.role }).where(eq(bots.id, r.id));
            if (r.connectionId) {
              peerPushes.push({
                connectionId: r.connectionId,
                handle: r.handle,
                role: derived.role,
                seat: r.seat,
                skillFiles: derived.skillFiles,
                departed: departed[0]?.handle,
              });
            }
          }
        }

        const snapshot = survivors.map((r) => ({
          handle: r.handle,
          seat: r.seat,
          role: roleForSeat(total, r.seat).role,
        }));

        return { departed, peerPushes, snapshot };
      });

      if (!result) continue;

      for (const p of result.peerPushes) {
        await publishPeerPush(p, result.snapshot.length, colony);
      }

      for (const d of result.departed) {
        appendBotLog(colony, "events", d.handle, d.role, d.sessionId, "reaped (stale heartbeat)");
        broadcast({
          type: "bot-left",
          projectId,
          colony,
          departed: { handle: d.handle, seat: d.seat },
          seatMap: result.snapshot,
        });
        console.log(`[sweep] reaped stale bot: ${colony}/${d.handle} seat=${d.seat}`);
      }
    } catch (err) {
      console.warn(`[sweep] error sweeping ${colony}:`, err);
    }
  }
}
