# 02 · Data model

PostgreSQL. Managed with Prisma migrations. All ids are UUID v7 unless stated. All times are
`timestamptz` in UTC; the client formats them for display.

Every table in the "Company data" sections has `company_id uuid not null` with an index, and
`created_at`, `updated_at`. Those columns are not repeated below.

## Platform tables (no company_id)

| Table | Key columns | Notes |
|---|---|---|
| `plans` | `name`, `seat_limit` (max 100), `price_minor`, `currency`, `features jsonb` | The plans LUMI AI sells |
| `companies` | `name`, `slug`, `plan_id`, `seat_limit`, `status` (`active`, `suspended`, `closed`), `timezone`, `locale`, `created_by` | One row per customer. `seat_limit` copies the plan and can be overridden, never above 100 |
| `users` | `company_id` (null for system admins), `role` (`system_admin`, `manager`, `staff`), `name`, `initials`, `title`, `email` unique, `phone`, `password_hash`, `status` (`invited`, `active`, `disabled`), `language`, `signature`, `notify jsonb`, `avatar_color`, `last_login_at` | A user belongs to one company |
| `refresh_tokens` | `user_id`, `token_hash`, `device`, `expires_at`, `revoked_at`, `replaced_by` | Rotated on every use |
| `invites` | `company_id`, `email`, `phone`, `role`, `token_hash`, `invited_by`, `expires_at`, `accepted_at` | A pending invite holds a seat |
| `password_resets` | `user_id`, `token_hash`, `expires_at`, `used_at` | |
| `devices` | `user_id`, `platform` (`android`, `ios`, `web`), `push_token`, `voip_token`, `last_seen_at` | For push notifications |
| `impersonations` | `admin_user_id`, `company_id`, `as_user_id`, `reason`, `started_at`, `ended_at` | Support access trail |

## Company data: settings

| Table | Key columns | Notes |
|---|---|---|
| `role_permissions` | `role`, `permissions jsonb` | The matrix from the Roles screen. One row per role per company |
| `user_permissions` | `user_id`, `overrides jsonb` | Per-person switches from Staff manage (`can_call`, `see_all_chats`, `create_templates`, `edit_prices`, `export_own`) |
| `whatsapp_accounts` | `waba_id`, `phone_number_id` unique, `display_phone`, `verified_name`, `name_status`, `username`, `access_token_enc`, `quality_rating`, `messaging_limit`, `calling_enabled`, `webhook_subscribed_at`, `connected_at`, `status` | One per company in the first release |
| `business_profiles` | `display_name`, `about`, `address`, `website`, `email`, `greeting_text`, `greeting_on`, `away_text`, `away_on` | Business profile screen |
| `call_settings` | `ring_strategy` (`all`, `round_robin`, `longest_idle`), `ring_seconds`, `record_auto`, `record_announce`, `record_pause_allowed`, `record_keep_days`, `link_previews`, `break_max_minutes`, `hours jsonb`, `holidays jsonb` | Call settings screen. Today: `CallConfig` |
| `forwarding_rules` | `user_id` (null = company default), `on_no_answer`, `on_busy`, `on_break`, `on_away`, `on_dnd`, `after_hours` | Each value is a destination: `queue`, `wait`, `msg`, `vm`, `user:<id>`, `manager` |
| `ivr_menus` | `enabled`, `greeting_mode` (`recording`, `tts`), `greeting_text`, `greeting_audio_key`, `wait_seconds`, `no_input_destination`, `after_hours_enabled` | One per company |
| `ivr_options` | `menu_id`, `digit`, `label`, `destination`, `position` | Destination may be a quick reply: `quick_reply:<id>` |
| `assignment_rules` | `auto_assign` (`off`, `round_robin`, `least_open`), `sticky_owner`, `max_open_chats`, `unassigned_alert_minutes`, `call_ring_owner_first`, `missed_call_template_id` | Assignment rules screen |
| `keyword_rules` | `keywords text[]`, `label_id`, `assign_user_id`, `quick_reply_id`, `enabled`, `match_count` | |
| `ai_bot_settings` | Columns matching `AIBotSettings` in `frontend/src/types/index.ts` | One per company |
| `knowledge_documents` | `title`, `source` (`upload`, `catalog`, `text`), `storage_key`, `status`, `chunks` | What the bot may answer from |

## Company data: people and presence

| Table | Key columns | Notes |
|---|---|---|
| `presence` | `user_id`, `channel` (`call`, `chat`), `status` (`available`, `on_call`, `break`, `away`, `dnd`), `reason`, `since`, `planned_minutes` | Two rows per user. Mirrored in Redis for speed |
| `break_log` | `user_id`, `reason`, `scope` (`call`, `chat`, `both`), `started_at`, `ended_at`, `planned_minutes` | Break log on Live status |
| `staff_targets` | `user_id`, `period` (`week`), `resolved_target` | Progress screen |

## Company data: customers and conversations

| Table | Key columns | Notes |
|---|---|---|
| `contacts` | `wa_id` (digits, unique per company), `bsuid`, `name`, `profile_name`, `city`, `owner_user_id`, `call_permission` (`none`, `requested`, `temporary`, `permanent`), `call_permission_expires_at`, `marketing_opt_in`, `blocked_at`, `first_seen_at`, `avatar_color` | `bsuid` is Meta's business-scoped user id; store it when a webhook provides it |
| `contact_owner_history` | `contact_id`, `from_user_id`, `to_user_id`, `actor_user_id`, `actor_kind` (`user`, `auto_assign`, `rule`), `reason`, `at` | Owner history panel |
| `labels` | `name`, `color`, `meaning`, `auto_rule jsonb` | Labels screen |
| `contact_labels` | `contact_id`, `label_id`, `added_by`, `added_at` | |
| `conversations` | `contact_id` unique per company, `status` (`open`, `resolved`), `last_message_at`, `last_preview`, `last_inbound_at`, `window_expires_at`, `unread_count`, `bot_active` | One per contact. `window_expires_at` = last inbound + 24 hours |
| `conversation_user_state` | `conversation_id`, `user_id`, `favorite`, `archived`, `last_read_at` | Per-person flags |
| `messages` | `conversation_id`, `direction` (`in`, `out`, `note`, `system`), `type` (`text`, `template`, `image`, `audio`, `video`, `document`, `sticker`, `interactive`, `location`, `contacts`, `note`, `system`), `body`, `wa_message_id` unique nullable, `sender_user_id`, `sender_kind` (`user`, `bot`, `system`, `customer`), `template_id`, `buttons jsonb`, `reply_to_id`, `status` (`queued`, `sent`, `delivered`, `read`, `failed`), `error jsonb`, `pricing_category`, `billable`, `sent_at`, `delivered_at`, `read_at` | Index `(conversation_id, created_at)` |
| `attachments` | `message_id`, `kind`, `file_name`, `mime`, `size_bytes`, `storage_key`, `wa_media_id`, `duration_seconds`, `width`, `height` | Media is copied into our storage because Meta's ids and URLs expire |

## Company data: content

| Table | Key columns | Notes |
|---|---|---|
| `templates` | `meta_template_id`, `name`, `category` (`utility`, `marketing`, `authentication`), `language`, `status` (`approved`, `pending`, `rejected`, `paused`, `disabled`), `quality`, `header jsonb`, `body`, `footer`, `buttons jsonb`, `rejection_reason`, `used_count`, `submitted_by` | Synced with Meta |
| `quick_replies` | `command` unique per company, `title`, `text`, `scope` (`everyone`, `only_me`), `owner_user_id`, `used_count` | |
| `quick_reply_attachments` | `quick_reply_id`, `kind`, `file_name`, `mime`, `size_bytes`, `storage_key` | |
| `product_collections` | `name`, `position` | Replaces the hard-coded kitchen/bathroom list |
| `products` | `collection_id`, `name`, `sku`, `price_minor`, `old_price_minor`, `price_unit`, `note`, `status` (`active`, `hidden`), `image_key` | Money in minor units, never as text |
| `media_categories` | `name` | Replaces the hard-coded `MediaCategory` type |
| `media_items` | `title`, `kind` (`image`, `video`), `storage_key`, `thumbnail_key`, `caption`, `size_bytes`, `duration_seconds`, `width`, `height`, `category_id`, `tags text[]`, `added_by`, `share_count`, `download_count` | Media gallery |
| `media_favorites` | `media_item_id`, `user_id` | |
| `broadcasts` | `name`, `label_id`, `template_id`, `variables jsonb`, `status` (`draft`, `scheduled`, `sending`, `done`, `failed`, `cancelled`), `scheduled_at`, `created_by` | |
| `broadcast_recipients` | `broadcast_id`, `contact_id`, `message_id`, `status` | Counts on the screen come from here |
| `flows` | `name`, `trigger jsonb`, `steps jsonb`, `enabled` | Automated flows (greeting, away, keyword). Manager only |

## Company data: calls

| Table | Key columns | Notes |
|---|---|---|
| `calls` | `contact_id`, `wa_call_id` unique, `direction` (`in`, `out`), `outcome` (`ringing`, `answered`, `missed`, `rejected`, `forwarded`, `transferred`, `failed`), `handled_by_user_id`, `ivr_option_id`, `started_at`, `answered_at`, `ended_at`, `duration_seconds`, `note`, `recording_key`, `recording_seconds`, `transcript jsonb`, `ai_summary`, `summary_message_id` | |
| `call_events` | `call_id`, `kind` (`ring`, `answer`, `hold`, `resume`, `mute`, `transfer`, `conference_add`, `record_start`, `record_pause`, `hangup`, `dtmf`), `actor_user_id`, `data jsonb`, `at` | Full trail of what happened on a call |
| `scheduled_calls` | `contact_id`, `user_id`, `scheduled_at`, `note`, `status` | Call scheduler |

## Company data: insight and trail

| Table | Key columns | Notes |
|---|---|---|
| `audit_logs` | `actor_user_id`, `actor_kind`, `action`, `target_type`, `target_id`, `summary`, `meta jsonb`, `source` (`web`, `mobile`, `system`, `meta`), `at` | Append only |
| `usage_daily` | `date`, `category`, `delivered_count`, `billable_count`, `cost_minor`, `currency` | Filled from message status events |
| `stats_daily` | `date`, `user_id`, `chats_handled`, `chats_resolved`, `first_reply_seconds_avg`, `calls_answered`, `calls_missed`, `break_minutes` | Reports, Progress, My performance |
| `ai_bot_logs` | Columns matching `AIBotLog` | |
| `webhook_events` | `phone_number_id`, `field`, `dedupe_key` unique, `payload jsonb`, `received_at`, `processed_at`, `error` | Raw inbox. `company_id` is filled after routing |
| `exports` | `kind`, `params jsonb`, `status`, `storage_key`, `requested_by` | CSV, XLSX and PDF downloads |

## Mapping from today's front-end types

`frontend/src/types/index.ts` uses one- and two-letter field names and stores display text
instead of data. The API returns the clear names below. Phase 1 renames the front-end types
to match.

### Staff

| Today | Meaning | API field |
|---|---|---|
| `n`, `i` | Name, initials | `name`, `initials` |
| `st`, `stt` | CSS state and status text | Derived on the client from `presence` |
| `open` | Open chats | `stats.openChats` |
| `rep` | Average reply time as text | `stats.avgFirstReplySeconds` |
| `calls`, `miss` | Calls today, missed | `stats.callsToday`, `stats.callsMissed` |
| `done` | Weekly target progress, percent | `stats.targetPercent` |
| `res` | Resolved count | `stats.resolved` |
| `call`, `chat` | Channel status objects | `presence.call`, `presence.chat` with `status`, `reason`, `since`, `plannedMinutes` |
| `used`, `log` | Break minutes used, break log | `breaks.usedMinutes`, `breaks.entries[]` |

### Contact

| Today | Meaning | API field |
|---|---|---|
| `n`, `i`, `a` | Name, initials, avatar colour class | `name`, `initials`, `avatarColor` |
| `ph` | Phone as formatted text | `phone` in E.164; the client formats it |
| `since`, `city` | First seen (text), city | `firstSeenAt`, `city` |
| `to` | Owner staff id | `ownerUserId` |
| `perm` | Call permission (true/false) | `callPermission` with `status` and `expiresAt` |
| `labels` | `[name, colour]` pairs | `labels[]` of `{ id, name, color }` |
| `hist` | `[when, what, by]` rows | `GET /contacts/:id/owner-history` |

### Conversation and message

| Today | Meaning | API field |
|---|---|---|
| `c` | Contact id | `contactId` |
| `pv`, `t` | Preview text, time text | `lastPreview`, `lastMessageAt` |
| `un` | Unread count | `unreadCount` |
| `win`, `exp` | Hours left, expiry in ms | `windowExpiresAt` only |
| `msgs` | Messages inline | Fetched separately and paged |
| `dir`, `type` | Direction and type | `direction`, `type` |
| `time` | `HH:MM` text | `createdAt` |
| `sender` | A name, or a template name | `sender` object: `{ kind, userId, name }`; `templateName` separately |
| `read` | 0 or 1 | `status`: `queued`, `sent`, `delivered`, `read`, `failed` |
| (missing) | No id on messages | `id` |

### Call log

| Today | Meaning | API field |
|---|---|---|
| `c` | Contact id | `contactId` |
| `d` | Kind | `direction` + `outcome` |
| `t` | `Today 10:50` or a date as text | `startedAt` |
| `dur` | `4:32` text | `durationSeconds` |
| `by` | Staff name | `handledBy` object |
| `rec`, `ai` | 0/1 flags | `hasRecording`, `hasSummary` |
| (missing) | No id | `id` |

### Template, product, quick reply

| Today | API field |
|---|---|
| Template `n`, `cat`, `lang`, `st`, `stt`, `q`, `used`, `body`, `why`, `btn` | `name`, `category`, `language`, `status`, (text derived), `quality`, `usedCount`, `body`, `rejectionReason`, `buttons` |
| Product `n`, `col`, `p`, `old`, `note`, `k`, `sku`, `st` | `name`, `collectionId`, `priceMinor`, `oldPriceMinor`, `note`, `imageUrl`, `sku`, `status` |
| Quick reply `cmd`, `t`, `x`, `att`, `used`, `by` | `command`, `title`, `text`, `attachments`, `usedCount`, `owner` |

Templates, products and quick replies have no id today, and quick replies are edited and
deleted by array position (`AppContext.tsx`, `updateQuickReply` and `deleteQuickReply`).
All three get an `id`.

## Data rules worth stating once

- **One conversation per contact.** Resolving it closes it; the next inbound message reopens
  the same row.
- **The 24-hour window is decided by the server.** `window_expires_at` moves only when a
  customer message arrives. The send endpoint refuses free-form messages after it and tells
  the client to use a template.
- **Message status only moves forward**: queued → sent → delivered → read. A late "delivered"
  after "read" is ignored.
- **Ownership changes always write history** and a system note in the conversation, as the
  front end already shows.
- **Money is integers** in minor units with a currency code.
- **Deleting a staff member** disables the user and frees the seat. Their messages and calls
  keep the link. Their contacts go back to the team pool.
- **Deleting a company** is a status change. Data is removed by a scheduled job after the
  retention period.
