-- HV-136: SSE-as-liveness for bot seats.
-- Additive only — keeps `seat`, `status`, `last_heartbeat_at` for the
-- old /join + /heartbeat path. Phase 2 (separate ticket) drops them.

ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "connection_id" text;
--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "role" text;
