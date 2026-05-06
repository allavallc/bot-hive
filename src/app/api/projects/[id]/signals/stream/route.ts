import { getActor } from "@/lib/actor";
import { type BroadcastEvent, subscribe } from "@/lib/broadcast";
import { getSignals } from "@/lib/signal-buffer";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const actor = await getActor(req, projectId);
  if (!actor) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: BroadcastEvent) => {
        if (event.type !== "signal" || event.projectId !== projectId) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event.signal)}\n\n`));
        } catch {
          // Client disconnected; cleanup runs via cancel().
        }
      };

      // Replay the buffer so a freshly-opened client sees recent context.
      const replay = getSignals(projectId);
      for (const signal of replay) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(signal)}\n\n`));
        } catch {
          // Client disconnected before replay finished.
        }
      }

      const unsubscribe = subscribe(projectId, send);

      controller.enqueue(encoder.encode(`: connected ${new Date().toISOString()}\n\n`));

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 30_000);

      cleanup = () => {
        clearInterval(keepalive);
        unsubscribe();
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
