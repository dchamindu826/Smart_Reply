# 08 · Deployment and operations

## Environments

| Environment | Purpose | WhatsApp |
|---|---|---|
| Local | Development. `infra/docker-compose.dev.yml` runs PostgreSQL, Redis, MinIO | Mock server, or the test number through a tunnel |
| Staging | A copy of production for testing each release | A test number and a separate Meta app |
| Production | Customers | Real numbers, the reviewed Meta app |

Staging and production never share a database, a storage bucket or a Meta app.

## First production setup: one VPS

Enough for the first release targets in 01. Everything runs in Docker Compose.

| Container | Notes |
|---|---|
| Reverse proxy (Caddy or Nginx) | TLS certificates, HTTP to HTTPS, WebSocket upgrade, request size limits |
| `web` | Next.js, `next start` |
| `api` | NestJS HTTP and WebSocket |
| `worker` | Same image as `api`, started in worker mode. Run two |
| `postgres` | Data on a separate volume |
| `redis` | Append-only file on |
| `minio` | Or an external S3-compatible bucket, which is safer for recordings |
| Media server and TURN | Added in Phase 6. Needs open UDP ports and a public IP; plan a second server |

Suggested starting size: 4 vCPU, 8 GB RAM, 160 GB SSD, in a region close to Sri Lanka
(Singapore or Mumbai) to keep call audio delay low. Measure before resizing.

When to move beyond one server: the database and Redis go to managed services first, then
`api` and `worker` scale out behind the proxy. The WebSocket gateway already fans out through
Redis, so adding API instances needs no code change.

## Configuration

All settings come from environment variables. Each package has an `.env.example`. Secrets
are never committed.

| Group | Examples |
|---|---|
| Core | `DATABASE_URL`, `REDIS_URL`, `APP_URL`, `API_URL`, `NODE_ENV` |
| Security | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `COOKIE_DOMAIN` |
| Meta | `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_EMBEDDED_SIGNUP_CONFIG_ID` |
| Storage | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` |
| Mail and push | `MAIL_*`, `FCM_*`, `APNS_*` |
| AI | `AI_PROVIDER`, `AI_API_KEY` |
| Monitoring | `SENTRY_DSN`, `LOG_LEVEL` |

`TOKEN_ENCRYPTION_KEY` protects every company's Meta token. Keep it outside the server's
disk backups and write down how to rotate it.

## Releases

1. A pull request merges to `main` only with CI green.
2. CI builds Docker images tagged with the commit and pushes them to a registry.
3. Staging deploys automatically. Production deploys on a manual approval.
4. Database migrations run before the new containers start. Every migration must work with
   the previous version of the code still running, so a rollback is only a container swap.
5. Workers finish their current job before stopping.
6. Keep the last five images for rollback.

## Backups

| What | How | Keep |
|---|---|---|
| PostgreSQL | Nightly full dump plus continuous write-ahead log archiving to another provider | 30 days |
| Object storage | Bucket versioning, or nightly sync to a second bucket | Per retention settings |
| Redis | Not a source of truth. Queues can be rebuilt from `webhook_events` and message status |  |
| Configuration | Environment files in a password manager |  |

A backup that has never been restored is not a backup. Restore to staging once a month and
check that a known conversation is there.

## Monitoring and alerts

| Signal | Alert when |
|---|---|
| Webhook endpoint | Any non-200 for more than a minute; signature failures |
| `webhook_events` not processed | Oldest unprocessed event older than 60 seconds |
| Queue depth and failed jobs | Rising for 5 minutes; any job in the dead-letter queue |
| Graph API errors | Error rate above 2%; any token-invalid error |
| Number health | A company's quality rating drops or its account is restricted |
| API | 5xx rate above 1%; 95th percentile latency above 1 second |
| WebSocket | Connected clients drop sharply |
| Calls | Answer failures; media server down |
| Server | Disk above 80%, memory pressure, certificate expiring within 14 days |
| Database | Connections near the limit, replication or archiving stopped |

Logs are structured JSON with a request id that follows a message from webhook to socket
event. Logs carry ids, never message text or phone numbers in full.

Errors from web, mobile and server go to one error tracker, tagged with the release.

Publish a status page before the first paying customer.

## Launch checklist

**Meta**
- [ ] Business verified; app reviewed with advanced access for both permissions
- [ ] Webhook subscribed to every field listed in 04
- [ ] Embedded Signup tested with a brand-new Facebook account
- [ ] Privacy policy and terms URLs live

**Security**
- [ ] Cross-company test passes; row-level security on
- [ ] Rate limits on login, reset, invite, send, upload
- [ ] Security headers and content security policy on the web app
- [ ] Secrets rotated from development values; token encryption key stored safely
- [ ] Dependency and image scans clean of high-severity findings
- [ ] No message text in logs

**Reliability**
- [ ] Backup restored on staging within the last 30 days
- [ ] Load test met the targets in 01
- [ ] Killing a worker mid-job loses nothing
- [ ] Alerts reach a phone; someone is named as on call
- [ ] Rollback rehearsed once

**Product**
- [ ] A new company can go from "created by system admin" to "first reply sent" without help
- [ ] Seat limit and staff removal behave as specified
- [ ] Every button on every screen works or is hidden
- [ ] Calls tested on a real number, web and both mobile platforms
- [ ] Retention jobs delete recordings on schedule
- [ ] A company can export its data and can be deleted on request

**Business**
- [ ] Plans and prices set in the system admin console
- [ ] Support contact shown in the app
- [ ] The licence and repository visibility decided
- [ ] Use of WhatsApp's name and look checked against Meta's brand rules
