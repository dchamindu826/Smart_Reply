# Backend guide

How the API (`backend/`) is put together, for anyone adding a feature.

## Stack

NestJS 11 (Express), PostgreSQL with **Drizzle ORM** (`backend/src/db/schema.ts`, migrations in
`backend/drizzle`), Redis, BullMQ workers, Socket.IO with the Redis adapter, zod schemas from
`packages/shared`.

> The plan said Prisma. Drizzle was chosen instead because it has no native query engine to
> download (smaller Docker images, works offline) and keeps SQL visible. `docs/plan` is updated.

## Layout

```
backend/src/
  config.ts              environment (zod-validated)
  main.ts                API entry (createApp)
  worker.ts              worker entry: one BullMQ Worker per queue, job name → handler
  app.module.ts          registers every module
  common/                errors, validation (@ZBody/@ZQuery), auth guard, decorators, audit, crypto, tenant
  infra/                 db, redis, queues, realtime emitter, storage, mailer, rate limit, logger
  meta/                  Graph API client (graph.ts), platform settings + company WhatsApp accounts (platform.ts)
  core/                  shared domain services: files, inbox (presenters, visibility, owner change, events),
                         messaging (send + deliver), automation (inbound rules), push, hours
  modules/<area>/        controllers + services per area
  worker/                webhook processor, maintenance
backend/test/            integration tests (vitest + supertest) and helpers
```

## Rules

1. **Company scope.** Every query on business data filters by `companyId` from the session
   (`@Auth() s: CompanySession` → `s.companyId`). Never read a company id from the body or URL
   (except `/admin/...`). Use `findOwned(db, table, s.companyId, id, 'Thing')` to load one row:
   another company's id answers **404**.
2. **Staff visibility.** Staff see customers they own plus the team pool (owner null) unless the
   `seeAllChats` permission is on. Use `viewerOf(s)` + `contactVisibility(v)` or
   `inbox.visibleConversation / visibleContact`.
3. **Roles and permissions on the server.** No decorator = any manager or staff member of a company.
   `@Roles('manager')` = managers only. `@Roles('system_admin')` = LUMI AI admin routes.
   `@Perm('createTemplates')` = staff need that switch; managers always pass. `can(s, 'x')` inside services.
4. **Validation.** Request bodies use zod schemas from `@smart-reply/shared`:
   `@ZBody(schema) body: z.infer<typeof schema>`, `@ZQuery(schema)` for query strings.
5. **Errors.** `throw new AppError('CODE', 'Message for a person')`; codes are listed in
   `packages/shared/src/constants.ts` (`ERROR_CODES`). `notFound('Customer')`, `forbidden()`.
6. **Responses** use the types in `packages/shared/src/types.ts`. Times as ISO strings, money as
   `{ amountMinor, currency }`.
7. **Audit** every change to staff, permissions, ownership, templates, settings, billing and every
   admin action: `await this.audit.log(s, { action, targetType, targetId, summary })`.
8. **Meta calls** go through `WhatsappAccounts.require(companyId)` → `{ graph, phoneNumberId, wabaId }`.
   Wrap errors with `toAppError(err)` from `meta/graph.ts`. Never call Meta from a webhook request.
9. **Live events**: `Realtime.emit(rooms, event, payload)`; rooms from `infra/realtime.ts`
   (`rooms.managers(companyId)`, `rooms.user(userId)`, `rooms.company(companyId)`) or
   `inbox.roomsFor(companyId, ownerUserId)` for anything about one customer.
10. **Background work**: `queues.add('job.name', data, { jobId })`. Job names and data are typed in
    `infra/queues.ts` (`JobMap`). Handlers are wired in `src/worker.ts`. Handlers must be safe to run twice.
11. **Logs** never contain message text, full phone numbers (`maskPhone`) or tokens.
12. **No `any`.** Strict TypeScript.

## Tests

- `npm run test -w backend` runs every spec. Integration tests boot the real app against the test
  database (`TEST_DATABASE_URL`, default `smart_reply_test`), which `test/global-setup.ts` recreates
  from the migrations.
- Helpers in `test/helpers.ts`: `getApp()`, `createCompany({ staffCount, whatsapp })`,
  `createUser(companyId, role)`, `signIn(user)` → agent with `get/post/put/patch/delete`.
- Every permission or isolation rule gets a test: company A's manager asking for company B's row
  gets 404; staff calling a manager route gets 403.
- Meta is mocked by stubbing `global.fetch` (see `test/conversations.spec.ts`); `META_GRAPH_URL` is
  `http://meta.test` in tests.

## Database changes

Edit `src/db/schema.ts`, then `npm run db:generate -w backend` to write a new SQL migration in
`backend/drizzle`. Commit both. `npm run db:migrate` applies them (run on every deploy).
