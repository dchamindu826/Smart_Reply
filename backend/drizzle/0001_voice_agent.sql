CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"call_id" uuid,
	"service" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"created_by" text DEFAULT 'ai' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_addons" ADD COLUMN "voice_seconds_this_month" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_mode" text DEFAULT 'studio' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_answer_when" text DEFAULT 'no_answer' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_live_model" text DEFAULT 'gemini-3.8-live' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_live_voice" text DEFAULT 'Kore' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_tts_model" text DEFAULT 'gemini-3.8-flash-tts' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_tts_voice" text DEFAULT 'Hali' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_style" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_booking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_services" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_slot_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_slot_capacity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_booking_days_ahead" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_confirm_on_whatsapp" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD COLUMN "voice_max_call_seconds" integer DEFAULT 600 NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "handled_by_ai" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "gemini_api_key_enc" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_company_starts_idx" ON "bookings" USING btree ("company_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_contact_idx" ON "bookings" USING btree ("contact_id");