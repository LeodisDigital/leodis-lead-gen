CREATE TABLE "email_template_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"subject_line" text NOT NULL,
	"body_text" text NOT NULL,
	"merge_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
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
ALTER TABLE "letter_template_manifests" ADD COLUMN "subject_line" text;--> statement-breakpoint
ALTER TABLE "letter_template_manifests" ADD COLUMN "body_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "letter_template_manifests" ADD COLUMN "merge_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "email_template_manifests" ADD CONSTRAINT "email_template_manifests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_template_manifests" ADD CONSTRAINT "email_template_manifests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_template_org_idx" ON "email_template_manifests" USING btree ("organisation_id","approved");