ALTER TABLE "job_runs" ADD COLUMN "payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "available_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "manual_reviews_subject_status_unique" ON "manual_reviews" USING btree ("subject_type","subject_id","status");
--> statement-breakpoint
INSERT INTO "manual_reviews"
  ("organisation_id", "subject_type", "subject_id", "reason_codes", "evidence_ids")
SELECT
  cl."organisation_id",
  'campaign_lead_verification',
  cl."id"::text,
  '["LISTING_MATCH_REQUIRES_DETERMINISTIC_EVIDENCE","DOMAIN_REQUIRES_DETERMINISTIC_EVIDENCE"]'::jsonb,
  '[]'::jsonb
FROM "campaign_leads" cl
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "job_runs"
  ("organisation_id", "queue_name", "job_name", "idempotency_key", "status", "trace_id", "payload")
SELECT
  cl."organisation_id",
  'verification',
  'review_campaign_lead',
  'review:' || cl."id"::text || ':2026-06-11.1',
  'queued',
  gen_random_uuid()::text,
  jsonb_build_object('campaignLeadId', cl."id"::text)
FROM "campaign_leads" cl
ON CONFLICT ("queue_name", "idempotency_key") DO NOTHING;
