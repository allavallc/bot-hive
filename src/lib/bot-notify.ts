// HV-141: cross-instance peer push via Postgres LISTEN/NOTIFY.
//
// publishPeerPush() fires pg_notify('bot_push', ...) so ALL server instances
// receive the event. Each instance delivers it locally if it holds that
// connectionId. This fixes the silent drop that happened during Render
// zero-downtime deploys when two instances split the botStreams Map.
//
// A dedicated postgres client handles LISTEN (postgres.js reconnects
// automatically). The main Drizzle pool handles NOTIFY.

import postgres from "postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { db } from "@/db";
import type { PeerPush } from "@/lib/bot-stream";
import { deliverToConnection, type YourRoleEvent } from "@/lib/bot-registry";

const CHANNEL = "bot_push";

type NotifyPayload = {
  connectionId: string;
  event: YourRoleEvent;
};

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL is not set");

// Dedicated connection for LISTEN — separate from the query pool.
// postgres.js auto-reconnects on disconnect.
const listenClient = postgres(dbUrl, { max: 1 });

listenClient
  .listen(CHANNEL, (payloadStr: string) => {
    let payload: NotifyPayload;
    try {
      payload = JSON.parse(payloadStr) as NotifyPayload;
    } catch {
      console.warn("[bot-notify] unparseable payload:", payloadStr);
      return;
    }
    deliverToConnection(payload.connectionId, payload.event);
  })
  .catch((err: unknown) => {
    console.error("[bot-notify] LISTEN setup failed:", err);
  });

export async function publishPeerPush(p: PeerPush, total: number, colony: string): Promise<void> {
  const payload: NotifyPayload = {
    connectionId: p.connectionId,
    event: {
      type: "your-role",
      role: p.role,
      seat: p.seat,
      skillFiles: [],
      colony,
      handle: p.handle,
      total,
    },
  };
  try {
    await db.execute(drizzleSql`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(payload)})`);
  } catch (err) {
    console.warn("[bot-notify] pg_notify failed:", err);
  }
}
