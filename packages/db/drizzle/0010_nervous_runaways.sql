CREATE TYPE "public"."charity_register" AS ENUM('charity_commission', 'oscr', 'ccni', 'companies_house');--> statement-breakpoint
CREATE TYPE "public"."outreach_channel" AS ENUM('corporate_email', 'postal_letter', 'individual_email', 'telephone');--> statement-breakpoint
CREATE TYPE "public"."outreach_decision_outcome" AS ENUM('eligible', 'held', 'review', 'consent_required', 'ineligible', 'quarantine');--> statement-breakpoint
ALTER TYPE "public"."suppression_target_type" ADD VALUE 'postal_address';--> statement-breakpoint
ALTER TYPE "public"."suppression_target_type" ADD VALUE 'charity';--> statement-breakpoint
CREATE TABLE "campaign_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"prospect_entity_id" uuid NOT NULL,
	"domain_id" uuid,
	"mailbox_id" uuid,
	"source_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charity_principals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"charity_commission_number" text,
	"oscr_number" text,
	"ccni_number" text,
	"company_number" text,
	"status" text DEFAULT 'unverified' NOT NULL,
	"registered_address" jsonb,
	"public_website" text,
	"verified_at" timestamp with time zone,
	"verification_expires_at" timestamp with time zone,
	"conflict_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charity_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charity_principal_id" uuid NOT NULL,
	"register" charity_register NOT NULL,
	"register_number" text NOT NULL,
	"outcome" "decision_outcome" NOT NULL,
	"register_status" text NOT NULL,
	"source_url" text NOT NULL,
	"evidence_hash" text NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "do_not_contact_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"campaign_prospect_id" uuid,
	"channel" "outreach_channel",
	"token_hash" text NOT NULL,
	"printed_code_hash" text,
	"suppression_scope" "suppression_scope" DEFAULT 'organisation' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_channel_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_prospect_id" uuid NOT NULL,
	"channel" "outreach_channel" NOT NULL,
	"outcome" "outreach_decision_outcome" NOT NULL,
	"policy_version" text NOT NULL,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postal_address_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_address_id" uuid NOT NULL,
	"outcome" "decision_outcome" NOT NULL,
	"policy_version" text NOT NULL,
	"source_approved" boolean DEFAULT false NOT NULL,
	"public_context_approved" boolean DEFAULT false NOT NULL,
	"sensitive_targeting_risk" boolean DEFAULT false NOT NULL,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assessed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preference_service_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"prospect_entity_id" uuid,
	"prospect_address_id" uuid,
	"service" text NOT NULL,
	"target_type" "suppression_target_type" NOT NULL,
	"target_hash" text NOT NULL,
	"matched" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"prospect_entity_id" uuid NOT NULL,
	"source_record_id" uuid,
	"address_hash" text NOT NULL,
	"address" jsonb NOT NULL,
	"address_context" text DEFAULT 'unknown' NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"legal_name" text NOT NULL,
	"trading_name" text,
	"company_number" text,
	"charity_commission_number" text,
	"oscr_number" text,
	"ccni_number" text,
	"status" text DEFAULT 'unverified' NOT NULL,
	"source_record_id" uuid,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_policies" ADD COLUMN "approved_channels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "source_policies" ADD COLUMN "retention_days" integer DEFAULT 365 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_policies" ADD COLUMN "attribution_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "source_policies" ADD COLUMN "prohibited_reuse" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "source_policies" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "campaign_prospects" ADD CONSTRAINT "campaign_prospects_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_prospects" ADD CONSTRAINT "campaign_prospects_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_prospects" ADD CONSTRAINT "campaign_prospects_prospect_entity_id_prospect_entities_id_fk" FOREIGN KEY ("prospect_entity_id") REFERENCES "public"."prospect_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_prospects" ADD CONSTRAINT "campaign_prospects_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_prospects" ADD CONSTRAINT "campaign_prospects_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_prospects" ADD CONSTRAINT "campaign_prospects_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charity_principals" ADD CONSTRAINT "charity_principals_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charity_verifications" ADD CONSTRAINT "charity_verifications_charity_principal_id_charity_principals_id_fk" FOREIGN KEY ("charity_principal_id") REFERENCES "public"."charity_principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "do_not_contact_tokens" ADD CONSTRAINT "do_not_contact_tokens_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "do_not_contact_tokens" ADD CONSTRAINT "do_not_contact_tokens_campaign_prospect_id_campaign_prospects_id_fk" FOREIGN KEY ("campaign_prospect_id") REFERENCES "public"."campaign_prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_channel_decisions" ADD CONSTRAINT "outreach_channel_decisions_campaign_prospect_id_campaign_prospects_id_fk" FOREIGN KEY ("campaign_prospect_id") REFERENCES "public"."campaign_prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postal_address_assessments" ADD CONSTRAINT "postal_address_assessments_prospect_address_id_prospect_addresses_id_fk" FOREIGN KEY ("prospect_address_id") REFERENCES "public"."prospect_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_service_checks" ADD CONSTRAINT "preference_service_checks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_service_checks" ADD CONSTRAINT "preference_service_checks_prospect_entity_id_prospect_entities_id_fk" FOREIGN KEY ("prospect_entity_id") REFERENCES "public"."prospect_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_service_checks" ADD CONSTRAINT "preference_service_checks_prospect_address_id_prospect_addresses_id_fk" FOREIGN KEY ("prospect_address_id") REFERENCES "public"."prospect_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_addresses" ADD CONSTRAINT "prospect_addresses_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_addresses" ADD CONSTRAINT "prospect_addresses_prospect_entity_id_prospect_entities_id_fk" FOREIGN KEY ("prospect_entity_id") REFERENCES "public"."prospect_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_addresses" ADD CONSTRAINT "prospect_addresses_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_entities" ADD CONSTRAINT "prospect_entities_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_entities" ADD CONSTRAINT "prospect_entities_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_prospects_entity_unique" ON "campaign_prospects" USING btree ("campaign_id","prospect_entity_id");--> statement-breakpoint
CREATE INDEX "campaign_prospects_org_idx" ON "campaign_prospects" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "charity_principals_org_idx" ON "charity_principals" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "charity_verifications_principal_idx" ON "charity_verifications" USING btree ("charity_principal_id");--> statement-breakpoint
CREATE INDEX "charity_verifications_register_idx" ON "charity_verifications" USING btree ("register","register_number");--> statement-breakpoint
CREATE UNIQUE INDEX "do_not_contact_tokens_token_unique" ON "do_not_contact_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "do_not_contact_tokens_org_idx" ON "do_not_contact_tokens" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "outreach_decisions_prospect_idx" ON "outreach_channel_decisions" USING btree ("campaign_prospect_id");--> statement-breakpoint
CREATE INDEX "outreach_decisions_channel_outcome_idx" ON "outreach_channel_decisions" USING btree ("channel","outcome");--> statement-breakpoint
CREATE INDEX "postal_assessments_address_idx" ON "postal_address_assessments" USING btree ("prospect_address_id");--> statement-breakpoint
CREATE INDEX "preference_checks_target_idx" ON "preference_service_checks" USING btree ("target_type","target_hash","active");--> statement-breakpoint
CREATE INDEX "preference_checks_entity_idx" ON "preference_service_checks" USING btree ("prospect_entity_id");--> statement-breakpoint
CREATE INDEX "prospect_addresses_entity_idx" ON "prospect_addresses" USING btree ("prospect_entity_id");--> statement-breakpoint
CREATE INDEX "prospect_addresses_hash_idx" ON "prospect_addresses" USING btree ("address_hash");--> statement-breakpoint
CREATE INDEX "prospect_entities_org_idx" ON "prospect_entities" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "prospect_entities_company_idx" ON "prospect_entities" USING btree ("company_number");--> statement-breakpoint
CREATE INDEX "prospect_entities_charity_idx" ON "prospect_entities" USING btree ("charity_commission_number");