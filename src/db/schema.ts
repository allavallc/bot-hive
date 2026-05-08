import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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

// HV-090: platform-as-soft-fence for claim coordination.
//
// Bots POST to /api/projects/[id]/tickets/[hvId]/claim to mark a ticket as
// "I'm working on this" within seconds — without the PR ceremony needed to
// commit a folder move. Other bots check this table during DAG-walk and
// skip already-claimed tickets. Claims expire after 30 min if not followed
// by a real Git commit moving the ticket file (the webhook clears the
// claim on that move).
//
// IMPORTANT: this table is the *fence*, not the source of truth. Git
// remains canonical — wipe this table tomorrow and the swarm still works
// (just slower, more git-collision-prone). Active claims are transient
// optimistic locks; the canonical "this ticket is in-progress" record is
// the file's location in `hive/in-progress/` on main.
export const activeClaims = pgTable(
  "active_claims",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    hvId: text("hv_id").notNull(),
    handle: text("handle").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.hvId] }),
    expiryIdx: index("active_claims_expiry_idx").on(t.projectId, t.expiresAt),
  }),
);
