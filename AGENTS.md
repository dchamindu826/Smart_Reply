# Instructions for coding agents

Smart Reply is a multi-company WhatsApp chat and call management product by LUMI AI.
The full plan is in [`docs/plan/`](docs/plan/README.md). Read the documents a task names
before writing code.

## Rules that always apply

1. **The front-end design is final.** Do not change layout, class names, wording, colours,
   themes or wallpapers in `frontend/` unless the task says so. New screens reuse the
   styles in `frontend/src/app/globals.css`.
2. **Work one phase at a time**, in the order in `docs/plan/06-phases.md`. Do not build
   features from a later phase.
3. **Every row of business data belongs to one company.** Take the company from the
   session, never from the request. Go through the company-scoped repository layer. A row
   from another company answers 404.
4. **Permissions are checked on the server.** Hiding a button is not a permission check.
5. **The API contract lives in `packages/shared`.** Change the schema there first; the
   front end and back end both import it. Keep `docs/plan/03-api-contract.md` in step.
6. **Meta facts must be confirmed.** Before calling a Graph API endpoint, open the Meta
   documentation linked in `docs/plan/04-whatsapp-integration.md`. If the document is
   wrong or says "(confirm)", fix the document in the same pull request.
7. **Webhooks: verify, store, enqueue, answer 200.** No processing inside the request.
   Every handler must be safe to run twice.
8. **No demo data in production code.** Mock data and simulators live in
   `frontend/src/dev/` only.
9. **No secrets in the repository.** Add new settings to `.env.example` with a comment.
10. **No customer message text or full phone numbers in logs.**

## Working method

- Propose a short plan and the list of pull requests before starting a phase.
- Keep pull requests small and focused on one thing.
- Each pull request passes `lint`, `typecheck`, `test` and `build` for every package it touches.
- Write the test for a permission or isolation rule before the code it covers.
- When a decision in `docs/plan/` proves wrong, change the document and say why in the
  pull request.
- Ask before adding a new service, a paid dependency, or a library that duplicates one
  already in use.

## Conventions

| Topic | Rule |
|---|---|
| Language | TypeScript, strict mode, no `any` |
| API fields | camelCase; ISO 8601 UTC times; money as `{ amountMinor, currency }` |
| Database | snake_case; UUID v7 ids; `timestamptz`; migrations through Prisma only |
| Errors | `{ error: { code, message } }` with stable `code` strings |
| Commits | Imperative subject with a scope, for example `feat(chats): send template outside window` |
| Front-end data | TanStack Query hooks in `frontend/src/features/*`; no fetching inside components |
| Tests | Unit tests next to the code; end-to-end tests in `frontend/e2e` and `backend/test` |

## Commands

These are the commands the plan expects to exist after Phase 0.

```
npm ci                      install everything
npm run dev                 web, API, worker and local services
npm run lint                all packages
npm run typecheck           all packages
npm run test                all packages
npm run build               all packages
npm run e2e                 end-to-end tests
npm run visual              compare screens against the committed baseline
```
