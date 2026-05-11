// POST /api/health/cron — run the FS-022 health-monitoring cycle for
// every project. Triggered by an external scheduler (e.g. a Render cron
// job hitting this URL every ~5 min). Idempotent — safe to call more often.
//
// Auth: Bearer token matching SWARM_HEALTH_CRON_SECRET env var. The
// secret is set in Render dashboard, not committed.

import { runCron } from "@/lib/swarm-health-cron";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.SWARM_HEALTH_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "SWARM_HEALTH_CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await runCron();
  return NextResponse.json({ results });
}
