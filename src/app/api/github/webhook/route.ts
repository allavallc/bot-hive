import { handlePushEvent, verifySignature } from "@/lib/webhook";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-hub-signature-256");
  const event = req.headers.get("x-github-event");
  const deliveryId = req.headers.get("x-github-delivery");

  if (!signature || !deliveryId || !event) {
    return new NextResponse("missing required headers", { status: 400 });
  }

  const rawBody = await req.text();

  const valid = await verifySignature(rawBody, signature);
  if (!valid) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  if (event === "ping") {
    return NextResponse.json({ pong: true });
  }

  try {
    const payload = JSON.parse(rawBody);

    if (event === "push") {
      await handlePushEvent(payload, deliveryId);
    } else if (event === "installation" || event === "installation_repositories") {
      console.log(`[webhook] ${event} received, deferred to Phase 2`);
    } else {
      console.log(`[webhook] unhandled event: ${event}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] handler error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
