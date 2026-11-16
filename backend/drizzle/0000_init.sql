CREATE TABLE "ai_addon_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'LKR' NOT NULL,
	"monthly_reply_limit" integer DEFAULT 1000 NOT NULL,
	"voice_included" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_addons" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'off' NOT NULL,
	"addon_plan_id" uuid,
	"activated_by" uuid,
	"activated_at" timestamp with time zone,
	"active_until" timestamp with time zone,
	"monthly_reply_limit" integer DEFAULT 0 NOT NULL,
	"usage_month" text DEFAULT '' NOT NULL,
	"replies_this_month" integer DEFAULT 0 NOT NULL,
	"tokens_this_month" integer DEFAULT 0 NOT NULL,
	"cost_minor_this_month" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone,
	"requested_by" uuid,
	"request_message" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_bot_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"contact_id" uuid,
	"conversation_id" uuid,
	"message_id" uuid,
	"intent" text DEFAULT '' NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"user_input" text DEFAULT '' NOT NULL,
	"bot_output" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"agent_user_id" uuid,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_bot_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"chat_bot_enabled" boolean DEFAULT false NOT NULL,
	"voice_bot_enabled" boolean DEFAULT false NOT NULL,
	"chat_bot_mode" text DEFAULT 'after_hours' NOT NULL,
	"persona_name" text DEFAULT 'Assistant' NOT NULL,
	"language_mode" text DEFAULT 'trilingual' NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"confidence_threshold" integer DEFAULT 75 NOT NULL,
	"auto_handoff_on_negotiation" boolean DEFAULT true NOT NULL,
	"auto_handoff_on_complaint" boolean DEFAULT true NOT NULL,
	"auto_handoff_on_staff_request" boolean DEFAULT true NOT NULL,
	"welcome_message" text DEFAULT '' NOT NULL,
	"fallback_message" text DEFAULT 'Thank you. One of our team will reply shortly.' NOT NULL,
	"voice_model" text DEFAULT '' NOT NULL,
	"voice_greeting" text DEFAULT '' NOT NULL,
	"auto_transcribe_calls" boolean DEFAULT false NOT NULL,
	"auto_summarize_calls" boolean DEFAULT false NOT NULL,
	"missed_call_auto_followup" boolean DEFAULT false NOT NULL,
	"missed_call_message_template" text DEFAULT '' NOT NULL,
	"voice_language" text DEFAULT 'trilingual' NOT NULL,
	"voice_speed" real DEFAULT 1 NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_training_examples" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"question" text NOT NULL,
	"ideal_answer" text NOT NULL,
	"source_message_id" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_rules" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"auto_assign" text DEFAULT 'round_robin' NOT NULL,
	"sticky_owner" boolean DEFAULT true NOT NULL,
	"max_open_chats" integer DEFAULT 25 NOT NULL,
	"unassigned_alert_minutes" integer DEFAULT 10 NOT NULL,
	"call_ring_owner_first" boolean DEFAULT true NOT NULL,
	"missed_call_template_id" uuid,
	"skip_on_break" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid,
	"actor_user_id" uuid,
	"actor_name" text DEFAULT '' NOT NULL,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"summary" text NOT NULL,
	"meta" jsonb,
	"source" text DEFAULT 'web' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"scope" text NOT NULL,
	"planned_minutes" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "broadcast_recipients" (
	"broadcast_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"message_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	CONSTRAINT "broadcast_recipients_broadcast_id_contact_id_pk" PRIMARY KEY("broadcast_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"label_id" uuid,
	"template_id" uuid NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_profiles" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"vertical" text DEFAULT '' NOT NULL,
	"greeting_text" text DEFAULT '' NOT NULL,
	"greeting_on" boolean DEFAULT false NOT NULL,
	"away_text" text DEFAULT '' NOT NULL,
	"away_on" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" uuid,
	"data" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"break_max_minutes" integer DEFAULT 60 NOT NULL,
	"ring_strategy" text DEFAULT 'all' NOT NULL,
	"ring_seconds" integer DEFAULT 20 NOT NULL,
	"record_auto" boolean DEFAULT false NOT NULL,
	"record_announce" boolean DEFAULT true NOT NULL,
	"record_pause_allowed" boolean DEFAULT true NOT NULL,
	"record_keep_days" text DEFAULT '90' NOT NULL,
	"link_previews" boolean DEFAULT false NOT NULL,
	"forwarding" jsonb DEFAULT '{"noAnswer":"queue","busy":"wait","onBreak":"queue","away":"queue","dnd":"msg","afterHours":"msg"}'::jsonb NOT NULL,
	"hours" jsonb DEFAULT '{"enabled":false,"timezone":"Asia/Colombo","weekly":[],"holidays":[]}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"wa_call_id" text,
	"direction" text NOT NULL,
	"outcome" text DEFAULT 'ringing' NOT NULL,
	"handled_by_user_id" uuid,
	"ringing_user_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"sdp_offer" text,
	"ivr_option" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"note" text DEFAULT '' NOT NULL,
	"recording_file_id" uuid,
	"transcript" jsonb,
	"ai_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan_id" uuid,
	"seat_limit" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"timezone" text DEFAULT 'Asia/Colombo' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"default_country_code" text DEFAULT '94' NOT NULL,
	"created_by" uuid,
	"rr_cursor" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connect_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connect_links_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "contact_labels" (
	"company_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_labels_contact_id_label_id_pk" PRIMARY KEY("contact_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "contact_owner_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"from_user_id" uuid,
	"to_user_id" uuid,
	"actor_user_id" uuid,
	"actor_kind" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"wa_id" text,
	"bsuid" text,
	"username" text,
	"name" text DEFAULT '' NOT NULL,
	"profile_name" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"owner_user_id" uuid,
	"call_permission" text DEFAULT 'none' NOT NULL,
	"call_permission_expires_at" timestamp with time zone,
	"call_permission_requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unanswered_business_calls" integer DEFAULT 0 NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"blocked_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"avatar_color" text DEFAULT 'a1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_user_state" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"last_read_at" timestamp with time zone,
	CONSTRAINT "conversation_user_state_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_preview" text DEFAULT '' NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"window_expires_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"bot_active" boolean DEFAULT true NOT NULL,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"push_token" text NOT NULL,
	"voip_token" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid,
	"purpose" text DEFAULT 'message' NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded" boolean DEFAULT false NOT NULL,
	"voice" boolean DEFAULT false NOT NULL,
	"wa_media_id" text,
	"wa_media_uploaded_at" timestamp with time zone,
	"sha256" text,
	"duration_seconds" integer,
	"width" integer,
	"height" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"reply_text" text DEFAULT '' NOT NULL,
	"quick_reply_id" uuid,
	"only_outside_hours" boolean DEFAULT false NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impersonations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"as_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"title" text DEFAULT 'Staff' NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"number" text NOT NULL,
	"period" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'LKR' NOT NULL,
	"status" text DEFAULT 'due' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ivr_menus" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"greeting_mode" text DEFAULT 'tts' NOT NULL,
	"greeting_text" text DEFAULT '' NOT NULL,
	"greeting_file_id" uuid,
	"wait_seconds" integer DEFAULT 8 NOT NULL,
	"no_input_destination" text DEFAULT 'queue' NOT NULL,
	"after_hours_enabled" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"keywords" text[] NOT NULL,
	"label_id" uuid,
	"assign_user_id" uuid,
	"quick_reply_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"file_id" uuid,
	"status" text DEFAULT 'ready' NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '' NOT NULL,
	"meaning" text DEFAULT '' NOT NULL,
	"auto_rule" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_favorites" (
	"media_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	CONSTRAINT "media_favorites_media_item_id_user_id_pk" PRIMARY KEY("media_item_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"file_id" uuid NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"added_by" uuid,
	"share_count" integer DEFAULT 0 NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"message_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "message_attachments_message_id_file_id_pk" PRIMARY KEY("message_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"wa_message_id" text,
	"sender_user_id" uuid,
	"sender_kind" text NOT NULL,
	"template_id" uuid,
	"template_name" text,
	"buttons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_to_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"pricing_category" text,
	"billable" boolean,
	"raw" jsonb,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"seat_limit" integer NOT NULL,
	"price_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'LKR' NOT NULL,
	"features" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"meta_app_id" text DEFAULT '' NOT NULL,
	"meta_app_secret_enc" text,
	"meta_graph_version" text DEFAULT 'v26.0' NOT NULL,
	"meta_verify_token_enc" text,
	"meta_embedded_signup_config_id" text DEFAULT '' NOT NULL,
	"meta_system_token_enc" text,
	"meta_subscribed_fields" text[] DEFAULT ARRAY['messages','calls','message_template_status_update','message_template_quality_update','phone_number_quality_update','account_update']::text[] NOT NULL,
	"ai_provider" text DEFAULT 'none' NOT NULL,
	"ai_api_key_enc" text,
	"ai_default_model" text DEFAULT '' NOT NULL,
	"ai_base_url" text DEFAULT '' NOT NULL,
	"ai_default_prompt" text DEFAULT '' NOT NULL,
	"ai_global_off" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presence" (
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"company_id" uuid NOT NULL,
	"status" text DEFAULT 'away' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"planned_minutes" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "presence_user_id_channel_pk" PRIMARY KEY("user_id","channel")
);
--> statement-breakpoint
CREATE TABLE "product_collections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"collection_id" uuid,
	"name" text NOT NULL,
	"sku" text DEFAULT '' NOT NULL,
	"price_minor" bigint DEFAULT 0 NOT NULL,
	"old_price_minor" bigint,
	"currency" text DEFAULT 'LKR' NOT NULL,
	"price_unit" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"image_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quick_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"command" text NOT NULL,
	"title" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"scope" text DEFAULT 'everyone' NOT NULL,
	"owner_user_id" uuid,
	"file_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"impersonation_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"staff" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_targets" (
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"resolved_target" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_targets_company_id_user_id_pk" PRIMARY KEY("company_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"meta_template_id" text,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"language" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"quality" text DEFAULT 'unknown' NOT NULL,
	"header_text" text,
	"body" text NOT NULL,
	"footer" text,
	"buttons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejection_reason" text,
	"used_count" integer DEFAULT 0 NOT NULL,
	"submitted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"company_id" uuid NOT NULL,
	"date" date NOT NULL,
	"category" text NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"billable_count" integer DEFAULT 0 NOT NULL,
	"cost_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	CONSTRAINT "usage_daily_company_id_date_category_pk" PRIMARY KEY("company_id","date","category")
);
--> statement-breakpoint
CREATE TABLE "user_forwarding" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"rules" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text,
	"status" text DEFAULT 'active' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"signature" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"notify" jsonb DEFAULT '{"newChat":true,"newMessage":true,"missedCall":true,"sound":true,"desktop":true}'::jsonb NOT NULL,
	"avatar_color" text DEFAULT 'a1' NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_assigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid,
	"phone_number_id" text,
	"field" text NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "whatsapp_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"waba_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_phone" text,
	"verified_name" text,
	"name_status" text,
	"quality_rating" text,
	"messaging_limit" text,
	"calling_enabled" boolean DEFAULT false NOT NULL,
	"access_token_enc" text NOT NULL,
	"token_set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"webhook_subscribed_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"connected_by" uuid,
	"connect_method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_addons" ADD CONSTRAINT "ai_addons_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_addons" ADD CONSTRAINT "ai_addons_addon_plan_id_ai_addon_plans_id_fk" FOREIGN KEY ("addon_plan_id") REFERENCES "public"."ai_addon_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_bot_logs" ADD CONSTRAINT "ai_bot_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_bot_settings" ADD CONSTRAINT "ai_bot_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_training_examples" ADD CONSTRAINT "ai_training_examples_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_log" ADD CONSTRAINT "break_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_log" ADD CONSTRAINT "break_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_settings" ADD CONSTRAINT "call_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connect_links" ADD CONSTRAINT "connect_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_labels" ADD CONSTRAINT "contact_labels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_labels" ADD CONSTRAINT "contact_labels_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_labels" ADD CONSTRAINT "contact_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_owner_history" ADD CONSTRAINT "contact_owner_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_owner_history" ADD CONSTRAINT "contact_owner_history_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_user_state" ADD CONSTRAINT "conversation_user_state_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_user_state" ADD CONSTRAINT "conversation_user_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_user_state" ADD CONSTRAINT "conversation_user_state_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_as_user_id_users_id_fk" FOREIGN KEY ("as_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_menus" ADD CONSTRAINT "ivr_menus_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_rules" ADD CONSTRAINT "keyword_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_categories" ADD CONSTRAINT "media_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_favorites" ADD CONSTRAINT "media_favorites_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_favorites" ADD CONSTRAINT "media_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_favorites" ADD CONSTRAINT "media_favorites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_category_id_media_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."media_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_collection_id_product_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."product_collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_calls" ADD CONSTRAINT "scheduled_calls_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_calls" ADD CONSTRAINT "scheduled_calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_calls" ADD CONSTRAINT "scheduled_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_targets" ADD CONSTRAINT "staff_targets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_targets" ADD CONSTRAINT "staff_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_forwarding" ADD CONSTRAINT "user_forwarding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_forwarding" ADD CONSTRAINT "user_forwarding_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_bot_logs_company_idx" ON "ai_bot_logs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_training_examples_company_idx" ON "ai_training_examples" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "audit_logs_company_idx" ON "audit_logs" USING btree ("company_id","at");--> statement-breakpoint
CREATE INDEX "break_log_user_idx" ON "break_log" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "broadcast_recipients_message_idx" ON "broadcast_recipients" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "call_events_call_idx" ON "call_events" USING btree ("call_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_wa_uq" ON "calls" USING btree ("company_id","wa_call_id");--> statement-breakpoint
CREATE INDEX "calls_company_started_idx" ON "calls" USING btree ("company_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_uq" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "contact_labels_label_idx" ON "contact_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "contact_owner_history_contact_idx" ON "contact_owner_history" USING btree ("contact_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_company_wa_uq" ON "contacts" USING btree ("company_id","wa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_company_bsuid_uq" ON "contacts" USING btree ("company_id","bsuid");--> statement-breakpoint
CREATE INDEX "contacts_owner_idx" ON "contacts" USING btree ("company_id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_contact_uq" ON "conversations" USING btree ("company_id","contact_id");--> statement-breakpoint
CREATE INDEX "conversations_last_idx" ON "conversations" USING btree ("company_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_uq" ON "devices" USING btree ("push_token");--> statement-breakpoint
CREATE INDEX "files_company_idx" ON "files" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "flows_company_idx" ON "flows" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_uq" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invites_company_idx" ON "invites" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "keyword_rules_company_idx" ON "keyword_rules" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_company_idx" ON "knowledge_documents" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_company_name_uq" ON "labels" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "media_items_company_idx" ON "media_items" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_wa_uq" ON "messages" USING btree ("company_id","wa_message_id");--> statement-breakpoint
CREATE INDEX "messages_company_created_idx" ON "messages" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "presence_company_idx" ON "presence" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "products_company_idx" ON "products" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quick_replies_company_cmd_uq" ON "quick_replies" USING btree ("company_id","command");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_uq" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_calls_company_idx" ON "scheduled_calls" USING btree ("company_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_company_name_lang_uq" ON "templates" USING btree ("company_id","name","language");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_company_idx" ON "users" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_dedupe_uq" ON "webhook_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "webhook_events_received_idx" ON "webhook_events" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_accounts_company_uq" ON "whatsapp_accounts" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_accounts_phone_uq" ON "whatsapp_accounts" USING btree ("phone_number_id");