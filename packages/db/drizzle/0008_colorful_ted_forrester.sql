ALTER TABLE "job_runs" ADD COLUMN "worker_id" text;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "job_runs_claim_idx" ON "job_runs" USING btree ("queue_name","status","available_at");