ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_owner_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_owner_repo_install_unique";--> statement-breakpoint
ALTER TABLE "projects" RENAME COLUMN "owner_id" TO "billing_owner_id";--> statement-breakpoint
DROP INDEX IF EXISTS "projects_owner_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "projects_install_repo_idx";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_install_repo_unique" UNIQUE("install_id","github_repo");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_billing_owner_id_user_id_fk" FOREIGN KEY ("billing_owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_billing_owner_idx" ON "projects" USING btree ("billing_owner_id");
