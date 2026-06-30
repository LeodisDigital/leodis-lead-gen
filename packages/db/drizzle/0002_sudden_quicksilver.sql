CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "target_industry" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "target_location" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "max_leads" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "company_type" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "registered_address" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "sic_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "verified_source" text;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_unique" ON "user_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");