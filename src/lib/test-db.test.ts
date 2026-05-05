import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { user } from "@/db/schema";
import { test } from "@/lib/test-db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";

// Meta-test: prove the transactional fixture actually rolls back.
//
// Each test inserts a user via tx, then a separate query against the global
// `db` (different connection / transaction) verifies the row is invisible.
// If rollback weren't working, the global db would see the uncommitted user
// or — worse — would see it leak after the test.

describe("test-db rollback fixture", () => {
  test("inserted rows are visible inside the test's transaction", async ({ tx }) => {
    const id = `vitest-meta-${randomUUID()}`;
    await tx.insert(user).values({
      id,
      name: "vitest-meta",
      email: `${id}@example.invalid`,
    });

    const inside = await tx.select().from(user).where(eq(user.id, id));
    expect(inside).toHaveLength(1);
  });

  test("inserted rows are invisible to the outer connection (uncommitted)", async ({ tx }) => {
    const id = `vitest-meta-${randomUUID()}`;
    await tx.insert(user).values({
      id,
      name: "vitest-meta",
      email: `${id}@example.invalid`,
    });

    // The global `db` uses a different connection and is not in our tx,
    // so it does NOT see the uncommitted row.
    const outside = await db.select().from(user).where(eq(user.id, id));
    expect(outside).toHaveLength(0);
  });
});
