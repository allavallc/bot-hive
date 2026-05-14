// HV-136 / HV-140: GET /api/bots/stream?repo_full_name=…&colony=…&handle=…
//
// SSE-as-liveness — one long-lived stream per bot. The open TCP socket
// IS the liveness signal. On open we insert/rebind the bot's row +
// re-derive roles + push first event; on (graceful) close we hold the
// row 15s, then mark offline + renumber + push role changes to peers.
//
// HV-140: cleanup is wired to BOTH cancel() and req.signal so disconnect
// is detected reliably in the Node.js runtime (cancel() alone is not
// guaranteed to fire on socket close; req.signal is the reliable path).

import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { bots, projects } from "@/db/schema";
import { type PeerPush, connectBot, disconnectBot } from "@/lib/bot-stream";
import { broadcast } from "@/lib/broadcast";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const GRACE_PERIOD_MS = 15_000;

type StreamEvent =
  | {
      type: "your-role";
      role: string;
      seat: number;
      skillFiles: string[];
      colony: string;
      handle: string;
      total: number;
    }
  | { type: "snapshot"; colony: string; seats: { handle: string; seat: number; role: string }[] };

const botStreams = new Map<string, (event: StreamEvent) => void>();
const pendingDisconnects = new Map<string, NodeJS.Timeout>();

function botKey(projectId: string, colony: string, handle: string): string {
  return `${projectId}:${colony}:${handle}`;
}

function pushPeer(p: PeerPush, total: number, colony: string): void {
  const send = botStreams.get(p.connectionId);
  if (!send) return;
  send({
    type: "your-role",
    role: p.role,
    seat: p.seat,
    skillFiles: [],
    colony,
    handle: p.handle,
    total,
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const repoFullName = url.searchParams.get("repo_full_name") ?? "";
  const colony = url.searchParams.get("colony") ?? "";
  const handle = url.searchParams.get("handle") ?? "";
  if (!repoFullName || !colony || !handle) {
    return new Response("repo_full_name, colony, handle are required", { status: 400 });
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.githubRepo, repoFullName))
    .limit(1);
  if (!project) {
    return new Response(`no project registered for repo '${repoFullName}'`, { status: 404 });
  }

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

  // Push role changes to peers' already-open streams.
  for (const p of peerPushes) {
    pushPeer(p, snapshot.length, colony);
  }
  // Project-wide broadcast for the modal.
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
      botStreams.set(connectionId, send);

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
        // Bump heartbeat so the legacy sweep (still wired into /join etc.
        // in Phase 1) doesn't reap us as stale. Removed in Phase 2 with
        // the rest of the heartbeat machinery.
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
        botStreams.delete(connectionId);

        // Schedule the actual evict after grace. A rebind (same handle
        // opens a new stream) clears this timer before it fires.
        const timer = setTimeout(async () => {
          pendingDisconnects.delete(key);
          try {
            const result = await disconnectBot(project.id, colony, handle, connectionId);
            if (!result) return;
            for (const p of result.peerPushes) {
              pushPeer(p, result.snapshot.length, colony);
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
  // cancel() alone may not fire when the TCP socket closes.
  req.signal.addEventListener('abort', () => cleanup?.(), { once: true });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
