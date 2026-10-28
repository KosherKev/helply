# Deploying Helply to DigitalOcean

**Target: one Droplet running Docker Compose** (API + Caddy for HTTPS and the static site). Not App Platform: Helply keeps its data in SQLite and App Platform has no persistent disk, so every restart would erase accounts, conversations and keys.
Status: the artifacts are written and the compose file and a production-mode API boot were validated, but **the Docker images have not been built or run** (no Docker daemon was available when this was written). Expect to fix small things on the first `docker compose up`.

## What gets deployed
| Piece | Where | Notes |
|---|---|---|
| API | `api` container (`Dockerfile`) | Node 22, SQLite at `/data/helply.db` on a named volume |
| Site + dashboard | `web` container (`deploy/Dockerfile.web`) | Built with `tsc` + Vite, the homepage prerendered; served by Caddy |
| HTTPS, proxy | Caddy (same container) | Automatic certificates; `/v1/*` and `/health` go to the API, so the browser sees one origin (no CORS) |
| Log service + MongoDB | optional (`deploy/docker-compose.logs.yml`) or your existing deployment | Helply only needs a URL and a read-only key |
| Model, language | Google Gemini API (Gemma 4), GhanaNLP Khaya | Keys in `.env.production` |

## 1. Prerequisites
- A domain you control (a subdomain is fine) and a DigitalOcean account.
- Keys: `GEMMA_API_KEY` (with billing/credits), `KHAYA_API_KEY`, a read-only key for your log service, optionally the email service URL and key.
- If you want logs: the log service must **contain the `userId` filter** (commit it in `central-logging-service`) before you deploy it anywhere.

## 2. Create the Droplet
Ubuntu 24.04, 1 vCPU / 2 GB RAM is comfortable (1 GB works for the API alone), region closest to Accra (Frankfurt or London). Add your SSH key. Create a Cloud Firewall allowing inbound 22 (your IP only if you can), 80 and 443; deny the rest. Point a DNS **A record** for your domain at the Droplet's IP.
```bash
ssh root@DROPLET_IP
curl -fsSL https://get.docker.com | sh              # installs Docker and the compose plugin
adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
```

## 3. Get the code and configure
```bash
su - deploy
git clone https://github.com/YOUR-ORG/helply.git /opt/helply   # or: sudo mkdir /opt/helply && chown deploy /opt/helply first
cd /opt/helply
cp deploy/production.env.example .env.production
nano .env.production
```
Generate each secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (or `openssl rand -hex 32`). Required: `SITE_ADDRESS`, `APP_URL`, `CORS_ORIGIN`, `HELPLY_ENCRYPTION_KEY` (**back it up**), `GEMMA_API_KEY`, `KHAYA_API_KEY`. The file is gitignored; keep it `chmod 600`.
**Real customers:** `DEMO_MODE=false`. **Hackathon demo URL:** `DEMO_MODE=true` also gives the fictional KwikPay shop, a demo login (set your own `DEMO_PASSWORD`), open sign-up and `HELPLY_JWT_SECRET` (needed for demo tokens) and a `CLS_*` source for the demo logs. Never put real customer data on a demo-mode server.

## 4. Start
```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
curl -s https://YOUR_DOMAIN/health          # {"ok":true,"brand":"Helply"}
docker compose --env-file .env.production logs -f api
```
The first start creates the database and runs the migrations. Open `https://YOUR_DOMAIN`, then `/app/signup` (needs `ALLOW_SIGNUP=true` or demo mode) to create the first workspace. Test by IP first if DNS is not ready: `SITE_ADDRESS=:80` serves plain HTTP.

## 5. Logs for the demo (optional, same Droplet)
```bash
git clone <central-logging-service repo> /opt/central-logging-service      # must include the userId filter
echo "CLS_ADMIN_SETUP_TOKEN=$(openssl rand -hex 24)" >> .env.production
CLS_REPO_PATH=/opt/central-logging-service docker compose --env-file .env.production -f docker-compose.yml -f deploy/docker-compose.logs.yml up -d --build
# a read key for Helply and a write key for seeding (printed once; paste into .env.production as CLS_API_KEY / CLS_WRITE_KEY):
docker compose --env-file .env.production -f docker-compose.yml -f deploy/docker-compose.logs.yml exec cls node src/utils/generateAppApiKey.js helply-read --scopes=logs:read --live
docker compose --env-file .env.production -f docker-compose.yml -f deploy/docker-compose.logs.yml exec cls node src/utils/generateAppApiKey.js helply-seed --scopes=logs:write --live
```
Set `CLS_BASE_URL=http://cls:8080` and `CLS_WRITE_KEY` in `.env.production`, recreate the API (`up -d`), then seed the fictional story from inside the network and check everything:
```bash
docker compose --env-file .env.production -f docker-compose.yml -f deploy/docker-compose.logs.yml exec api node scripts/seed-logs.js
docker compose --env-file .env.production exec api node scripts/verify-live.js --e2e   # needs DEMO_MODE=true for the e2e part
```
**Never** point a demo at a shared production logging database with real users' logs.

## 6. Operate
| Task | Command |
|---|---|
| Update | `git pull && docker compose --env-file .env.production up -d --build` (migrations run on start) |
| Logs | `docker compose --env-file .env.production logs -f api web` |
| Restart | `docker compose --env-file .env.production restart api` |
| Backup now | `deploy/backup.sh` (online backup into the data volume, keeps 14 days) |
| Nightly backup | `crontab -e` > `0 3 * * * cd /opt/helply && deploy/backup.sh >> /var/log/helply-backup.log 2>&1` |
| Copy backups off | `docker cp $(docker compose --env-file .env.production ps -q api):/data/backups ./backups` then `scp` them away |
| Restore | stop the API, copy a backup over `/data/helply.db` in the volume, start it. Needs the same `HELPLY_ENCRYPTION_KEY` |
Enable DigitalOcean Droplet backups as a second layer. Automatic OS security updates: `apt install unattended-upgrades`.

## 7. Production checklist
- [ ] `DEMO_MODE=false`, no demo password in use, `ALLOW_SIGNUP` set on purpose.
- [ ] `HELPLY_ENCRYPTION_KEY` set, backed up somewhere other than the Droplet.
- [ ] HTTPS works on your domain (padlock), `http://` redirects to `https://` (Caddy does this).
- [ ] Firewall allows only 22, 80, 443. MongoDB and the API are not published (compose uses `expose`, not `ports`).
- [ ] `TRUST_PROXY=1` (already in the compose file) so per-IP rate limits see real client IPs.
- [ ] The log key in `CLS_API_KEY` is read-only (`logs:read`); `npm run verify:live` passes from the Droplet network.
- [ ] A test conversation through `/demo` (demo mode) or onboarding > "Test as a customer" works and shows evidence.
- [ ] Nightly backup runs and one restore has been tested.
- [ ] Email works if you rely on password reset (`EMAIL_SERVICE_URL`, `EMAIL_API_KEY`), or administrators know resets are unavailable.

## 8. Known limits of this setup
Single Droplet, single API process (rate limits and the event stream live in memory, so do not run two API replicas); SQLite is the database (fine for a pilot; plan a move to Postgres before many tenants); no CSP header yet; Khaya and Gemma are external services (latency 10 to 18 s per answer today, see `PROGRESS.md`); the ChatFlow link needs ChatFlow's side wired (`docs/CHATFLOW_INTEGRATION.md`).

## Appendix: Render (the quick path)
One Render **Web Service** can serve both the API and the website: the API serves `web/dist` itself when it exists.
- **Build command:** `npm install && npm --prefix web install && npm --prefix web run build`
- **Start command:** `npm start`; add env `NODE_VERSION=22.12.0` (built-in SQLite needs Node 22.5+).
- **Env:** the same variables as `deploy/production.env.example` (no `SITE_ADDRESS`). `CORS_ORIGIN` is not needed (same origin). `APP_URL=https://<your>.onrender.com`.
- **Logs:** `CLS_BASE_URL` must be the PUBLIC https URL of your log service (not localhost), `CLS_API_KEY` a `logs:read` key that exists in THAT service's database, `CLS_SERVICE=demo-shop-api`; seed the demo logs there with a `logs:write` key (`npm run seed`). Use a separate database for the demo, not one holding real users' logs.
- **Data:** the disk is ephemeral unless you attach a Render Disk mounted at `/data` and set `HELPLY_DB_PATH=/data/helply.db`. Without it, every deploy or restart erases workspaces (demo mode recreates the demo account and knowledge).
- **Free instances sleep** after ~15 minutes idle; the first request takes about a minute. Wake it before presenting.

## Appendix: the current hosted pair (Render API + Vercel site)
**Vercel project `helply-web`** (one project serves BOTH the landing page and the dashboard: they are the same Vite app, `/` and `/app`). `web/vercel.json` proxies `/v1/*` and `/health` to the Render API, so the browser is same-origin. Build-time variables (all optional):
| Variable | Value | Notes |
|---|---|---|
| `VITE_API_URL` | **leave unset** | Unset means "same origin", which is what the proxy needs. Set it only to call an API directly, and then add that origin to the API's `CORS_ORIGIN` |
| `VITE_GITHUB_URL` | `https://github.com/KosherKev/helply` | Set on Vercel production. Landing nav and footer link |
| `VITE_BRAND` | leave unset (`Helply`) | Product name constant |
| `VITE_TWI_SAMPLE` | empty until a native Twi speaker supplies a message | Adds the Twi quick prompt to `/demo`; never machine-written |
Change one with `cd web && vercel env add NAME production` then `vercel deploy --prod` (Vite bakes them in at build time). If the Render address changes, edit `web/vercel.json` and redeploy.

**Render service (the API).** Cold start now recreates the demo data (business details, FAQ, two sample conversations and tickets, the demo accounts) and refreshes the demo logs in the log service when `CLS_WRITE_KEY` is set (re-checked every 30 minutes; set `DEMO_SEED=false` to disable). Environment:
| Variable | Value |
|---|---|
| `NODE_VERSION` | `22.12.0` |
| `DEMO_MODE` | `true` (this host has no persistent disk) |
| `DEMO_PASSWORD` | your own: `/v1/config` shows the demo login on a demo server |
| `HELPLY_JWT_SECRET`, `HELPLY_ENCRYPTION_KEY` | `openssl rand -hex 32` each, fixed values so tokens and stored secrets survive restarts |
| `GEMMA_API_KEY`, `GEMMA_MODEL=gemma-4-31b-it`, `GEMMA_THINKING_LEVEL=minimal`, `KHAYA_API_KEY` | as in `.env` |
| `CLS_BASE_URL` | the log service's PUBLIC https URL (not localhost) |
| `CLS_API_KEY`, `CLS_WRITE_KEY`, `CLS_SERVICE=demo-shop-api` | keys that exist in THAT service's database: `logs:read` and `logs:write` |
| `APP_URL` | `https://helply-web-bice.vercel.app` (invitation and reset links) |
| `ALLOW_PRIVATE_LOG_SOURCES` | `false`: open sign-up on a public demo would otherwise let anyone point a log source at internal addresses |
| `RATE_SUPPORT_IP`, `RATE_LOGIN_IP` | `300`, `60`: every visitor reaches Render through Vercel, so per-IP limits may see one shared address until `TRUST_PROXY` is set to the real hop count |
| `CORS_ORIGIN`, `TRUST_PROXY` | not needed for the proxied setup (see above) |
