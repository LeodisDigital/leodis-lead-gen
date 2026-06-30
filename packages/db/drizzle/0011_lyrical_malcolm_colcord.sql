CREATE TABLE "fulfilment_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'provider_api' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"test_mode" boolean DEFAULT true NOT NULL,
	"contract_reference" text,
	"dpa_reference" text,
	"security_review_reference" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letter_fulfilment_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"template_manifest_id" uuid NOT NULL,
	"provider_id" uuid,
	"mode" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letter_fulfilment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"campaign_prospect_id" uuid NOT NULL,
	"outreach_channel_decision_id" uuid NOT NULL,
	"do_not_contact_token_id" uuid,
	"status" text DEFAULT 'created' NOT NULL,
	"provider_item_id" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letter_template_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"controller_identity" text NOT NULL,
	"do_not_contact_route" text NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"evidence_reference" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fulfilment_providers" ADD CONSTRAINT "fulfilment_providers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_fulfilment_batches" ADD CONSTRAINT "letter_fulfilment_batches_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_fulfilment_batches" ADD CONSTRAINT "letter_fulfilment_batches_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_fulfilment_batches" ADD CONSTRAINT "letter_fulfilment_batches_template_manifest_id_letter_template_manifests_id_fk" FOREIGN KEY ("template_manifest_id") REFERENCES "public"."letter_template_manifests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_fulfilment_batches" ADD CONSTRAINT "letter_fulfilment_batches_provider_id_fulfilment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."fulfilment_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_fulfilment_batches" ADD CONSTRAINT "letter_fulfilment_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_fulfilment_items" ADD CONSTRAINT "letter_fulfilment_items_batch_id_letter_fulfilment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."letter_fulfilment_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_fulfilment_items" ADD CONSTRAINT "letter_fulfilment_items_campaign_prospect_id_campaign_prospects_id_fk" FOREIGN KEY ("campaign_prospect_id") REFERENCES "public"."campaign_prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_fulfilment_items" ADD CONSTRAINT "letter_fulfilment_items_outreach_channel_decision_id_outreach_channel_decisions_id_fk" FOREIGN KEY ("outreach_channel_decision_id") REFERENCES "public"."outreach_channel_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_fulfilment_items" ADD CONSTRAINT "letter_fulfilment_items_do_not_contact_token_id_do_not_contact_tokens_id_fk" FOREIGN KEY ("do_not_contact_token_id") REFERENCES "public"."do_not_contact_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_template_manifests" ADD CONSTRAINT "letter_template_manifests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_template_manifests" ADD CONSTRAINT "letter_template_manifests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fulfilment_provider_org_idx" ON "fulfilment_providers" USING btree ("organisation_id","enabled");--> statement-breakpoint
CREATE INDEX "letter_batches_campaign_idx" ON "letter_fulfilment_batches" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "letter_batches_org_status_idx" ON "letter_fulfilment_batches" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "letter_items_batch_prospect_unique" ON "letter_fulfilment_items" USING btree ("batch_id","campaign_prospect_id");--> statement-breakpoint
CREATE INDEX "letter_items_status_idx" ON "letter_fulfilment_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "letter_template_org_idx" ON "letter_template_manifests" USING btree ("organisation_id","approved");