// FS-028 / HV-130: bot seat allocation + lookup.
//
// All write paths run inside a transaction and acquire an advisory lock
// keyed on (project_id, colony) so concurrent /join calls in the same
// colony serialize at the lock — not at the partial unique index
// (which would surface as a constraint violation we'd have to retry).
//
// Helpers take `DbHandle` so the transactional rollback fixture in
// `src/lib/test-db.ts` can pass `tx` for per-test isolation.

import { type DbHandle, db as defaultDb } from "@/db";
import { bots } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { type RoleAssignment, roleForSeat } from "./roles";

export type SeatState = {
  seat: number;
  total: number;
  role: string;
  skillFiles: string[];
};

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

function seatState(seat: number, total: number): SeatState {
  const role: RoleAssignment = roleForSeat(total, seat);
  return {
    seat,
    total,
    role: role.role,
    skillFiles: role.skillFiles,
  };
}
