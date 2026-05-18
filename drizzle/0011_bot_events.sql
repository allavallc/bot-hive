CREATE TABLE IF NOT EXISTS "bot_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"colony" text NOT NULL,
	"handle" text NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"target_handle" text,
	"target_role" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_events" ADD CONSTRAINT "bot_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_events_project_created_idx" ON "bot_events" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_events_project_colony_created_idx" ON "bot_events" USING btree ("project_id","colony","created_at");
