# 03 · API contract

Base URL: `/api/v1`. JSON in and out. Field names are camelCase.
The company is always taken from the session. Paths never contain a company id, except
under `/admin`.

The request and response shapes live as schemas in `packages/shared`. Both the API and the
web app import them, so they cannot drift apart. The OpenAPI document is generated from the
same schemas and published at `/api/docs` in non-production environments.

## Conventions

| Topic | Rule |
|---|---|
| Lists | `?cursor=&limit=` and a response of `{ items, nextCursor }` |
| Errors | `{ error: { code, message, details? } }` with a fitting HTTP status. `code` is a stable string such as `WINDOW_CLOSED`, `SEAT_LIMIT_REACHED`, `CALL_PERMISSION_MISSING` |
| Not yours | A row from another company answers 404, never 403 |
| Writes | Accept an `Idempotency-Key` header on sends and on anything that calls Meta |
| Times | ISO 8601 UTC |
| Money | `{ amountMinor, currency }` |
| Files | The client asks for an upload URL, uploads straight to storage, then sends the returned `fileId` |
| Permissions | Marked below as **M** manager, **S** staff, **A** system admin. Staff access is always narrowed to what they own unless noted |

## Authentication

| Method and path | Who | Purpose |
|---|---|---|
| `POST /auth/login` | all | Email and password. Sets cookies (web) or returns tokens (mobile) |
| `POST /auth/refresh` | all | Rotate the refresh token |
| `POST /auth/logout` | all | Revoke this device |
| `POST /auth/forgot-password`, `POST /auth/reset-password` | all | Reset by emailed link |
| `GET /auth/invite/:token`, `POST /auth/invite/:token/accept` | invited | Set a password and join |
| `GET /me` | all | User, role, company, effective permissions, feature flags |
| `PATCH /me` | all | Name shown to customers, language, signature, notification switches |
| `POST /me/password` | all | Change password |
| `POST /me/devices`, `DELETE /me/devices/:id` | all | Register and remove push tokens |

## System admin (`/admin`, role A only)

| Method and path | Purpose |
|---|---|
| `GET /admin/companies`, `POST /admin/companies` | List; create a company with its first manager and plan |
| `GET /admin/companies/:id`, `PATCH /admin/companies/:id` | Details; change plan, seat limit (max 100), status |
| `POST /admin/companies/:id/suspend`, `/activate` | Stop or resume access |
| `GET /admin/companies/:id/users` | Managers and staff of a company, read only |
| `POST /admin/companies/:id/managers` | Add another manager |
| `POST /admin/companies/:id/impersonate` | Start a support session; needs a reason |
| `GET /admin/plans`, `POST /admin/plans`, `PATCH /admin/plans/:id` | Plans |
| `GET /admin/platform/meta`, `PUT /admin/platform/meta` | Meta app id, app secret, Graph version, Embedded Signup config id, system token. Secrets come back masked |
| `POST /admin/platform/meta/test` | Call Meta with the saved settings and report the result |
| `GET /admin/platform/webhook`, `PUT /admin/platform/webhook` | Callback URL (read only), verify token, subscribed fields |
| `GET /admin/webhook-events?company=&status=`, `POST /admin/webhook-events/:id/replay` | Recent events and failures; run a failed event again |
| `POST /admin/platform/webhook/test` | Send a test event through the pipeline |
| `GET /admin/companies/:id/whatsapp` | WABA id, phone number id, number, token state (masked), quality, limit, calling, webhook subscription |
| `POST /admin/companies/:id/whatsapp/connect` | Finish Embedded Signup with the code from Meta |
| `PUT /admin/companies/:id/whatsapp` | Enter or change WABA id, phone number id and token by hand |
| `POST /admin/companies/:id/whatsapp/connect-link` | A one-time link for the business owner that opens only Meta's login popup |
| `POST /admin/companies/:id/whatsapp/verify`, `/subscribe`, `/disconnect` | Re-check the number, re-subscribe the webhook, disconnect |
| `GET /admin/ai/platform`, `PUT /admin/ai/platform` | AI provider, key (masked), default model, default prompt and rules, global off switch |
| `GET /admin/ai/addon-plans`, `POST`, `PATCH /:id` | AI add-on price plans |
| `GET /admin/ai/companies` | Every company: add-on status, usage this month, cost, pending activation requests |
| `PUT /admin/companies/:id/ai/addon` | Activate, pause, set plan, expiry and monthly limit |
| `GET /admin/companies/:id/ai/settings`, `PUT` | The company's bot settings (all of `AIBotSettings`) |
| `GET /admin/companies/:id/ai/knowledge`, `POST`, `DELETE /:docId` | Training documents |
| `GET /admin/companies/:id/ai/examples`, `POST`, `DELETE /:exampleId` | Corrected question and answer pairs |
| `POST /admin/companies/:id/ai/simulate` | Test the company's bot; sends nothing to WhatsApp |
| `GET /admin/companies/:id/ai/logs`, `GET /admin/ai/logs` | Bot logs for one company or all |
| `GET /admin/usage` | Messages, calls, storage and Meta cost per company |
| `GET /admin/health` | Queue depth, webhook failures, numbers with low quality |
| `GET /admin/audit` | Platform audit log |

## Team

| Method and path | Who | Screen |
|---|---|---|
| `GET /staff` | M, S | Staff manage, Live status, owner pickers. Staff get names and presence only |
| `POST /staff/invites` | M | Add staff. Fails with `SEAT_LIMIT_REACHED` when seats are full |
| `DELETE /staff/invites/:id` | M | Cancel a pending invite |
| `PATCH /staff/:id` | M | Title, permissions switches |
| `DELETE /staff/:id` | M | Remove a staff member. Their contacts return to the team pool |
| `GET /staff/:id/summary` | M | Open chats, reply time, breaks, assigned customers, weekly target |
| `GET /roles`, `PATCH /roles/:role` | M | Roles and users matrix |
| `GET /seats` | M | Used, limit, plan |
| `GET /presence` | M | Everyone's call and chat status with `since` |
| `PUT /staff/:id/presence` | M | Set a staff member's status from Live status (for example, end a break) |
| `PUT /me/presence` | M, S | Body `{ channel: 'call'|'chat'|'both', status, reason?, plannedMinutes? }` |
| `GET /me/breaks`, `GET /breaks?date=` | S / M | Break log and minutes used against the daily limit |
| `GET /assignment-rules`, `PUT /assignment-rules` | M | Assignment rules |
| `GET /keyword-rules`, `POST`, `PATCH /:id`, `DELETE /:id` | M | Keyword rules |
| `GET /targets`, `PUT /targets` | M | Weekly targets |

## Customers

| Method and path | Who | Screen |
|---|---|---|
| `GET /contacts?search=&owner=&label=` | M, S | Customers and owners |
| `POST /contacts` | M, S | New customer |
| `POST /contacts/import` | M | CSV with name, number, owner |
| `GET /contacts/:id`, `PATCH /contacts/:id` | M, S | Contact panel |
| `PUT /contacts/:id/owner` | M, S | Body `{ ownerUserId: string|null, reason? }`. Staff may transfer their own, release to the pool, or take from the pool |
| `POST /contacts/bulk/owner` | M | Body `{ contactIds[], ownerUserId|null }` |
| `GET /contacts/:id/owner-history` | M, S | Owner history |
| `PUT /contacts/:id/labels` | M, S | Replace the label set |
| `POST /contacts/:id/block`, `DELETE /contacts/:id/block` | M, S | Block and unblock |
| `GET /contacts/:id/calls`, `GET /contacts/:id/media` | M, S | Contact info sections |
| `POST /contacts/:id/call-permission-request` | M, S | Send the permission request (see 04 for limits) |
| `GET /labels`, `POST /labels`, `PATCH /labels/:id`, `DELETE /labels/:id` | M (write), S (read) | Labels |

## Conversations and messages

| Method and path | Who | Purpose |
|---|---|---|
| `GET /conversations?filter=&owner=&label=&search=` | M, S | `filter`: `all`, `unread`, `expiring`, `labeled`, `no_owner`, `pool`, `favorites`, `archived`, `resolved` |
| `GET /conversations/counts` | M, S | Numbers for the menu badges and the "closing soon" banner |
| `GET /conversations/:id` | M, S | Header data including `windowExpiresAt` |
| `GET /conversations/:id/messages?cursor=` | M, S | Newest first, paged |
| `POST /conversations/:id/messages` | M, S | Body `{ type: 'text'|'image'|'audio'|'video'|'document', text?, fileIds?, replyToId? }`. Fails with `WINDOW_CLOSED` after the 24 hours |
| `POST /conversations/:id/notes` | M, S | Internal note. Never sent to Meta |
| `POST /conversations/:id/templates` | M, S | Body `{ templateId, variables }` |
| `POST /conversations/:id/products` | M, S | Send a catalog product |
| `POST /conversations/:id/quick-replies/:quickReplyId` | M, S | Send a saved reply with its attachments |
| `POST /conversations/:id/read` | M, S | Mark read. Also sends read receipts to Meta |
| `POST /conversations/:id/resolve`, `/reopen` | M, S | |
| `PUT /conversations/:id/state` | M, S | Body `{ favorite?, archived? }`, per person |
| `POST /conversations` | M, S | Start a chat with a contact by sending a template |
| `POST /files` | M, S | Returns `{ fileId, uploadUrl }`. Body gives name, MIME type and size; the server rejects sizes above WhatsApp's limits |
| `GET /files/:id` | M, S | Redirects to a short-lived signed URL |

## Content

| Method and path | Who | Screen |
|---|---|---|
| `GET /templates?status=`, `GET /templates/:id` | M, S | Message templates |
| `POST /templates` | M | Create and submit to Meta |
| `POST /templates/:id/resubmit`, `DELETE /templates/:id` | M | |
| `POST /templates/sync` | M | Pull the current list and statuses from Meta |
| `GET /quick-replies`, `POST`, `PATCH /:id`, `DELETE /:id` | M, S | Staff may change their own; shared ones need the manager unless the permission is on |
| `GET /catalog/collections`, `POST`, `PATCH /:id`, `DELETE /:id` | M (write), S (read) | Catalog |
| `GET /catalog/products`, `POST`, `PATCH /:id`, `DELETE /:id` | M (write), S (read) | Prices and offer prices |
| `GET /media?kind=&category=&search=&sort=`, `POST /media`, `PATCH /media/:id`, `DELETE /media/:id` | M (write), S (read, favourite) | Media gallery |
| `PUT /media/:id/favorite` | M, S | |
| `GET /media/categories`, `POST`, `DELETE /:id` | M | |
| `GET /broadcasts`, `POST /broadcasts`, `GET /broadcasts/:id` | M | |
| `POST /broadcasts/:id/send`, `/cancel` | M | |
| `GET /flows`, `POST`, `PATCH /:id`, `DELETE /:id` | M | Automated flows |

## Calls

| Method and path | Who | Purpose |
|---|---|---|
| `GET /calls?filter=&date=&staff=&search=` | M, S | Call log. `filter`: `all`, `missed`, `rejected`, `recorded`, `incoming`, `outgoing` |
| `GET /calls/:id` | M, S | Detail with recording link, transcript, summary |
| `POST /calls` | M, S | Start a call. Body `{ contactId }`. Fails with `CALL_PERMISSION_MISSING` |
| `POST /calls/:id/answer`, `/decline`, `/hangup` | M, S | `decline` accepts `{ messageText? }` |
| `POST /calls/:id/forward` | M, S | Body `{ destination }` |
| `POST /calls/:id/hold`, `/resume`, `/mute`, `/unmute` | M, S | Stage B |
| `POST /calls/:id/transfer` | M, S | Body `{ toUserId, mode: 'warm'|'blind' }`. Stage B |
| `POST /calls/:id/participants` | M, S | Add a colleague. Stage B |
| `POST /calls/:id/recording` | M, S | Body `{ action: 'pause'|'resume' }`. Stage B |
| `POST /calls/:id/notes` | M, S | Saved to the call and to the chat |
| `POST /calls/:id/summary-to-chat` | M, S | Adds the AI summary as an internal note |
| `POST /calls/:id/webrtc` | M, S | Signalling: exchange SDP and ICE for the agent's leg |
| `GET /scheduled-calls`, `POST`, `DELETE /:id` | M, S | Call scheduler |
| `GET /call-settings`, `PUT /call-settings` | M | |
| `GET /forwarding`, `PUT /forwarding` | M | Company rules |
| `GET /me/forwarding`, `PUT /me/forwarding` | M, S | Personal rules |
| `GET /ivr`, `PUT /ivr` | M | Whole menu in one document |
| `POST /ivr/greeting` | M | Upload or record the greeting |
| `POST /ivr/test` | M | Walk the menu with a key sequence, no real call |

## AI bot

| Method and path | Who | Purpose |
|---|---|---|
| `GET /ai/status` | M | Add-on state (`off`, `active`, `paused`, `expired`), plan, expiry, usage this month against the limit |
| `GET /ai/settings` | M | Read-only summary of what the bot is set to do. No prompt text, no keys |
| `GET /ai/logs?channel=` | M | Logs tab, read only |
| `POST /ai/activation-request` | M | Ask LUMI AI to activate or renew the add-on. Notifies system admins |
| `POST /conversations/:id/bot` | M, S | Body `{ active: boolean }`. Take over from the bot or hand back |

There is no manager endpoint that changes the bot. Activation, settings, training and the
simulator are under `/admin` only.

## Insight and setup

| Method and path | Who | Screen |
|---|---|---|
| `GET /dashboard` | M | Today at a glance |
| `GET /me/dashboard` | S | My day |
| `GET /reports?range=` | M | Reports |
| `GET /reports/progress?range=` | M | Progress |
| `GET /me/performance?range=` | S | My performance |
| `POST /exports` | M, S | Body `{ kind, format, params }`. Returns an export id; the file arrives by event |
| `GET /billing/usage?month=` | M | Meta usage and billing |
| `GET /billing/invoices` | M | Smart Reply invoices |
| `GET /business-profile`, `PUT /business-profile` | M | Also pushes to WhatsApp |
| `GET /whatsapp/account` | M | Number and quality, read only. Connecting is under `/admin` |
| `GET /integrations/webhook` | M | Status, last event, failures in 24 hours |
| `GET /integrations/events` | M | Recent webhook events (no message text) |
| `POST /integrations/test` | M | Send a test event through the pipeline |
| `GET /audit?actor=&action=&from=&to=` | M | Audit log |

## Webhook from Meta

| Method and path | Purpose |
|---|---|
| `GET /webhooks/whatsapp` | Verification handshake |
| `POST /webhooks/whatsapp` | All events. Verify signature, store, enqueue, answer 200 |

One URL serves every company. The worker finds the company from the `phone_number_id` in
the payload.

## Live events (WebSocket)

The client connects once after login. The server decides which rooms the socket joins.

| Event | Sent to | Payload |
|---|---|---|
| `message.created` | Owner, managers, anyone allowed to see the chat | The message, plus conversation preview fields |
| `message.status` | Same | `{ messageId, status, at }` |
| `conversation.updated` | Same | Changed fields: unread, window, status, owner, labels, bot state |
| `conversation.assigned` | New owner | Triggers the "new chat assigned to me" notice |
| `contact.updated` | Same as conversation | |
| `presence.updated` | Managers; staff get their own | `{ userId, channel, status, reason, since }` |
| `call.ringing` | Agents being rung | `{ callId, contact, ivrOption? }` |
| `call.updated` | Participants, managers | State changes: answered, held, recording, participants, ended |
| `call.signal` | The agent's device | SDP and ICE for the audio leg |
| `template.status` | Managers | Approved, rejected with reason |
| `broadcast.progress` | Managers | Sent, delivered, read, replied counts |
| `export.ready` | Requester | `{ exportId, url }` |
| `notice` | Target user or company | Text for a toast, such as "seat limit reached" |
| `session.revoked` | The user | Logged out elsewhere, disabled, or company suspended |

## Screen to endpoint map

| Screen id in the code | Reads | Writes |
|---|---|---|
| `dash` | `/dashboard`, `/presence`, `/whatsapp/account`, `/billing/usage` | `/exports` |
| `chats`, `inbox` | `/conversations*`, `/contacts/:id`, `/quick-replies`, `/templates`, `/staff` | message, note, template, read, resolve, owner, labels, block, state |
| `calls` | `/calls*`, `/contacts` | call actions, notes, exports |
| `contacts` | `/contacts`, `/staff` | owner, bulk owner, import, new |
| `labels` | `/labels` | label create, edit, delete |
| `aibot` | `/ai/status`, `/ai/settings`, `/ai/logs` | activation request only |
| `status` | `/presence`, `/breaks` | (manager may set a staff member's status) `PUT /staff/:id/presence` |
| `staff` | `/staff`, `/seats`, `/roles` | invites, edit, remove |
| `routing` | `/assignment-rules`, `/keyword-rules` | same |
| `progress` | `/reports/progress` | `/targets` |
| `gallery` | `/media*` | upload, edit, delete, favourite, send to chat |
| `templates` | `/templates` | create, resubmit, delete |
| `catalog` | `/catalog/*` | products, collections |
| `broadcasts` | `/broadcasts` | create, send, cancel |
| `quick` | `/quick-replies` | create, edit, delete |
| `callset` | `/call-settings` | same |
| `ivr` | `/ivr` | menu, greeting, test |
| `fwd` | `/forwarding`, `/me/forwarding` | same |
| `reports` | `/reports` | `/exports` |
| `billing` | `/billing/*` | |
| `business` | `/business-profile` | same |
| `number` | `/whatsapp/account` | none (read only) |
| `roles` | `/roles` | same |
| `integrations` | `/integrations/*` | test |
| `audit` | `/audit` | `/exports` |
| `mydash` | `/me/dashboard`, `/conversations?filter=`, `/me/breaks` | `/me/presence` |
| `myperf` | `/me/performance` | `/exports` |
| `profile` | `/me` | `/me`, `/me/password` |
