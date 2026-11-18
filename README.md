# Smart Reply by LUMI AI

Multi-company WhatsApp chat and call management. LUMI AI (super admin) sells it to companies;
each company's manager and up to 100 staff answer their WhatsApp chats and calls from the web
app and the mobile app.

| Part | Folder | Stack |
|---|---|---|
| Web app (manager, staff, super admin console) | `frontend/` | Next.js 16, React 19, TypeScript, TanStack Query, Socket.IO |
| API and background workers | `backend/` | NestJS 11, PostgreSQL (Drizzle ORM), Redis, BullMQ, Socket.IO |
| AI voice agent (answers WhatsApp calls) | `backend/src/voice/` | werift WebRTC + Opus, Google Gemini Live and TTS; see docs/deploy.md |
| Mobile app (Android, iOS) | `flutter_app/` | Flutter (Dart) |
| Mobile app, React Native version | `mobile/` | Expo / React Native, TypeScript |
| Shared API types and validation | `packages/shared/` | TypeScript, zod |
| Server deployment | `infra/` | Docker Compose, Caddy (automatic HTTPS) |

## Run it on your computer

Needs Node.js 22+, PostgreSQL 16 and Redis 7 (or Docker for those two).

```bash
npm install
cp backend/.env.example backend/.env      # set DATABASE_URL, REDIS_URL, JWT_SECRET, ENCRYPTION_KEY
npm run db:migrate:dev -w backend         # create tables
npm run db:seed:dev -w backend            # plans + first super admin (SEED_ADMIN_* in backend/.env)
npm run db:seed:demo -w backend           # optional demo company (development only)
npm run dev                               # API :4000, worker, voice agent, web :3000
```

Open http://localhost:3000. Demo logins: `manager@demo.test`, `staff1@demo.test`,
password `Demo12345!`; super admin from your `SEED_ADMIN_EMAIL`.

For live events in development set `NEXT_PUBLIC_SOCKET_URL=http://localhost:4000` in
`frontend/.env.local`.

Postgres and Redis with Docker:

```bash
docker run -d --name sr-pg -e POSTGRES_USER=smart -e POSTGRES_PASSWORD=smart -e POSTGRES_DB=smart_reply -p 5432:5432 postgres:16-alpine
docker run -d --name sr-redis -p 6379:6379 redis:7-alpine
```

## Checks

```bash
npm run lint
npm run typecheck
npm run test      # backend tests need the database smart_reply_test (see backend/test/env.ts)
npm run build
```

## Put it on a server

See **[docs/deploy.md](docs/deploy.md)** — one server, `docker compose up -d --build`.

## Documents

- [docs/deploy.md](docs/deploy.md) — production setup, Meta app, backups
- [docs/dev/backend-guide.md](docs/dev/backend-guide.md) and [docs/dev/frontend-guide.md](docs/dev/frontend-guide.md) — how the code is organised
- [docs/plan/](docs/plan/README.md) — architecture, data model, API contract, WhatsApp integration, phases
- [flutter_app/README.md](flutter_app/README.md) — running and publishing the Flutter mobile app
- [mobile/README.md](mobile/README.md) — the React Native version
- [AGENTS.md](AGENTS.md) — rules for coding agents (Antigravity, Claude, Copilot)
