CREATE TABLE IF NOT EXISTS "bot_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"suggester_actor" text NOT NULL,
	"target_pm_actor" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"approved_ticket_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "colony_settings" (
	"project_id" uuid NOT NULL,
	"colony" text NOT NULL,
	"always_ask" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colony_settings_project_id_colony_pk" PRIMARY KEY("project_id","colony")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bot_suggestions" ADD CONSTRAINT "bot_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "colony_settings" ADD CONSTRAINT "colony_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_suggestions_project_status_idx" ON "bot_suggestions" USING btree ("project_id","status");