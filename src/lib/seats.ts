// FS-028 / HV-130 / HV-131: bot seat allocation, lifecycle, and reclaim.
//
// All write paths run inside a transaction and acquire an advisory lock
// keyed on (project_id, colony) so concurrent calls in the same colony
// serialize at the lock — not at the partial unique index (which would
// surface as a constraint violation we'd have to retry).
//
// Helpers take `DbHandle` so the transactional rollback fixture in
// `src/lib/test-db.ts` can pass `tx` for per-test isolation.
//
// HV-131 adds: markOffline, renumberAfter, sweepStale, seatMap. The
// sweep is called from /join, /whoami, /leave, /colony so the seat
// sheet self-heals without an external cron job.

import { type DbHandle, db as defaultDb } from "@/db";
import { bots } from "@/db/schema";
import type { SeatMapEntry } from "@/lib/broadcast";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { type RoleAssignment, roleForSeat } from "./roles";

export type SeatState = {
  seat: number;
  total: number;
  role: string;
  skillFiles: string[];
};

// Default reclaim threshold for sweepStale. 15 minutes matches the spec.
const STALE_THRESHOLD_MS = 15 * 60 * 1000;

async function acquireColonyLock(db: DbHandle, projectId: string, colony: string): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${projectId} || ':' || ${colony}))`);
}

async function countActive(db: DbHandle, projectId: string, colony: string): Promise<number> {
  const rows = await db
    .select({ seat: bots.seat })
    .from(bots)
    .where(and(eq(bots.projectId, projectId), eq(bots.colony, colony), eq(bots.status, "active")));
  return rows.length;
}

async function lowestFreeSeat(db: DbHandle, projectId: string, colony: string): Promise<number> {
  const rows = await db
    .select({ seat: bots.seat })
    .from(bots)
    .where(and(eq(bots.projectId, projectId), eq(bots.colony, colony), eq(bots.status, "active")));
  const taken = new Set(rows.map((r) => r.seat));
  for (let n = 1; n <= rows.length + 1; n++) {
    if (!taken.has(n)) return n;
  }
  // Unreachable: rows.length + 1 is always free if 1..N are all taken.
  throw new Error("lowestFreeSeat: invariant violated");
}

/**
 * Allocate a seat for the bot. Idempotent: returns the existing seat
 * if the bot is already active. Reactivates an offline row by setting
 * status='active' and assigning the lowest free seat.
 *
 * MUST be called inside a transaction. Acquires the per-colony advisory
 * lock at the top so concurrent callers serialize.
 */
export async function allocateSeat(
  db: DbHandle,
  projectId: string,
  colony: string,
  handle: string,
): Promise<SeatState> {
  await acquireColonyLock(db, projectId, colony);

  const existing = await db
    .select()
    .from(bots)
    .where(and(eq(bots.projectId, projectId), eq(bots.colony, colony), eq(bots.handle, handle)))
    .limit(1);

  if (existing.length > 0 && existing[0].status === "active") {
    const total = await countActive(db, projectId, colony);
    return seatState(existing[0].seat, total);
  }

  const seat = await lowestFreeSeat(db, projectId, colony);

  if (existing.length > 0) {
    // Reactivate offline row.
    await db
      .update(bots)
      .set({ seat, status: "active", lastHeartbeatAt: new Date() })
      .where(eq(bots.id, existing[0].id));
  } else {
    await db.insert(bots).values({ projectId, colony, handle, seat });
  }

  const total = await countActive(db, projectId, colony);
  return seatState(seat, total);
}

/**
 * Return the current seat state for a bot, or null if it's not active.
 * Read-only — does not need a transaction or lock.
 */
export async function getSeatState(
  projectId: string,
  colony: string,
  handle: string,
  db: DbHandle = defaultDb,
): Promise<SeatState | null> {
  const rows = await db
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
  if (rows.length === 0) return null;
  const total = await countActive(db, projectId, colony);
  return seatState(rows[0].seat, total);
}

/**
 * Bump `last_heartbeat_at` for an active bot. No-op for offline rows
 * (do not silently reactivate from a stale background process). Safe
 * to call without a surrounding transaction.
 */
export async function bumpHeartbeat(
  db: DbHandle,
  projectId: string,
  colony: string,
  handle: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(bots)
    .set({ lastHeartbeatAt: now })
    .where(
      and(
        eq(bots.projectId, projectId),
        eq(bots.colony, colony),
        eq(bots.handle, handle),
        eq(bots.status, "active"),
      ),
    );
}

/**
 * Mark a bot offline and return its departing seat. Caller is responsible
 * for the surrounding transaction and renumber. Returns null if the bot
 * has no active row.
 *
 * MUST be called inside a transaction with the (project, colony) advisory
 * lock already held.
 */
export async function markOffline(
  db: DbHandle,
  projectId: string,
  colony: string,
  handle: string,
): Promise<number | null> {
  const [row] = await db
    .select({ id: bots.id, seat: bots.seat })
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
  await db.update(bots).set({ status: "offline" }).where(eq(bots.id, row.id));
  return row.seat;
}

/**
 * Decrement seat by 1 for every active row in this (project, colony)
 * whose seat is greater than the departing seat. Keeps seats contiguous.
 *
 * MUST be called inside a transaction with the (project, colony) advisory
 * lock already held (so `markOffline` happens atomically with the renumber).
 */
export async function renumberAfter(
  db: DbHandle,
  projectId: string,
  colony: string,
  departingSeat: number,
): Promise<void> {
  await db
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
}

/**
 * Return the post-condition seat map for a colony — every active bot
 * in seat-ascending order with its derived role. Used to populate
 * broadcast events so subscribers don't have to refetch.
 */
export async function seatMap(
  db: DbHandle,
  projectId: string,
  colony: string,
): Promise<SeatMapEntry[]> {
  const rows = await db
    .select({ handle: bots.handle, seat: bots.seat })
    .from(bots)
    .where(and(eq(bots.projectId, projectId), eq(bots.colony, colony), eq(bots.status, "active")))
    .orderBy(asc(bots.seat));
  const total = rows.length;
  return rows.map((r) => ({
    handle: r.handle,
    seat: r.seat,
    role: roleForSeat(total, r.seat).role,
  }));
}

/**
 * Reclaim rows with stale heartbeats in a single (project, colony).
 * For each stale row, mark it offline and renumber survivors. Returns
 * an array of departure records so the caller can broadcast each one
 * after committing the transaction.
 *
 * MUST be called inside a transaction; acquires the advisory lock.
 */
export async function sweepStale(
  db: DbHandle,
  projectId: string,
  colony: string,
  thresholdMs: number = STALE_THRESHOLD_MS,
): Promise<Array<{ handle: string; seat: number }>> {
  await acquireColonyLock(db, projectId, colony);
  const cutoff = new Date(Date.now() - thresholdMs);

  const stale = await db
    .select({ id: bots.id, handle: bots.handle, seat: bots.seat })
    .from(bots)
    .where(
      and(
        eq(bots.projectId, projectId),
        eq(bots.colony, colony),
        eq(bots.status, "active"),
        lt(bots.lastHeartbeatAt, cutoff),
      ),
    )
    .orderBy(asc(bots.seat));

  if (stale.length === 0) return [];

  const departed: Array<{ handle: string; seat: number }> = [];
  // Mark all stale rows offline first.
  for (const row of stale) {
    await db.update(bots).set({ status: "offline" }).where(eq(bots.id, row.id));
    departed.push({ handle: row.handle, seat: row.seat });
  }
  // Renumber in descending order of departing seat so each renumber
  // doesn't move a row we're about to process.
  const departingSeatsDesc = [...departed].sort((a, b) => b.seat - a.seat);
  for (const d of departingSeatsDesc) {
    await renumberAfter(db, projectId, colony, d.seat);
  }
  return departed;
}

/**
 * List all (project, colony) pairs that currently have at least one
 * active row in this project. Used by /colony to know which colonies
 * to sweep before returning the project-wide map.
 */
export async function listActiveColonies(db: DbHandle, projectId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ colony: bots.colony })
    .from(bots)
    .where(and(eq(bots.projectId, projectId), eq(bots.status, "active")));
  return rows.map((r) => r.colony).sort();
}

function seatState(seat: number, total: number): SeatState {
  const role: RoleAssignment = roleForSeat(total, seat);
  return {
    seat,
    total,
    role: role.role,
    skillFiles: role.skillFiles,
  };
}
