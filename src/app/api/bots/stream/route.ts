// HV-136 / HV-140 / HV-141: GET /api/bots/stream?repo_full_name=…&colony=…&handle=…
//
// SSE-as-liveness — one long-lived stream per bot. The open TCP socket
// IS the liveness signal. On open we insert/rebind the bot's row +
// re-derive roles + push first event; on (graceful) close we hold the
// row 15s, then mark offline + renumber + push role changes to peers.
//
// HV-140: cleanup wired to both cancel() and req.signal for reliable
//         disconnect detection in the Node.js runtime.
// HV-141: peer pushes go through Postgres NOTIFY (bot-notify.ts) so they
//         reach bots on any instance during zero-downtime Render deploys.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/db";
import { bots, projects } from "@/db/schema";
import { publishPeerPush } from "@/lib/bot-notify";
import { type StreamEvent, registerStream, unregisterStream } from "@/lib/bot-registry";
import { type PeerPush, connectBot, disconnectBot } from "@/lib/bot-stream";
import { broadcast } from "@/lib/broadcast";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const GRACE_PERIOD_MS = 15_000;

const pendingDisconnects = new Map<string, NodeJS.Timeout>();

function botKey(projectId: string, colony: string, handle: string): string {
  return `${projectId}:${colony}:${handle}`;
}

let handlePool: string[] | null = null;

function loadHandlePool(): string[] {
  if (handlePool) return handlePool;
  const raw = readFileSync(join(process.cwd(), "hive", "handles.txt"), "utf-8");
  handlePool = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  return handlePool;
}

async function assignHandle(projectId: string, colony: string): Promise<string> {
  const pool = loadHandlePool();
  const activeRows = await db
    .select({ handle: bots.handle })
    .from(bots)
    .where(and(eq(bots.projectId, projectId), eq(bots.colony, colony), eq(bots.status, "active")));
  const active = new Set(activeRows.map((r) => r.handle));
  for (const h of pool) {
    if (!active.has(h)) return h;
  }
  // Pool exhausted: append numeric suffix to first pool entry.
  const base = pool[0] ?? "bot";
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!active.has(candidate)) return candidate;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const repoFullName = url.searchParams.get("repo_full_name") ?? "";
  const colony = url.searchParams.get("colony") ?? "";
  if (!repoFullName || !colony) {
    return new Response("repo_full_name and colony are required", { status: 400 });
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.githubRepo, repoFullName))
    .limit(1);
  if (!project) {
    return new Response(`no project registered for repo '${repoFullName}'`, { status: 404 });
  }

  const handle = url.searchParams.get("handle") || (await assignHandle(project.id, colony));

  const connectionId = randomUUID();
  const key = botKey(project.id, colony, handle);

  // Rebind: cancel any pending disconnect for this (project, colony, handle).
  const pending = pendingDisconnects.get(key);
  if (pending) {
    clearTimeout(pending);
    pendingDisconnects.delete(key);
  }

  const { seat, selfRole, selfSkillFiles, peerPushes, snapshot } = await connectBot(
    project.id,
    colony,
    handle,
    connectionId,
  );

  // Push role changes to peers' open streams (cross-instance via Postgres NOTIFY).
  for (const p of peerPushes) {
    await publishPeerPush(p, snapshot.length, colony);
  }
  broadcast({
    type: "bot-joined",
    projectId: project.id,
    colony,
    joined: { handle, seat },
    seatMap: snapshot,
  });

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed mid-write. cancel() will run cleanup.
        }
      };
      registerStream(connectionId, send);

      controller.enqueue(encoder.encode(`: connected ${new Date().toISOString()}\n\n`));
      send({
        type: "your-role",
        role: selfRole,
        seat,
        skillFiles: selfSkillFiles,
        colony,
        handle,
        total: snapshot.length,
      });
      send({ type: "snapshot", colony, seats: snapshot });

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
        void db
          .update(bots)
          .set({ lastHeartbeatAt: new Date() })
          .where(
            and(
              eq(bots.projectId, project.id),
              eq(bots.colony, colony),
              eq(bots.handle, handle),
              eq(bots.connectionId, connectionId),
            ),
          )
          .catch((err) => console.warn("[bots/stream] keepalive heartbeat:", err));
      }, 30_000);

      cleanup = () => {
        cleanup = null; // idempotent — cancel() and req.signal can both fire
        clearInterval(keepalive);
        unregisterStream(connectionId);

        const timer = setTimeout(async () => {
          pendingDisconnects.delete(key);
          try {
            const result = await disconnectBot(project.id, colony, handle, connectionId);
            if (!result) return;
            for (const p of result.peerPushes) {
              await publishPeerPush(p, result.snapshot.length, colony);
            }
            broadcast({
              type: "bot-left",
              projectId: project.id,
              colony,
              departed: result.departed,
              seatMap: result.snapshot,
            });
          } catch (err) {
            console.error("[bots/stream] disconnect failed:", err);
          }
        }, GRACE_PERIOD_MS);
        pendingDisconnects.set(key, timer);
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  // HV-140: req.signal is the reliable disconnect hook in Node.js runtime.
  req.signal.addEventListener("abort", () => cleanup?.(), { once: true });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
