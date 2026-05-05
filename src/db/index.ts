import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

const client = postgres(url, { max: 10 });

export const db = drizzle(client, { schema });
export * from "./schema";

/**
 * A Drizzle handle that accepts either the global `db` connection or an
 * in-flight transaction (`tx`). Production functions that read or write the
 * DB should accept this type as an optional parameter so tests can swap in a
 * transactional handle for per-test isolation. See `src/lib/test-db.ts`.
 */
export type DbHandle =
  | typeof db
  | PgTransaction<
      PostgresJsQueryResultHKT,
      typeof schema,
      ExtractTablesWithRelations<typeof schema>
    >;
