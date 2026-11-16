# Deploying Smart Reply

This puts the whole product on **one Linux server** with Docker: database, Redis, API,
workers, web app and automatic HTTPS. Plan about 1 hour the first time.

## What you need

| Item | Notes |
|---|---|
| A server | Ubuntu 22.04/24.04, 4 vCPU, 8 GB RAM, 80+ GB SSD. Singapore or Mumbai region is closest to Sri Lanka. |
| A domain | For example `app.smartreply.lk`. Add an **A record** pointing to the server's IP. |
| A Meta app | developers.facebook.com → Create app → type **Business** → add **WhatsApp**. Business verification and the Tech Provider steps are needed before customers can connect through Embedded Signup. |
| SMTP email | Any provider (Zoho, Google Workspace, SendGrid, Amazon SES) for invites and password resets. Optional: without it the app shows invite links to copy. |
| AI key (optional) | OpenAI or Anthropic key, only if you sell the AI bot add-on. |

## 1. Prepare the server

```bash
ssh root@YOUR_SERVER_IP
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. Get the code

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/dchamindu826/Smart_Reply.git smart_reply
cd smart_reply/infra
cp .env.example .env
```

(Or upload the ZIP and unzip it to `/opt/smart_reply`.)

## 3. Fill in `infra/.env`

```bash
openssl rand -hex 32   # run three times: POSTGRES_PASSWORD, JWT_SECRET, ENCRYPTION_KEY
nano .env
```

- `DOMAIN` — your domain, `ACME_EMAIL` — your email.
- `POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY` — the random values.
  **Save `ENCRYPTION_KEY` in a password manager.** Losing it means every company must reconnect WhatsApp.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — your LUMI AI super admin login.
- `SMTP_*` — your email settings.

## 4. Start

```bash
docker compose up -d --build
docker compose ps          # everything "running"/"healthy"; "migrate" exited 0
docker compose logs -f api # Ctrl+C to stop following
```

Open `https://YOUR_DOMAIN` and sign in with the admin email and password. Then remove
`SEED_ADMIN_PASSWORD` from `.env`.

## 5. Connect Meta (once, as super admin)

1. In the admin console open **Meta & webhook**.
2. Enter the Meta **App ID**, **App secret**, Graph version (`v26.0`), and your **Embedded Signup
   configuration ID** (Meta App Dashboard → WhatsApp → Embedded Signup → Configurations).
   Choose a long random **verify token**. Press **Test connection**.
3. Copy the **callback URL** (`https://YOUR_DOMAIN/api/v1/webhooks/whatsapp`).
4. In Meta App Dashboard → WhatsApp → **Configuration** → Webhook: paste the callback URL and the
   verify token, press **Verify and save**, then subscribe the fields `messages`, `calls`,
   `message_template_status_update`, `message_template_quality_update`,
   `phone_number_quality_update`, `account_update`.
5. Facebook Login for Business → add `https://YOUR_DOMAIN` to the allowed domains.

## 6. Add a customer company

1. **Companies → New company**: name, plan, seats (max 100), manager's name and email.
   Copy the manager's invite link (also emailed when SMTP is set).
2. Open the company → **WhatsApp**: either **Connect with Facebook** (the business owner signs in
   with you), **Send connect link** (they finish it themselves), or **Enter IDs manually**.
3. Optional: **AI bot** tab → set the add-on to active, choose the plan, write the prompt, add
   knowledge and examples, test it in the simulator.
4. The manager signs in, invites staff (up to the seat limit), and the team starts answering.

## Updating to a new version

```bash
cd /opt/smart_reply && git pull
cd infra && docker compose up -d --build
```

Migrations run automatically before the API starts.

## Backups

```bash
crontab -e
# add:
15 2 * * * cd /opt/smart_reply/infra && ./backup/backup.sh >> /var/log/smart-reply-backup.log 2>&1
```

Copy `/opt/smart_reply/infra/backups` to another provider (rclone to Google Drive/S3/R2).
Restore a database dump:

```bash
docker compose exec -T postgres pg_restore -U smart -d smart_reply --clean < backups/db_YYYY-MM-DD_HHMM.dump
```

## Files on S3 instead of the server disk

Set in `.env`: `STORAGE_DRIVER=s3`, `S3_ENDPOINT` (for R2/Spaces/MinIO), `S3_BUCKET`,
`S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `S3_PUBLIC_ENDPOINT` if browsers use a different address.
Allow CORS `PUT, GET` from `https://YOUR_DOMAIN` on the bucket.

## Troubleshooting

| Symptom | Check |
|---|---|
| Site does not open | DNS A record points to the server; ports 80/443 open; `docker compose logs caddy` |
| Meta "Verify and save" fails | Verify token in admin console matches; `docker compose logs api` |
| Messages arrive but do not show | `docker compose logs worker`; admin console → webhook events → failed → Replay |
| Voice notes fail | The worker image includes ffmpeg; check `docker compose logs worker` |
| Invite emails not arriving | SMTP settings; the invite link is also shown to the manager |

## Calling

Stage A calling is built in: the agent's browser (or the mobile app development build) answers
WhatsApp calls with WebRTC, and the API relays the SDP to Meta. Meta requires the number's
messaging limit to be at least 2,000 to turn calling on (Call settings → Enable calling).
Hold, transfer, conference, recording and the IVR on live calls need a media server
(Stage B in `docs/plan/04-whatsapp-integration.md`); those buttons explain this when pressed.
