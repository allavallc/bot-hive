CREATE TABLE IF NOT EXISTS "swarm_anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedup_key" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "swarm_anomalies_project_dedup_unique" UNIQUE("project_id","dedup_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swarm_anomalies" ADD CONSTRAINT "swarm_anomalies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_anomalies_project_open_idx" ON "swarm_anomalies" USING btree ("project_id","resolved_at");