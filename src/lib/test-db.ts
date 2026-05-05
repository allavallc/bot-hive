/**
 * Per-test transactional rollback fixture for DB-backed tests.
 *
 * Usage:
 *
 *   import { test } from "@/lib/test-db";
 *
 *   test("...", async ({ tx }) => {
 *     await tx.insert(user).values({...});
 *     // tx is a Drizzle transaction; the test sees uncommitted writes.
 *     // After the test ends, the transaction is rolled back — no data persists.
 *   });
 *
 * How it works: we open a Drizzle transaction, hand the tx to the test, then
 * throw a sentinel error to force rollback. The test's writes never commit.
 *
 * For functions that need to run *inside* the test's transaction (production
 * code paths), pass `tx` as the optional `db` parameter. Production functions
 * that touch the database should accept an optional `db: DbHandle` parameter
 * defaulting to the imported `db` so tests can swap in `tx`.
 */

import { type DbHandle, db } from "@/db";
import { test as base } from "vitest";

const ROLLBACK_SENTINEL = "__test_rollback__";

type Fixture = { tx: DbHandle };

export const test = base.extend<Fixture>({
  // biome-ignore lint/correctness/noEmptyPattern: vitest fixture signature
  tx: async ({}, use) => {
    let releaseTx: (tx: DbHandle) => void = () => {};
    let signalDone: () => void = () => {};
    const txReady = new Promise<DbHandle>((resolve) => {
      releaseTx = resolve;
    });
    const testDone = new Promise<void>((resolve) => {
      signalDone = resolve;
    });

    const txPromise = db
      .transaction(async (tx) => {
        releaseTx(tx);
        await testDone;
        throw new Error(ROLLBACK_SENTINEL);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === ROLLBACK_SENTINEL) return;
        throw err;
      });

    const tx = await txReady;
    await use(tx);
    signalDone();
    await txPromise;
  },
});
