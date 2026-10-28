# Handover: who reads what

The backend and API are owned by Kevin. Everyone else works in `web/` (or on content) against the API **as documented**, never by reading backend source. If you need an API change, ask for it: docs and `docs/openapi.yaml` change first, then code, then you consume it.

## Get running in 5 minutes (no keys needed)
```bash
git clone <repo> && cd helply
npm install && npm run dev:mock          # API on :8787 with a seeded demo shop. Fake model and logs, real everything else
cd web && cp .env.example .env && npm install && npm run dev     # http://localhost:5173
```
Demo logins (demo mode only): `owner@kwikpay.demo` and `agent@kwikpay.demo`, password `helply-demo-pass` (the login page also has a "Sign in as the demo owner" button). Demo customers on `/demo`: Ama Mensah and Kofi Boateng. `npm run dev:mock` replies with scripted text; the real model, Khaya and logs need keys that only Kevin holds. Everything about request/response shapes is real.

## Pick your document
| You are | Read | Your area |
|---|---|---|
| **Landing page** (`/`, later `/docs`) | [`LANDING_PAGE.md`](LANDING_PAGE.md) | `web/src/pages/Home.tsx`, brand, SEO, performance |
| **Live demo + team dashboard** (`/demo`, `/app/*`) | [`DASHBOARD_AND_DEMO.md`](DASHBOARD_AND_DEMO.md) | `web/src/pages/Demo.tsx`, `web/src/app/*`, shared components |
| **Language, demo and write-up** | [`LANGUAGE_AND_DEMO.md`](LANGUAGE_AND_DEMO.md) | native-speaker samples, `docs/DEMO_SCRIPT.md`, Devpost |
| **Admin dashboard (parallel build)** | [`../ADMIN_DASHBOARD_SPEC.md`](../ADMIN_DASHBOARD_SPEC.md), [`../API_V1_2_PLAN.md`](../API_V1_2_PLAN.md) | what to build per page, workflows, and the planned routes (served as fixtures by `npm run dev:mock`) |
| **Everyone** | `docs/brand/README.md`, `docs/API_CONTRACT.md`, `docs/openapi.yaml` | brand kit and the API |

## Rules for everyone
1. **Brand:** `docs/brand/` wins over `docs/FRONTEND_SPEC.md` where they disagree (colours, fonts, radius, voice).
2. **Name:** never hard-code "Helply" in copy. Use `BRAND` from `web/src/brand.ts`.
3. **Security-visible UI:** render all server text as text (no `dangerouslySetInnerHTML`), keep tokens in memory only, never log a token.
4. **Before you push:** `cd web && npm run build` must pass (it runs `tsc` and the homepage prerender). Backend changes are not yours: `npm test` at the root must stay green if you touch anything outside `web/`.
5. **Commits:** short, one per issue, no `Co-authored-by`. Never merge branches yourself; open a PR.
6. **No secrets in the repo.** `.env` files are gitignored; `*.env.example` lists every variable.
7. **No invented numbers, quotes or customer logos** on any page. No machine-written Twi/Ga/Ewe text: it must come from a native speaker.
