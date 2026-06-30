CREATE TABLE "launch_gates" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"evidence_reference" text,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "launch_gates" ADD CONSTRAINT "launch_gates_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE "source_policies" SET "enabled" = false, "updated_at" = now()
WHERE "source_class" = 'client-provided-target';
--> statement-breakpoint
UPDATE "campaign_principals" SET "verified_at" = null, "updated_at" = now();
--> statement-breakpoint
UPDATE "campaigns" SET "status" = 'pending_approval', "updated_at" = now()
WHERE "status" = 'approved';
--> statement-breakpoint
UPDATE "platform_settings" SET "value" = 'false', "updated_at" = now()
WHERE "key" = 'launch.production_exports_enabled';
