CREATE TABLE IF NOT EXISTS "active_claims" (
	"project_id" uuid NOT NULL,
	"hv_id" text NOT NULL,
	"handle" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "active_claims_project_id_hv_id_pk" PRIMARY KEY("project_id","hv_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "active_claims" ADD CONSTRAINT "active_claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "active_claims_expiry_idx" ON "active_claims" USING btree ("project_id","expires_at");