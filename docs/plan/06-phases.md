# 06 · Build phases

Phase 0 is setup; phases 1 to 9 build the product. Each ends with something that works and can be shown.
Do them in order; later phases assume earlier ones.

No time estimates are given. How long a phase takes depends on how much review you give
the agent's work, and that is not knowable from here.

| Phase | Result |
|---|---|
| 0 | Repository set up; the current app builds in CI |
| 1 | The front end restructured on a mock server; looks identical |
| 2 | Real login, companies, managers, staff, seats, system admin console |
| 3 | A company connects a WhatsApp number; chats work for real |
| 4 | Customers, owners, labels, assignment, quick replies, notes, presence |
| 5 | Templates, broadcasts, catalog, media gallery, business profile, billing |
| 6 | Calls: simple first, then the media server features |
| 7 | AI bot, reports, dashboards, exports |
| 8 | Mobile app |
| 9 | Hardening and launch |

## How to run a phase with a coding agent

- Paste the phase prompt. It names the documents to read.
- Ask for a short plan first, then let it work in small pull requests.
- Every pull request must pass lint, type-check, tests and build.
- At the end, walk the "done when" list yourself in the browser.

---

## Phase 0 · Foundation

**Tasks**
1. Root npm workspaces: `frontend`, `backend`, `packages/shared`. One lockfile.
2. In `frontend`: run install, lint, type-check, build. Record and fix failures. Add
   Prettier and the scripts listed in 05.
3. Scaffold `backend` (NestJS, strict TypeScript), `packages/shared` (schemas with zod),
   `infra/docker-compose.dev.yml` with PostgreSQL, Redis and MinIO.
4. `.env.example` for each package; a typed environment reader.
5. GitHub Actions: lint, type-check, test, build for each package on every pull request.
6. Take the visual baseline: a Playwright script that opens every screen for both roles in
   light and dark and saves screenshots.
7. Move `frontend/Smart Reply Admin Console.html` to `docs/prototype/`.

**Done when**
- A fresh clone runs with `npm ci` and `npm run dev`.
- CI is green on `main`.
- The baseline screenshots are committed.

**Prompt**
```
Read AGENTS.md and docs/plan/README.md, 01-architecture.md and 05-frontend-production.md.
Do Phase 0 from docs/plan/06-phases.md. Do not change any screen's appearance.
Start by running install, lint, type-check and build in frontend/ and tell me what fails.
Then propose the list of pull requests before writing code.
```

---

## Phase 1 · Front-end restructure on a mock server

Follow [05-frontend-production.md](05-frontend-production.md), steps 2 to 8 and 10.

**Tasks**
1. Write the API schemas in `packages/shared` from [03-api-contract.md](03-api-contract.md).
2. Typed API client and socket client in `frontend/src/lib`.
3. A mock server (MSW) that implements the contract with data seeded from today's
   `mockData.ts`, including mock socket events.
4. Routes per screen; rail links; redirects from the old `?screen=` ids.
5. Rename types and fields; ISO dates; ids everywhere.
6. Replace `AppContext` data with query hooks per feature. Keep a small interface-state
   context.
7. Loading, empty, error and no-access states on every screen.
8. Move simulators and mock data to `src/dev/` behind `NEXT_PUBLIC_DEMO`.
9. Replace the 37 message-only buttons with working forms against the mock server.
10. Unit and component tests; first end-to-end tests.

**Done when**
- The 05 "done when" list passes.
- The visual comparison shows no unintended change.
- Switching `NEXT_PUBLIC_API_URL` between the mock server and a real server needs no code
  change.

**Prompt**
```
Read AGENTS.md and docs/plan/02-data-model.md, 03-api-contract.md and 05-frontend-production.md.
Do Phase 1 from docs/plan/06-phases.md. The design is final: do not change layout, class
names, wording, colours or themes. After each pull request, run the visual comparison
against the baseline and report any difference.
Work screen group by screen group: shell and routing first, then chats, calls, customers,
team, content, setup.
```

---

## Phase 2 · Accounts, companies, seats, system admin

**Tasks**
1. Prisma schema and migrations for the platform tables and `role_permissions`,
   `user_permissions`, `audit_logs`.
2. Auth endpoints, password hashing, token rotation, rate limits, invitation and reset
   emails (through a mail provider interface; log to console in development).
3. Session guard, role guard, permission guard, and the company-scoped repository layer.
4. Team endpoints: staff list, invites, edit, remove, seats, roles matrix.
5. `/admin` endpoints: companies, plans, suspend, impersonate, and platform Meta settings
   (app id, app secret, Graph version, verify token) stored encrypted and returned masked.
6. Front end: login, forgot, reset, accept-invite pages; remove the role switch; permission
   helper; Staff manage and Roles screens on the real API; the system admin screens from 05.
7. Seed script: one system admin, two demo companies with a manager and staff each.
8. The cross-company test from 01 (company A cannot read company B).

**Done when**
- A system admin creates a company and its manager. The manager logs in, invites staff, the
  staff member accepts and logs in.
- The 101st invite is refused. A plan with 5 seats refuses the 6th.
- A staff member cannot open manager pages or call manager endpoints.
- A removed staff member is logged out at once and cannot log in.
- Suspending a company logs everyone in it out.
- Every one of these actions appears in the audit log.

**Prompt**
```
Read AGENTS.md and docs/plan/01-architecture.md, 02-data-model.md and 03-api-contract.md
(Authentication, System admin, Team sections).
Do Phase 2 from docs/plan/06-phases.md in backend/ and frontend/.
Write the cross-company isolation test before the endpoints it covers.
The new login and system admin screens must reuse the existing styles in globals.css.
```

---

## Phase 3 · WhatsApp connection and real chats

Read [04-whatsapp-integration.md](04-whatsapp-integration.md) first. Needs a Meta app and a
test number (see the list in the plan README).

**Tasks**
1. `whatsapp_accounts`, `contacts`, `conversations`, `messages`, `attachments`,
   `webhook_events` tables.
2. Webhook endpoint: verification, signature check on the raw body, store, enqueue.
3. Worker: route by phone number id, dedupe, handle incoming text and media, status updates.
4. A Graph API client with retries, back-off and error mapping. Token encryption.
5. Send text and media through the queue; upload flow with size and type checks; voice note
   conversion to OGG Opus.
6. 24-hour window logic on the server; `WINDOW_CLOSED` error; send template endpoint.
7. WebSocket gateway and the `message.*` and `conversation.*` events.
8. Connect flow in the **system admin** console: Embedded Signup on the company's WhatsApp
   tab, `POST /admin/companies/:id/whatsapp/connect`, the one-time connect link, manual
   entry of WABA id, phone number id and token, verify, re-subscribe, disconnect. The
   manager's Number & quality screen is read only. Admin Webhook screen: recent events,
   failures, run again, test event. A manual
   "paste token and ids" path for development only.
9. Front end: Chats screen on the real API and socket; unread counts; read receipts.
10. Integrations screen shows real webhook status and recent events.
11. A recorded set of real webhook payloads as test fixtures.

**Done when**
- A message sent from a phone to the test number appears on screen within two seconds.
- A reply from the screen arrives on the phone; ticks move to delivered and read.
- Images, voice notes and documents work both ways.
- After 24 hours of silence the composer offers templates only, and the server refuses a
  free-form send.
- Sending the same webhook payload twice creates one message.
- Stopping the worker for a minute loses nothing.
- A manager cannot connect, change or disconnect the number, from the screen or by calling
  the API directly.

**Prompt**
```
Read AGENTS.md and docs/plan/04-whatsapp-integration.md, 02-data-model.md and
03-api-contract.md (Conversations and messages, Webhook, Live events).
Do Phase 3 from docs/plan/06-phases.md.
Before using any Graph API endpoint, open the Meta documentation page linked in 04 and
confirm the request shape; items marked "(confirm)" must be confirmed and the document updated.
Build the webhook pipeline first with fixture payloads, then sending, then the connect flow.
```

---

## Phase 4 · Customers, ownership, team working

**Tasks**
1. Owner changes with history and system notes; bulk assign; staff transfer, release, take.
2. Labels and label rules; conversation filters (`unread`, `expiring`, `labeled`,
   `no_owner`, `pool`, `favorites`, `archived`).
3. Assignment rules: round robin, sticky owner, open-chat cap, unassigned alert, keyword
   rules.
4. Internal notes; resolve and reopen; block and unblock; per-person favourite and archive.
5. Quick replies with attachments and `everyone` / `only_me` scope; the `/` command list
   (`/note`, `/resolve`, `/template`, `/catalog`, `/assign`).
6. Presence for calls and chats, breaks with reason and planned length, daily break limit,
   Live status screen, break log.
7. Customers & owners, Labels, Assignment rules, Live status, My day on the real API.
8. Visibility rules enforced on the server: staff see their own customers and the pool.

**Done when**
- A new customer's first message is assigned by the active rule, and a returning customer
  goes to their owner.
- A staff member sees only their customers and the pool; the manager sees all.
- Transfer, release and take each write owner history and a note in the chat.
- A break over the planned length shows as over time on Live status.

**Prompt**
```
Read AGENTS.md and docs/plan/01-architecture.md (Roles), 02-data-model.md and
03-api-contract.md (Team, Customers, Conversations).
Do Phase 4 from docs/plan/06-phases.md.
Every visibility rule needs a test that logs in as staff and proves the hidden rows are 404.
```

---

## Phase 5 · Templates, broadcasts, catalog, media, profile, billing

**Tasks**
1. Templates: create, submit, sync, status webhooks, rejection reasons, send with variables.
2. Broadcasts: audience from a label with opt-in, rate-limited sending, live counts, cancel,
   stop on quality drop.
3. Catalog: collections, products, prices and offer prices, images, send a product in chat.
4. Media gallery: upload with checks, categories, tags, favourites, send to chat, counters.
5. Business profile read and write; greeting and away messages as flows.
6. Number & quality from the account object and quality webhooks.
7. Usage: fill `usage_daily` from status events; Billing screen.
8. Audit log screen with filters and export.

**Done when**
- A template created on screen appears in Meta's manager, and its approval arrives without
  a refresh.
- A broadcast to a label reaches only opted-in contacts and its counts move live.
- The Billing screen's totals equal the sum of billable status events for the month.

**Prompt**
```
Read AGENTS.md and docs/plan/04-whatsapp-integration.md (Templates, Broadcasts, Business
profile) and 03-api-contract.md (Content, Insight and setup).
Do Phase 5 from docs/plan/06-phases.md.
```

---

## Phase 6 · Calls

**Stage A tasks**
1. Enable calling and write call hours through the settings endpoint; show why when the
   number does not qualify.
2. `calls` webhook handling; `calls` and `call_events` tables.
3. Call permission: request, limits, reply webhook, the three states on the contact.
4. Signalling relay between the agent's browser and Meta; ring by assignment rules with
   one agent's device answering.
5. Incoming ring, answer, decline, decline with message, mute, hang up, missed-call
   template, outgoing call, notes, call log with filters.
6. Calls screen and the incoming call widget on real events.

**Stage A done when**
- A call from a phone rings the owner's browser, is answered, and both sides hear each
  other. The log shows the right length.
- An unanswered call is logged as missed and the customer receives the missed-call message.
- An outgoing call is refused with a clear reason when permission is missing, and works
  after the customer accepts.

**Proof of concept (before Stage B)**
Run the test described in 04, "The design problem". Write the decision into 04.

**Stage B tasks**
1. Deploy the chosen media server; TURN server for agents behind firewalls.
2. IVR greeting, menu, key presses, no-input path, after-hours path, test tool.
3. Queue ringing: ring all, round robin, longest idle; ring time; next person.
4. Forwarding by state: no answer, busy, break, away, do not disturb, after hours;
   company and personal rules.
5. Hold, transfer (warm and blind), add a colleague.
6. Recording with announcement, pause and resume, retention, playback and download.
7. Call scheduler with reminders.

**Stage B done when**
- Every control in `ActiveCallModal.tsx` does what its label says on a real call.
- A recording plays back from the call log and is deleted after the retention period.
- The IVR test tool and a real call take the same path.

**Prompt (Stage A)**
```
Read AGENTS.md and docs/plan/04-whatsapp-integration.md (Calling) and 03-api-contract.md (Calls).
Do Phase 6 Stage A from docs/plan/06-phases.md. Do not build any Stage B feature.
Confirm each calling endpoint against the linked Meta pages before using it.
```

**Prompt (proof of concept)**
```
Read docs/plan/04-whatsapp-integration.md, section "The design problem: who holds the audio".
Build the proof of concept for both options in a throwaway folder, on the test number.
Report which steps worked, how much custom code each needed, and recommend one.
Do not merge the proof of concept; update 04 with the decision.
```

---

## Phase 7 · AI bot, reports, exports

**Tasks**
1. AI add-on: `ai_addons` and `ai_addon_plans`; activate, pause, expiry, monthly limit,
   usage counters; manager's activation request; global off switch.
2. AI provider interface; chat bot worker that runs only while the add-on is active;
   handoff rules; bot logs; per-conversation take-over and hand-back.
3. System admin AI console: platform settings, add-on plans, companies list, and per
   company the full bot settings, knowledge documents, training examples and simulator.
4. Manager's AI Bot screen made read only: state, usage, summary, logs, request activation.
5. Knowledge documents, training examples and catalog as bot context.
6. Transcript and summary for recorded calls; "add summary to chat".
7. Voice bot, only if Stage B is complete and speech quality tests pass.
8. `stats_daily` job; Dashboard, Reports, Progress, My day, My performance on real numbers.
9. Exports as background jobs: CSV, XLSX, PDF.

**Done when**
- With the bot on, a customer question covered by the knowledge base gets a correct reply,
  and a complaint is handed to a person with a note.
- With the add-on off, paused or expired for a company, or the monthly limit used up, the
  bot sends nothing and no customer text leaves the platform to the AI provider.
- A manager cannot change any bot setting, from the screen or by calling the API directly.
- A system admin activates the add-on for one company and the other companies are unaffected.
- Report totals equal direct database counts for the same range.

**Prompt**
```
Read AGENTS.md and docs/plan/04-whatsapp-integration.md (AI bot), 02-data-model.md and
03-api-contract.md (AI bot, Insight).
Do Phase 7 from docs/plan/06-phases.md. Put the AI provider behind one interface with a
fake implementation for tests.
```

---

## Phase 8 · Mobile app

See [07-mobile-app.md](07-mobile-app.md).

**Prompt**
```
Read AGENTS.md and docs/plan/07-mobile-app.md and 03-api-contract.md.
Build the Flutter app in mobile/ in the order given in 07. It uses the same API and events
as the web app; do not add mobile-only endpoints without updating 03.
```

---

## Phase 9 · Hardening and launch

**Tasks**
1. PostgreSQL row-level security on all company tables.
2. Security review: authentication, permissions, file handling, webhook, rate limits,
   headers, secrets, dependency scan. Fix findings.
3. Load test to the targets in 01.
4. Backups, restore drill, monitoring, alerts (see [08-deployment.md](08-deployment.md)).
5. Two-step login for managers and system admins.
6. Data retention jobs; company data export and deletion on request.
7. Meta App Review submission with the screen recording.
8. Onboard one pilot company and watch a full week before opening sales.

**Done when**
- The launch checklist in 08 is fully ticked.

**Prompt**
```
Read AGENTS.md and docs/plan/01-architecture.md (Security baseline, Tenant isolation) and
08-deployment.md. Do Phase 9 from docs/plan/06-phases.md.
List every finding from the security review with its fix, and do not close one without a test.
```
