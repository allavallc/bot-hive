// Next.js instrumentation — runs once in the Node.js runtime when the server starts.
//
// Marks every active bot row offline so ghost rows from a previous process
// (crashed SSE connection, unclean hot-reload, killed stream.ps1) don't
// inflate the colony count or block handle re-use on the next startup.
//
// Safe for production: when the server restarts all SSE connections are
// already gone, so no real bot is evicted — we're just being honest about
// the state the DB should be in.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { db } = await import("@/db");
      const { bots } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const result = await db
        .update(bots)
        .set({ status: "offline", connectionId: null })
        .where(eq(bots.status, "active"))
        .returning({ id: bots.id });
      if (result.length > 0) {
        console.log(`[startup] cleared ${result.length} stale active bot row(s)`);
      }
    } catch (err) {
      // Non-fatal: if the DB isn't reachable yet the bots table may not
      // exist. Log and continue — the server will still start.
      console.warn("[startup] could not clear active bot rows:", err);
    }

    // Auto-sweep: reap bots whose SSE keepalive stopped > 2 minutes ago.
    // Runs every 60 seconds; threshold = 2 missed keepalives (30s each).
    const sweepTimer = setInterval(async () => {
      try {
        const { sweepAllStale } = await import("@/lib/sweep-all");
        await sweepAllStale();
      } catch (err) {
        console.warn("[sweep] interval error:", err);
      }
    }, 60_000);
    sweepTimer.unref();
  }
}
