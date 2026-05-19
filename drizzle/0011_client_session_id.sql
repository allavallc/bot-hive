-- HV-142: stable local session identity for bot stream dedupe.
ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "client_session_id" text;
--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_project_colony_client_session_unique"
  UNIQUE("project_id", "colony", "client_session_id");
