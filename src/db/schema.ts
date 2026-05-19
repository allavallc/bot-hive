import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Better Auth tables — match the canonical Better Auth Postgres schema so
// HV-003 plugs in without a remap.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Hive app tables.

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billingOwnerId: text("billing_owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    githubRepo: text("github_repo").notNull(),
    installId: bigint("install_id", { mode: "number" }).notNull(),
    displayName: text("display_name").notNull(),
    lastSyncSha: text("last_sync_sha"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    status: text("status").notNull().default("connecting"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    installRepoUnique: unique("projects_install_repo_unique").on(t.installId, t.githubRepo),
    billingOwnerIdx: index("projects_billing_owner_idx").on(t.billingOwnerId),
  }),
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    hvId: text("hv_id").notNull(),
    state: text("state").notNull(),
    title: text("title").notNull(),
    frontmatter: jsonb("frontmatter").notNull(),
    body: text("body").notNull(),
    filePath: text("file_path").notNull(),
    fileSha: text("file_sha").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    projectHvUnique: unique("tickets_project_hv_unique").on(t.projectId, t.hvId),
    projectStateIdx: index("tickets_project_state_idx").on(t.projectId, t.state),
  }),
);

export const features = pgTable(
  "features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fsId: text("fs_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    fileSha: text("file_sha").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    projectFsUnique: unique("features_project_fs_unique").on(t.projectId, t.fsId),
  }),
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    deliveryId: text("delivery_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.deliveryId] }),
  }),
);

export const syncState = pgTable("sync_state", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  lastSha: text("last_sha"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
});

// HV-094: notes from humans to bots — DB-backed transient state, not Git.
//
// Notes are conversational direction, not canonical state. Storing them as
// Git commits creates PR queue noise + 2-3 min visibility lag. This table
// is the source of truth for human-to-bot notes; the read endpoint joins
// it into the panel's stream so notes appear within ~1s of a Send click.
//
// Bot→human notes still flow through Git (`hive/notes-to-humans/<bot>.log`)
// because bots have existing git auth but no API auth — asymmetry is
// intentional for v1.
export const humanNotes = pgTable(
  "human_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectCreatedIdx: index("human_notes_project_created_idx").on(t.projectId, t.createdAt),
  }),
);

// ADR-004: bot-to-PM ticket suggestions inbox.
//
// When a coder/tester bot writes a `@<colony>.<pm-handle> we need a ticket
// for X` note, the PM creates a row here. Default policy is `always_ask`
// (see `colonySettings`) — the suggestion appears in the swarm panel inbox
// for the human to Approve or Reject. Approve files a real ticket; Reject
// sends a reason note back to the suggesting bot.
export const botSuggestions = pgTable(
  "bot_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    suggesterActor: text("suggester_actor").notNull(),
    targetPmActor: text("target_pm_actor").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    approvedTicketId: text("approved_ticket_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    projectStatusIdx: index("bot_suggestions_project_status_idx").on(t.projectId, t.status),
  }),
);

// ADR-003 + ADR-004: per-colony settings.
//
// A colony is identified by the human's GitHub login (e.g., "allavallc",
// "tony"). Settings are scoped to a (project, colony) pair so the same
// human can have different policies in different projects, and two
// humans on the same project can have different policies in their own
// colonies. Currently holds the `always_ask` flag for ADR-004's
// suggestion-approval flow; future colony-level flags land here too.
export const colonySettings = pgTable(
  "colony_settings",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    colony: text("colony").notNull(),
    alwaysAsk: boolean("always_ask").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.colony] }),
  }),
);

// FS-022: swarm health monitoring anomalies.
//
// A periodic cron walks repo state + DB and writes a row here whenever an
// always-on invariant is violated (qualified-actor names, FS Owner format,
// stale orphans, etc.). One row per (project, code, dedup_key) — the cron
// upserts: existing row sees lastSeenAt bumped; new violation gets a fresh
// row with firstSeenAt = now. When the violation goes away on a subsequent
// run, resolvedAt is set.
//
// dedupKey is a stable hash of (code + key parts of details) so the same
// violation across runs collapses into one row. Without it, the cron would
// create a new row every 5 min for every persistent violation.
//
// Severity drives panel sort order: critical > warning > info.
export const swarmAnomalies = pgTable(
  "swarm_anomalies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    severity: text("severity").notNull(),
    message: text("message").notNull(),
    details: jsonb("details").notNull().default({}),
    dedupKey: text("dedup_key").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    projectDedupUnique: unique("swarm_anomalies_project_dedup_unique").on(t.projectId, t.dedupKey),
    projectOpenIdx: index("swarm_anomalies_project_open_idx").on(t.projectId, t.resolvedAt),
  }),
);

// FS-028 / HV-130: bot seat assignment.
//
// One row per (project, colony, handle). At most one row per
// (project, colony, seat) where status='active' — enforced by the
// partial unique index below. Seats are contiguous integers 1..N
// per (project, colony); the application code renumbers survivors
// when a bot leaves (see src/lib/seats.ts).
//
// Project + colony scoping matches `colony_settings` (above) — the
// same human can run different bots in different projects.
export const bots = pgTable(
  "bots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    colony: text("colony").notNull(),
    handle: text("handle").notNull(),
    seat: integer("seat").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("active"),
    // HV-136: SSE-as-liveness. When a bot's stream is open, this holds the
    // server-side connection id so internal code can push events to that
    // specific bot. NULL when no stream is open (old /join flow or
    // disconnected). Last-writer-wins on reopen.
    connectionId: text("connection_id"),
    // Stable local-session identity from the stream launcher. Lets the
    // server rebind the same logical bot if the operator accidentally
    // starts it twice from the same terminal/session.
    clientSessionId: text("client_session_id"),
    role: text("role"),
  },
  (t) => ({
    projectColonyHandleUnique: unique("bots_project_colony_handle_unique").on(
      t.projectId,
      t.colony,
      t.handle,
    ),
    projectColonyClientSessionUnique: unique("bots_project_colony_client_session_unique").on(
      t.projectId,
      t.colony,
      t.clientSessionId,
    ),
    activeSeatUnique: uniqueIndex("bots_project_colony_active_seat_uniq")
      .on(t.projectId, t.colony, t.seat)
      .where(sql`${t.status} = 'active'`),
  }),
);
