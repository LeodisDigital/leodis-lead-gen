CREATE TABLE "email_delivery_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"provider" text DEFAULT 'smtp' NOT NULL,
	"label" text NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"secure" boolean DEFAULT true NOT NULL,
	"username" text NOT NULL,
	"encrypted_password" text,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"reply_to_email" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_status" text,
	"last_test_message" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"campaign_id" uuid,
	"campaign_prospect_id" uuid,
	"template_manifest_id" uuid,
	"recipient_hash" text NOT NULL,
	"sender_email" text NOT NULL,
	"subject_hash" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"provider_message_id" text,
	"failure_reason" text,
	"sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_delivery_settings" ADD CONSTRAINT "email_delivery_settings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_delivery_settings" ADD CONSTRAINT "email_delivery_settings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "outbound_email_logs" ADD CONSTRAINT "outbound_email_logs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "outbound_email_logs" ADD CONSTRAINT "outbound_email_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "outbound_email_logs" ADD CONSTRAINT "outbound_email_logs_campaign_prospect_id_campaign_prospects_id_fk" FOREIGN KEY ("campaign_prospect_id") REFERENCES "public"."campaign_prospects"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "outbound_email_logs" ADD CONSTRAINT "outbound_email_logs_template_manifest_id_email_template_manifests_id_fk" FOREIGN KEY ("template_manifest_id") REFERENCES "public"."email_template_manifests"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "outbound_email_logs" ADD CONSTRAINT "outbound_email_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "email_delivery_org_unique" ON "email_delivery_settings" USING btree ("organisation_id");
--> statement-breakpoint
CREATE INDEX "email_delivery_org_enabled_idx" ON "email_delivery_settings" USING btree ("organisation_id","enabled");
--> statement-breakpoint
CREATE INDEX "outbound_email_logs_campaign_idx" ON "outbound_email_logs" USING btree ("campaign_id");
--> statement-breakpoint
CREATE INDEX "outbound_email_logs_status_idx" ON "outbound_email_logs" USING btree ("organisation_id","status");
