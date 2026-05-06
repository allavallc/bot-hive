-- Drop the bot_tokens table — feature was ripped out (no separate signal
-- channel, no bot HTTP auth; events.log is the durable channel and the
-- existing webhook → SSE broadcast carries it to the live UI).
--
-- Idempotent: drops succeed even if the table or its constraints were
-- removed manually or never existed.

ALTER TABLE "bot_tokens" DROP CONSTRAINT IF EXISTS "bot_tokens_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "bot_tokens" DROP CONSTRAINT IF EXISTS "bot_tokens_created_by_user_id_fk";--> statement-breakpoint
ALTER TABLE "bot_tokens" DROP CONSTRAINT IF EXISTS "bot_tokens_token_hash_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "bot_tokens_project_active_idx";--> statement-breakpoint
DROP TABLE IF EXISTS "bot_tokens" CASCADE;
