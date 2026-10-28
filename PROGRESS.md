# PROGRESS

Single source of truth for project state. Read top to bottom at the start of every session.

## Status Snapshot

| Field | Value |
|---|---|
| Current phase | **v1.1 expansion in progress.** API (SQLite, auth, workspaces, webhooks, OpenAPI) and the `web/` app (homepage + `/demo`) are committed. **Landing page built in `site/`** (Next.js static export). Remaining: user dashboard, deployment. Task: `docs/CLAUDE_CODE_PROMPT.md`. |
| Blocking issues | None hard-blocking. Needs the user's keys (KL-2, KL-3), a committed `userId` filter in central-logging-service (KL-9), and a decision on which app serves `/` (KL-19). |
| Next action | Decide routing for `/` (`site/` vs `web/` Home) and confirm `GITHUB_URL` with Kevin (KL-20); then the user dashboard. |
| Repo state | Git repo on `main` with commits up to the landing page (see Changelog). Landing page on branch `landing-page`, not merged. Cross-repo: `../central-logging-service` still has an uncommitted `userId` filter (3 files). |
| Verified running | `npm test` (root): **73/73 pass** with real `npm ci` (no borrowed modules). `site/`: `tsc --noEmit` clean, `next build` clean; Lighthouse mobile on `/` served compressed (`serve`): **performance 93–94, accessibility 100, best practices 100, SEO 100** (LCP 2.9 s, TBT 90–110 ms, CLS 0.002). Desktop 1440x900 and mobile 390x844 walkthroughs: no console errors, no horizontal scroll. **Not verified against live Gemma, Khaya or central-logging-service.** No root linter (KL-7). |
| Deadline | Hackathon submission ~19:00 Africa/Accra, 2026-10-28. Feature freeze target 18:00. |

## Reconciliation (2026-10-28, landing-page session)

This file said "not a git repository" and "28/28", but `git log` showed 9 commits that were never recorded here. Read each commit's file list (not just the subject):

| Commit | What it actually contains |
|---|---|
| `69e08d6` | v1.0 backend, docs and tests (what the 2026-10-28 changelog below describes). Resolves KL-16. |
| `5b7b753` | `migrations/001_init.sql` + root `package-lock.json`. |
| `0f7eddb` | `src/auth/auth.js`, `src/db/db.js`, `src/store/repo.js`, `src/security/crypto.js`, `src/events.js`, `src/webhooks/{service,ssrf}.js`; agent and log client made workspace-aware. |
| `9a15f51` | Routes split into `src/routes/{account,connections,console,support}.js`; `src/server.js` rewired. |
| `7eb01fb`, `75732ed`, `cffa510` | Tests: auth, authorization, conversations, isolation matrix, webhooks/SSRF, data/tickets/knowledge/settings/rate-limit/SSE. |
| `5593b6b` | `docs/openapi.yaml`, `scripts/build-openapi.js`, contract tests. |
| `3f114ad` | `web/` Vite + React app: prerendered homepage (`web/src/pages/Home.tsx`) and `/demo` with the Glass Box. |

**Verified this session:** after `npm ci`, the full root suite passes, **73/73**. That resolves KL-8 (no borrowed Express). **Still open:** KL-9 (cross-repo filter), live-API checks (KL-2, KL-3, KL-13, KL-14), and the v1.1 decisions those commits made were not logged here at the time; they are only described by the code and `docs/`.

## Decisions log

### 2026-10-28
- **Name kept as "Helply"** at the user's instruction ("it's just for the hackathon"), despite an established AI support product of the same name (Helply, Inc., formerly Groove). Mitigation: the name lives in one constant (`HELPLY_BRAND` / `web/src/brand.ts`). Revisit before any public launch.
- **Retrieval, not tools.** The model never calls a tool and never chooses whose logs to read; it proposes hints, code validates and fetches. Matches ChatFlow's own "model has no tools" rule and removes the main prompt-injection risk.
- **Identity = short-lived HS256 token** signed by the company backend (`node:crypto`, no JWT dependency). Verified `sub` is the only user id used for log lookups.
- **Scope enforced twice** (query + per-row re-check) and **redaction on read**, because central-logging-service does no redaction at ingest.
- **New repo, adapters to existing products.** ChatFlow (ISC, no LICENSE file), Maame (no license) and LogPulse (README says MIT, no LICENSE file) are not published here; central-logging-service is MIT. Helply is a fresh MIT repo that integrates through HTTP/adapters. Khaya ASR/TTS client shapes were ported from Maame's working clients.
- **central-logging-service gets a `userId` filter** (`metadata.userId`, string-only to block `userId[$ne]=` injection, plus an index) rather than filtering client-side. Edited in the working tree only; no git operations (git in the build sandbox needs delete permission across the user's whole GitHub folder).
- **Zero-dependency core, CommonJS, in-memory store** for speed. Persistence is v1.1 work.
- **Khaya translate endpoint is configurable** (`KHAYA_TRANSLATE_PATH`) and shipped with `npm run check:khaya` instead of guessing silently.
- **WhatsApp calling deferred.** Needs a Cloud API number and a WebRTC media server; not feasible for the deadline. Voice is demoed with browser mic/audio upload through Khaya.
- **Dashboard "users" interpreted as company team members** (owner/admin/agent), not end customers. Change if wrong.

### 2026-10-28 (landing page)
- **Landing page lives in its own folder, `site/`** (Next.js 16 App Router, `output: 'export'`), with its own `package.json`. It never imports from or calls the API, so `src/` and `web/` are untouched. Stack per the user: Next.js, TypeScript, three.js, GSAP + ScrollTrigger, Lenis, lucide-react, Tailwind v4.
- **UI follows the Emotion agency site (emotion-agency.com), not the brand guide's UI**, at the user's explicit instruction. Emotion's structure is copied in Helply colours with Helply content: an entry gate, a fixed 3D world, the scene-headline warp, a ring flash into a flat page, a word scrub with a focus list, a glitch gallery, a trust table, and a next-page reveal. Fonts deviate from the brand guide for the same reason: Instrument Serif, Plus Jakarta Sans and IBM Plex Mono, self-hosted via fontsource with no third-party requests.
- **"Business environment" instead of Emotion's outdoor landscape** (user request): the world is a glass-walled support atrium at blue hour. It has a mirror floor, desks, a skyline, and hanging screens showing a Pidgin chat, cited log lines, a ticket and language chips. The centre object is a flake cloud sampled from the official mark SVG. It morphs into a bubble, a globe, a shield and a ring.
- **No invented statistics, logos or prices**; the four "never does" promises are verbatim from the handover. "Try the live demo" and the AI orb go to `/demo` (the `web/` app).
- **Hero text stays painted under the gate** and warps in after Enter, so LCP is measured on real text, not on a hidden element.
- **Lighthouse is measured against a compressing server** (`npx serve`), because production hosts gzip/brotli; Python's `http.server` does not compress and gave a misleading 73.

## Known Limitations

1. In-memory store: tickets and knowledge reset on restart. (v1.1: SQLite.)
2. Khaya **translate** path/body (`/v1/translate`, `{in, lang}`) is unverified; ASR/TTS shapes come from Maame. Run `npm run check:khaya`.
3. Gemma 4 model id on the Gemini API is unverified (`GEMMA_MODEL=gemma-4-31b-it` is a guess). The adapter retries without system instructions/JSON mode on a 400.
4. Ghanaian Pidgin code for Khaya (`kpo`) is unverified; falls back to Gemma.
5. Round-trip quality is word-overlap (Jaccard), a cheap signal, not a human evaluation.
6. Single tenant; no accounts. Console is protected by one shared `CONSOLE_KEY`.
7. No analyzer/linter or CI configured. Verification is `node --test` + `node --check`.
8. ~~`test/server.test.js` needs `npm install` (Express). Verified here only with Express borrowed from another repo's `node_modules`.~~ Resolved 2026-10-28.
9. The `userId` filter exists only as an **uncommitted** working-tree change in `../central-logging-service` (`src/routes/logs.js`, `src/models/Log.js`, `tests/logsUserFilter.test.js`; that repo's suite: 78/78). Helply cannot find a customer's logs without it deployed.
10. ~~Frontend not built; specs only (`docs/FRONTEND_SPEC.md`).~~ `web/` (homepage + demo) and `site/` (landing page) exist; the user dashboard is still not built.
11. Rate limiter is in-memory per IP and ignores `trust proxy`; behind DigitalOcean's proxy it needs `app.set("trust proxy", ...)`.
12. Hints come from the model; clamped and validated, but search quality depends on the model's keyword choices.
13. `scripts/seed-logs.js` has **never been run against a live central-logging-service**; the log-batch schema it posts is inferred from that service's README.
14. Gemma adapter, Khaya client and the end-to-end flow were tested only with fakes, never with live APIs.
15. Logs must carry `metadata.userId`; the AcademicX and pharma apps still run the old `@bevingh/telemetry` 0.2.0, which ships raw auth headers and bodies to central-logging-service. **Never point the demo at their real logs.**
16. ~~**Nothing is committed** (no git repo in `helply`).~~ Resolved: see Reconciliation.
17. Twi/Ga/Ewe/Pidgin sample messages for the demo have not been written or reviewed by a native speaker.
18. ~~`npm install` never run at the root (KL-8)~~: resolved 2026-10-28, `npm ci` and 73/73.
19. **Two homepages exist:** `site/` (the new landing page) and `web/src/pages/Home.tsx`. Deployment must route `/` to `site/out` and `/demo` to `web/`, or retire one. Not decided.
20. `site/` `NEXT_PUBLIC_GITHUB_URL` defaults to `https://github.com/kevinafenyo/helply`, which is **unconfirmed**. The "Next page: Docs" link goes to `${GITHUB_URL}#quickstart` because there is no `/docs` page.
21. The AI orb sends `/demo?q=…`; `web/`'s Demo page may ignore `q` (not touched, other owner).
22. `site/` has no sitemap, no dark/light toggle (it is light with navy scenes by design), and no automated tests beyond `tsc`/build. Lighthouse 93–94 assumes compression is enabled in production.
23. The gallery cards in `site/` are composed in CSS (navy tiles, icon, chat bubble, log line). There is no photography or generated imagery yet.
24. `docs/brand/README.md`, referenced by the handover, does not exist; the brand kit was taken from the user's Downloads.

## Next Steps

1. ~~`git init -b main`, first commit, record the real hash here (KL-16).~~ Done (`69e08d6`).
2. ~~`npm install`; run the full suite; confirm 28/28 without borrowed modules (KL-8).~~ 73/73 on 2026-10-28.
3. Commit and push the `userId` filter in `central-logging-service` (KL-9).
4. Obtain `GEMMA_API_KEY`, `KHAYA_API_KEY`, a read-only `CLS_API_KEY` and a `logs:write` key; set `.env`.
5. `npm run check:khaya`; fix `src/language/khaya.js` if translate differs (KL-2). Confirm the Gemma model id (KL-3).
6. `npm run seed` against a live central-logging-service; run the demo story end to end (KL-13, KL-14).
7. Execute `docs/CLAUDE_CODE_PROMPT.md`: contract + OpenAPI -> landing page + demo page -> user dashboard -> API functionality (SQLite, workspaces, auth, analytics, audit, webhooks...).
8. Get a native-speaker Twi sample message (KL-17). Rehearse `docs/DEMO_SCRIPT.md`.
9. Deploy (API + static site) on DigitalOcean; record the demo; Devpost write-up. Feature freeze 18:00.
10. ~~Landing page~~ (built in `site/`, branch `landing-page`). Review and merge are the user's call; never merged by Claude.
11. Decide `/` routing between `site/` and `web/` (KL-19); confirm `GITHUB_URL` (KL-20); have `/demo` read `?q=` (KL-21).
12. Enable gzip/brotli on the static host and re-run Lighthouse mobile on the deployed URL.

## Changelog

### 2026-10-28: v1.0 backend, docs, tests
- **Built:** config; token sign/verify; redaction; read-only log client; evidence builder (hint validation, scope re-check, ranking, line ids); Gemma adapter; Khaya client; language layer with fallback and round-trip similarity; support agent (identity, understanding, translation, knowledge answers, evidence-based explanations, ticket creation, output cleaning); in-memory store; Express API (health, config, demo token, text and voice support, console tickets/knowledge, CORS, rate limit); seed and Khaya check scripts; docs (README, ARCHITECTURE, API_CONTRACT, FRONTEND_SPEC, DEMO_SCRIPT, API_ROADMAP, CONTRIBUTING, CLAUDE_CODE_PROMPT); `CLAUDE.md`.
- **Cross-repo:** `central-logging-service` `GET /api/v1/logs?userId=` filter + index + `tests/logsUserFilter.test.js` (uncommitted there).
- **Broke and fixed:** `npm install` was blocked (403) in the build sandbox, so Express was borrowed from the other repo for verification. A first run of that repo's suite with `npx jest` showed 12 failures; they were only the missing `--experimental-vm-modules` flag (`npm test` passes it), then 78/78. One Helply run showed 23/24 because Express was off the path; with it, 28/28.
- **Deliberately not done:** frontend implementation, persistence, accounts/roles, WhatsApp calling, live-API verification, committing (see KL-16).
- **Commit:** none (no git repository yet).

### 2026-10-28: landing page (`site/`)
- **Built:** a Next.js static-export landing page in `site/`:
  - an entry gate with load progress
  - a three.js atrium world with a reflective floor, desks, a skyline and canvas screens
  - a 7k-flake instanced cloud sampled from the mark SVG, morphing mark → bubble → globe → shield → ring, with cursor push
  - five warped scene headlines and the ring flash into the flat page
  - a word scrub with a focus list, the "Who it's for" glitch gallery, the trust table with the cursor follower, contact, and the next-page reveal
  - the nav with a Settings popover (motion, quality) and a mobile menu
  - an AI orb that opens the demo
  - self-hosted fonts, Lenis on the GSAP ticker, reduced-motion and no-JS/no-WebGL fallbacks, and Open Graph/icons from the brand kit
- **Broke and fixed:**
  - headline clipping
  - the see-through gate centre
  - a navy H that was invisible on the dark atrium (recoloured with the on-navy palette)
  - 40px horizontal overflow from the warp skew (`overflow-x-clip`)
  - the IntersectionObserver visibility counter (replaced with a Set)
  - Lighthouse fixes:
    - LCP hidden behind the gate
    - scrub-word and focus-list contrast
    - footer link target size
    - 12px minimum mono/tag size
    - source maps
  - Result: Lighthouse went from 73/93/96/100 to 93–94/100/100/100.
- **Deliberately not done:** touching `src/`, `web/`, `web/src/app/*` or `Demo.tsx`; a `/docs` page; generated imagery; changing the four promises; merging.
- **Commit:** `330a83e` on branch `landing-page`.

