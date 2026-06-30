ALTER TABLE "source_policies" ADD COLUMN "owner" text DEFAULT 'platform owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_policies" ADD COLUMN "evidence_reference" text;--> statement-breakpoint
ALTER TABLE "source_policies" ADD COLUMN "rate_limit" integer;--> statement-breakpoint
ALTER TABLE "source_policies" ADD COLUMN "volume_limit" integer;--> statement-breakpoint
CREATE INDEX "source_policies_class_enabled_idx" ON "source_policies" USING btree ("source_class","enabled");