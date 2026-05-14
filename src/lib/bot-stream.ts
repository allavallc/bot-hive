// HV-136: SSE-as-liveness for bot seats.
//
// The open SSE connection IS the liveness signal — no heartbeat, no
// 15-min sweep. On open we insert/rebind the bot's row and re-derive
// roles for the colony; on (graceful) close we mark the row offline,
// renumber survivors, and push the new role down each affected peer's
// open stream. Single-instance Render Free assumed; multi-replica
// fan-out is a follow-up.

import { type DbHandle, db as defaultDb } from "@/db";
import { bots } from "@/db/schema";
import type { SeatMapEntry } from "@/lib/broadcast";
import { roleForSeat } from "@/lib/roles";
import { and, asc, eq, sql } from "drizzle-orm";

export type PeerPush = {
  connectionId: string;
  handle: string;
  role: string;
  seat: number;
  skillFiles: string[];
  departed?: string;
};

export type ConnectResult = {
  seat: number;
  selfRole: string;
  selfSkillFiles: string[];
  peerPushes: PeerPush[];
  snapshot: SeatMapEntry[];
};

export type DisconnectResult = {
  departed: { handle: string; seat: number };
  peerPushes: PeerPush[];
  snapshot: SeatMapEntry[];
} | null;

async function acquireColonyLock(db: DbHandle, projectId: string, colony: string): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${projectId} || ':' || ${colony}))`);
}

async function activeRows(db: DbHandle, projectId: string, colony: string) {
  return db
    .select({
      id: bots.id,
      handle: bots.handle,
      seat: bots.seat,
      role: bots.role,
      connectionId: bots.connectionId,
    })
    .from(bots)
    .where(and(eq(bots.projectId, projectId), eq(bots.colony, colony), eq(bots.status, "active")))
    .orderBy(asc(bots.seat));
}

async function lowestFreeSeat(
  db: DbHandle,
  projectId: string,
  colony: string,
  excludeId?: string,
): Promise<number> {
  const rows = await activeRows(db, projectId, colony);
  const taken = new Set(rows.filter((r) => r.id !== excludeId).map((r) => r.seat));
  for (let n = 1; n <= rows.length + 2; n++) {
    if (!taken.has(n)) return n;
  }
  throw new Error("lowestFreeSeat: invariant violated");
}

/**
 * Open a stream: insert (or rebind) the bot's row with this connectionId,
 * re-derive every bot's role from the resulting (count, seat) pair, write
 * any role changes back to DB, and return:
 *   - selfRole: the role this bot should announce (always).
 *   - peerPushes: bots whose role actually changed (caller pushes
 *     `your-role` to each via their open stream).
 *   - snapshot: post-state seat map for the project-wide broadcast.
 */
export async function connectBot(
  projectId: string,
  colony: string,
  handle: string,
  connectionId: string,
  db: DbHandle = defaultDb,
): Promise<ConnectResult> {
  return db.transaction(async (tx) => {
    await acquireColonyLock(tx, projectId, colony);

    // Read current rows + capture each handle's stored role pre-write.
    const before = await activeRows(tx, projectId, colony);
    const prevRoleByHandle = new Map(before.map((r) => [r.handle, r.role ?? ""]));

    // Find or create this bot's row.
    const [existing] = await tx
      .select()
      .from(bots)
      .where(and(eq(bots.projectId, projectId), eq(bots.colony, colony), eq(bots.handle, handle)))
      .limit(1);

    let myId: string;
    let mySeat: number;
    if (existing && existing.status === "active") {
      // Rebind: same handle reopens (e.g. reconnect within grace).
      myId = existing.id;
      mySeat = existing.seat;
      await tx
        .update(bots)
        .set({ connectionId, lastHeartbeatAt: new Date() })
        .where(eq(bots.id, myId));
    } else if (existing) {
      // Reactivate an offline row at the lowest free seat.
      myId = existing.id;
      mySeat = await lowestFreeSeat(tx, projectId, colony, existing.id);
      await tx
        .update(bots)
        .set({
          seat: mySeat,
          status: "active",
          connectionId,
          lastHeartbeatAt: new Date(),
        })
        .where(eq(bots.id, myId));
      prevRoleByHandle.set(handle, existing.role ?? "");
    } else {
      mySeat = await lowestFreeSeat(tx, projectId, colony);
      const [inserted] = await tx
        .insert(bots)
        .values({ projectId, colony, handle, seat: mySeat, connectionId })
        .returning({ id: bots.id });
      myId = inserted.id;
      prevRoleByHandle.set(handle, "");
    }

    // Re-read post-write so we have the correct (handle, seat, connectionId) for every active row.
    const after = await activeRows(tx, projectId, colony);
    const total = after.length;

    let selfRole = "";
    let selfSkillFiles: string[] = [];
    const peerPushes: PeerPush[] = [];

    for (const row of after) {
      const derived = roleForSeat(total, row.seat);
      const prev = prevRoleByHandle.get(row.handle) ?? "";
      const changed = derived.role !== prev;
      if (changed) {
        await tx.update(bots).set({ role: derived.role }).where(eq(bots.id, row.id));
      }
      if (row.handle === handle) {
        selfRole = derived.role;
        selfSkillFiles = derived.skillFiles;
      } else if (changed && row.connectionId) {
        peerPushes.push({
          connectionId: row.connectionId,
          handle: row.handle,
          role: derived.role,
          seat: row.seat,
          skillFiles: derived.skillFiles,
        });
      }
    }

    const snapshot: SeatMapEntry[] = after.map((r) => ({
      handle: r.handle,
      seat: r.seat,
      role: roleForSeat(total, r.seat).role,
    }));

    return { seat: mySeat, selfRole, selfSkillFiles, peerPushes, snapshot };
  });
}

/**
 * Close a stream: if the bot's row still belongs to this connectionId
 * (i.e. no rebind happened during the grace period), mark offline,
 * renumber survivors, re-derive roles, and return:
 *   - departed: who left, with their old seat.
 *   - peerPushes: survivors whose role actually changed.
 *   - snapshot: post-state seat map for the project-wide broadcast.
 *
 * Returns null if the row no longer exists OR was rebound to a different
 * connectionId (treat as no-op — the new owner takes over).
 */
export async function disconnectBot(
  projectId: string,
  colony: string,
  handle: string,
  connectionId: string,
  db: DbHandle = defaultDb,
): Promise<DisconnectResult> {
  return db.transaction(async (tx) => {
    await acquireColonyLock(tx, projectId, colony);

    const [row] = await tx
      .select()
      .from(bots)
      .where(
        and(
          eq(bots.projectId, projectId),
          eq(bots.colony, colony),
          eq(bots.handle, handle),
          eq(bots.status, "active"),
        ),
      )
      .limit(1);
    if (!row) return null;
    if (row.connectionId && row.connectionId !== connectionId) {
      // Rebound to a new stream during grace. No-op.
      return null;
    }

    // Capture pre-state roles for every active peer (excluding the leaver).
    const before = await activeRows(tx, projectId, colony);
    const prevRoleByHandle = new Map(
      before.filter((r) => r.handle !== handle).map((r) => [r.handle, r.role ?? ""]),
    );

    // Mark offline + clear connectionId.
    const departingSeat = row.seat;
    await tx.update(bots).set({ status: "offline", connectionId: null }).where(eq(bots.id, row.id));

    // Renumber: every active row with seat > departingSeat decrements by 1.
    await tx
      .update(bots)
      .set({ seat: sql`${bots.seat} - 1` })
      .where(
        and(
          eq(bots.projectId, projectId),
          eq(bots.colony, colony),
          eq(bots.status, "active"),
          sql`${bots.seat} > ${departingSeat}`,
        ),
      );

    // Re-derive roles for survivors.
    const after = await activeRows(tx, projectId, colony);
    const total = after.length;
    const peerPushes: PeerPush[] = [];
    for (const r of after) {
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
            departed: handle,
          });
        }
      }
    }

    const snapshot: SeatMapEntry[] = after.map((r) => ({
      handle: r.handle,
      seat: r.seat,
      role: roleForSeat(total, r.seat).role,
    }));

    return {
      departed: { handle, seat: departingSeat },
      peerPushes,
      snapshot,
    };
  });
}
