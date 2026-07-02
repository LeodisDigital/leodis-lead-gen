CREATE TABLE "api_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"endpoint" text NOT NULL,
	"estimated_cost_micros" bigint NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_usage_log" ADD CONSTRAINT "api_usage_log_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "api_usage_provider_month_idx" ON "api_usage_log" USING btree ("provider", "created_at");
