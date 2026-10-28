# PROGRESS

Single source of truth for project state. Read top to bottom at the start of every session.

## Status Snapshot

| Field | Value |
|---|---|
| Current phase | **v1.1 built** (API + OpenAPI + web app). Remaining before submission: keys, live-service verification, deploy, demo rehearsal, Devpost write-up. |
| Blocking issues | None in the verified demo path. Open: `userId` filter in `../_Modules/central-logging-service` still uncommitted (KL-9, user action); native-speaker Twi/Ga/Ewe samples (KL-17); ASR untested with a real recording (KL-2); ChatFlow architecture awaiting the user's confirmation. |
| Next action | Continue `docs/API_V1_2_PLAN.md` order: inbox counts + assign, then issues, playbooks, handoff rules, knowledge gaps, feedback/quality. ChatFlow-side wiring needs the user's go-ahead to touch that repo. Dashboard developer builds against `npm run dev:mock` (real: onboarding, profile, FAQ, channels, relay). |
| Repo state | Git repository on `main`, last commit `5cf6745`. **Uncommitted from the 2026-10-28 live-verification session:** `src/loadEnv.js`, `test/loadEnv.test.js`, `scripts/verify-live.js`, edits to `src/server.js`, `scripts/seed-logs.js`, `scripts/check-khaya.js`, `package.json`, this file. `../central-logging-service` `userId` filter still uncommitted. |
| Verified running | `npm test`: **77/77 pass** (Node 22.12, `--experimental-sqlite`). `cd web && npm run build` (tsc + vite + prerender): clean. Lighthouse mobile on the production build of `/`: **performance 96, accessibility 100, best practices 100**, no console errors. UI exercised in the in-app browser against the real API with **scripted fakes for Gemma, Khaya and the log service** (login, overview, conversations, takeover, translated reply preview, tickets, connections test, API key, webhook SSRF refusal, invite, audit), and checked at 375px (no horizontal scroll). **Not verified against live Gemma, Khaya or central-logging-service** (attempted from the build sandbox on 2026-10-28: network blocked, so inconclusive, not failed). `scripts/verify-live.js --e2e` was validated against the mock server (6/6 e2e steps). No linter configured (KL-7). |
| Deadline | Hackathon submission ~19:00 Africa/Accra, 2026-10-28. Feature freeze 18:00. |

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

### 2026-10-28 (v1.0)
- **Name kept as "Helply"** at the user's instruction, despite an established AI support product of the same name. The name lives in one constant (`HELPLY_BRAND` / `web/src/brand.ts`). Revisit before any public launch.
- **Retrieval, not tools.** The model never calls a tool and never chooses whose logs to read.
- **Identity = short-lived HS256 token** signed by the company backend (`node:crypto`, no JWT dependency). Verified `sub` is the only user id used for log lookups.
- **Scope enforced twice** (query + per-row re-check) and **redaction on read**.
- **New repo, adapters to existing products** (licensing of ChatFlow/Maame/LogPulse unclear; central-logging-service is MIT).
- **central-logging-service gets a `userId` filter** (uncommitted in that repo).
- **Khaya translate endpoint is configurable** (`KHAYA_TRANSLATE_PATH`) with `npm run check:khaya`.
- **WhatsApp calling deferred.** Voice is demoed with the browser mic through Khaya.
- **Dashboard "users" = company team members** (owner/admin/agent), not end customers.

### 2026-10-28 (v1.1 session)
- **SQLite via `node:sqlite`, not `better-sqlite3`.** Keeps the runtime dependency list at Express only. Cost: Node >= 22.5 and the `--experimental-sqlite` flag on Node < 22.13 (the npm scripts pass it). `engines` is now `>=22.5`. Migration file: `migrations/001_init.sql`; a test asserts every tenant table has `workspace_id` and that audit events are immutable (DB triggers).
- **Isolation by construction.** Every repository method takes the workspace id first and throws without it (tested for 11 methods); the agent only ever sees a workspace-bound store façade. Principal workspace id comes from the credential. Customer tokens: the `tenant` claim only selects *which workspace secret* verifies the token; a token signed with workspace A's secret that claims tenant B is treated as anonymous (tested).
- **Anonymous widget callers** identify the workspace with a publishable `publicKey` (knowledge-base answers only). Without a token or key, only the default (env-backed) workspace is reachable, and only when demo mode, `HELPLY_JWT_SECRET` or `CONSOLE_KEY` is set.
- **Contract change:** console endpoints with no credential outside demo mode return `401` (were `503 console_not_configured`); the existing test was updated. `GET /v1/tickets` returns `{ data, nextCursor }` and keeps `tickets` as an alias. Legacy `X-Console-Key` and the demo-mode open console map to the default workspace only.
- **Roadmap cuts (not demo-visible by 18:00):** `GET /widget.js`, `POST /v1/widget/session`, customer-side SSE (replaced by a polling endpoint, `GET /v1/support/conversations/:id/messages`), `Idempotency-Key`. They are listed in `openapi.yaml` as `x-planned` and a contract test asserts they stay unrouted until built. Added instead: `GET /v1/members` (assignee pickers without exposing emails), `POST /v1/identity/rotate-secret`, `POST /v1/conversations/:id/translate-preview`, `POST /v1/auth/accept-invite`, `GET /v1/identity`.
- **Spec of record = `docs/openapi.yaml`, generated** from `scripts/build-openapi.js` (committed). `test/contract.test.js` checks: yaml equals generator output; routes in code == documented operations; each guard's role/scope/legacy flag matches the spec; real responses match their schemas (a small JSON-Schema checker, self-tested).
- **Review queue semantics:** with `holdFlaggedReplies` on, any reply (AI or agent) whose back-translation similarity is below the workspace threshold is held and invisible to the customer until approved (optionally edited) or rejected. Default off.
- **Webhook SSRF:** https only; private/loopback/link-local/metadata/mapped-IPv6 blocked; DNS validated at connect time via a custom `lookup` (rebinding-safe); redirects never followed; capped time and size; 3 retries with backoff. Log-source URLs get the same checks unless `ALLOW_PRIVATE_LOG_SOURCES` (on in demo mode).
- **Frontend:** Vite + React + TS + Tailwind v4, React Router; homepage is **prerendered at build time** into `dist/index.html` (sections work with JS off; the same HTML is injected in dev so hydration matches). Fonts self-hosted via `@fontsource` (removed a render-blocking Google Fonts request). Tokens live in memory only (a refresh signs the dashboard out, by design). Charts are hand-rolled SVG.
- **No machine-written Twi.** The `/demo` Twi quick prompt appears only when `VITE_TWI_SAMPLE` is set to a native speaker's message. Pidgin prompt uses the wording from `FRONTEND_SPEC.md` (still unverified by a speaker).

### 2026-10-28 (handover)
- **Frontend handed to others; Kevin goes backend-only.** Handover docs in `docs/handover/` (index, landing page, dashboard+demo, language/demo/write-up). `npm run dev:mock` (`scripts/dev-mock-server.js`) runs the real app with scripted fakes so they need no keys.
- **Brand kit added** to `docs/brand/` (guide HTML + SVG/PNG assets; three SVGs copied to `web/public/brand/`). **The guide's palette (Helply Blue `#2563EB`, Deep Navy, Ice Blue) and Plus Jakarta Sans differ from what the web app currently uses (green/gold, Space Grotesk).** Not re-skinned yet: it is the first job in both frontend handover docs. The guide has no gold/green, so status/cited-line colours need a designer decision (suggestion in `docs/brand/README.md`).

### 2026-10-28 (live-verification prep)
- **`.env` is now actually loaded.** Nothing in the repo read `.env` (no `--env-file`, no dotenv), so keys added there were ignored by `npm start`, `seed` and `check:khaya`. Added a dependency-free loader (`src/loadEnv.js`; the real environment wins; returns names only). It runs in the server's `require.main` block and in the scripts, not on import, so tests never read the developer's real keys.
- **`npm run verify:live`** is the single live check (env names, Gemma model-id discovery by listing the key's models, Khaya translate/TTS, log service incl. whether the `userId` filter is active, optional `--e2e` demo story). It must be run on the user's machine: the build sandbox cannot reach Khaya or localhost services. It never prints secrets.
- **Did not commit from the build sandbox:** git there needs delete permission across the user's whole GitHub folder; commit manually (see Changelog).

### 2026-10-28 (live verification, first real run)
- **Log service moved:** it is at `../_Modules/central-logging-service` (not `../central-logging-service`). Its `.env` points at a **shared MongoDB Atlas cluster with real apps' logs**, so Helply's demo runs against a separate instance on **local Mongo** (`scripts/start-local-cls.sh`, database `helply_demo_logs`, port 8080). Two scoped keys were minted there with that service's own CLI (`helply-read`: `logs:read`; `helply-seed`: `logs:write`) and written to this repo's `.env` as `CLS_API_KEY` / `CLS_WRITE_KEY` (old values backed up in `.env.bak-before-local-cls`, gitignored). The previous values were unknown to the service (403).
- **Khaya verified live:** translate en->tw/ee/gaa/fat/dag and back, plus Twi TTS, all work with the configured path/body. **Ghanaian Pidgin is not supported by Khaya** (`UNSUPPORTED_LANGUAGE_PAIR`), so Pidgin now goes straight to Gemma (flagged lower confidence). Pidgin voice (ASR/TTS) has no Khaya code and will not work.
- **Log service verified live:** read key accepted; a read key cannot write (403); `metadata.userId` present; the `userId` filter works server-side (unknown user returns 0 rows). The seed script's payload was wrong (`error: null` rejected by the service's schema); fixed, 40 fictional logs seeded.

### 2026-10-28 (v1.2 planning)
- **v1.2 contract written before code.** 52 planned operations are in `docs/openapi.yaml` (`x-planned`, `x-priority` P0/P1/P2) generated by `scripts/build-openapi.js`; behaviour in `docs/API_V1_2_PLAN.md`; dashboard pages and workflows in `docs/ADMIN_DASHBOARD_SPEC.md`. The contract test asserts planned operations are **not** routed, so shipping one forces removing `x-planned`.
- **Parallel work without a backend:** `npm run dev:mock` also serves fixtures for every planned route (`scripts/planned-fixtures.js`, `planned-mock-router.js`), and `test/planned-fixtures.test.js` validates each fixture against the spec.
- **Architecture decision (recommended, awaiting the user's confirmation):** ChatFlow stays the chat channel and human inbox; Helply is the AI brain behind it, linked by a per-channel relay key (`hr_live_...`) that ChatFlow's server uses on `/v1/relay/*`. Helply's knowledge base is the source of truth for AI answers. Customer identity reaches Helply as the company-signed token carried through ChatFlow (visitors there are anonymous; their name/email are client-supplied and untrusted); token v2 adds optional `aud`, `jti`, `vid` and public-key (RS256/ES256) verification.
- **Onboarding must capture business information:** business profile, FAQ, documents/sites, error playbooks (error code to customer wording) and handoff rules, not only documents.

### 2026-10-28 (Gemma verified live)
- **Gemma 4 is a thinking model.** Reasoning tokens count against `maxOutputTokens`, so small budgets returned an empty answer. Only `thinkingConfig.thinkingLevel: "minimal"` is accepted (`thinkingBudget: 0` and `"low"` are 400s). The adapter now sends it by default (`GEMMA_THINKING_LEVEL`, empty to omit), steps down on a 400 (without thinking config, then inline without system/JSON mode), and reports "spent its whole output budget on reasoning" instead of a bare empty response. 5 tests.
- **Model choice:** `gemma-4-31b-it` kept. `gemma-4-26b-a4b-it` is ~20% faster but its log-explanation step returned no usable result on the same prompt.
- **Live demo story passes** (`npm run verify:live -- --e2e`): anonymous account question refused, Ama's failed payment diagnosed with cited lines and a ticket, Kofi's data never returned, knowledge-base answer. Pidgin (via Gemma) replied in natural Pidgin, round-trip similarity 0.7. A Twi message went through Khaya; its back-translation came out wrong (similarity 0.14) and was correctly flagged "needs review", which is the safety net doing its job.

### 2026-10-28 (relay backend built)
- **Built:** channels (`/v1/channels`, relay key `hr_live_...` stored hashed, shown once, rotate/disconnect revoke at once, one workspace per ChatFlow property) and the relay API (`/v1/relay/message|events|identify|config`) behind a relay-only guard with a per-channel rate limit. Migration `002_channels.sql` (`channels`, `channel_conversations`).
- **Shared conversation core** (`src/routes/converse.js`): the direct support API and the relay now run the identical pipeline and persistence, so identity, scoping, redaction, ticketing and notifications cannot diverge between channels.
- **Token v2 (additive):** optional `aud` (must be `helply`) and `vid` (bound to one visitor; accepted only when the caller supplies that visitor id, so a visitor-bound token is rejected on the direct API). `/v1/identity/tokens` accepts `visitorId`.
- **Identity on the relay** is verified on every message against the channel workspace's own secret; ChatFlow only carries the token. A `tenant` claim naming another workspace is refused. A different verified customer on the same ChatFlow conversation starts a fresh Helply conversation (audited `relay_identity_changed`). The visitor-to-customer link is informational and never used for a log lookup.
- **Pause switch:** workspace setting `aiLive` (default true). When false, both paths record the message, mark the conversation `needs_human`, notify, and do no model or log work. Stored as a setting rather than the column the plan sketched.
- **Verified live** against real Gemma, Khaya and the log service: verified Pidgin visitor answered with a ticket (17.8 s), expired-token follow-up falls back to anonymous in the same conversation, `agentOnline` and `agent_joined` suppress the AI, dashboard shows the conversation, channel test passes.
- ChatFlow's repo was **not** touched; `docs/CHATFLOW_INTEGRATION.md` specifies what it must do.

### 2026-10-28 (onboarding, business profile, FAQ)
- **Built:** computed onboarding checklist (9 steps, `optional` flag, `readyForLive`), test-as-a-customer, go-live/pause; business profile; FAQ with CSV import; migration `003` (`business_profiles`, `faqs`, `onboarding_state`, `is_test` on conversations and tickets); RFC 4180 CSV parser (`src/util-csv.js`).
- **Decision:** new workspaces start with the AI paused and can go live only through the checklist (`PATCH aiLive: true` obeys the same gate); the demo/default workspace and existing ones stay live. Test runs are real but invisible (lists, analytics, notifications).
- **Decision:** company text is retrieved like documents (FAQ boosted, profile excerpt only when relevant), never pasted wholesale into prompts; `tone` is applied to the knowledge and explanation prompts.
- **Verified live** (real Gemma, Khaya, logs): formal tone applied; opening hours answered from the profile; cash-on-delivery from the FAQ; test run hidden from lists; checklist moved to ready. The demo workspace in `.data/helply.db` now holds that profile and FAQ.

### 2026-10-28 (landing page)
- **Landing page lives in its own folder, `site/`** (Next.js 16 App Router, `output: 'export'`), with its own `package.json`. It never imports from or calls the API, so `src/` and `web/` are untouched. Stack per the user: Next.js, TypeScript, three.js, GSAP + ScrollTrigger, Lenis, lucide-react, Tailwind v4.
- **UI follows the Emotion agency site (emotion-agency.com), not the brand guide's UI**, at the user's explicit instruction. Emotion's structure is copied in Helply colours with Helply content: an entry gate, a fixed 3D world, the scene-headline warp, a ring flash into a flat page, a word scrub with a focus list, a glitch gallery, a trust table, and a next-page reveal. Fonts deviate from the brand guide for the same reason: Instrument Serif, Plus Jakarta Sans and IBM Plex Mono, self-hosted via fontsource with no third-party requests.
- **"Business environment" instead of Emotion's outdoor landscape** (user request): the world is a glass-walled support atrium at blue hour. It has a mirror floor, desks, a skyline, and hanging screens showing a Pidgin chat, cited log lines, a ticket and language chips. The centre object is a flake cloud sampled from the official mark SVG. It morphs into a bubble, a globe, a shield and a ring.
- **No invented statistics, logos or prices**; the four "never does" promises are verbatim from the handover. "Try the live demo" and the AI orb go to `/demo` (the `web/` app).
- **Hero text stays painted under the gate** and warps in after Enter, so LCP is measured on real text, not on a hidden element.
- **Lighthouse is measured against a compressing server** (`npx serve`), because production hosts gzip/brotli; Python's `http.server` does not compress and gave a misleading 73.

### 2026-10-28 (landing page, round 2)
- **Routing: `site/` serves `/`, `web/` serves `/demo` and `/app/*`** (user decision). `site/scripts/assemble.mjs` merges both static builds into `site/deploy` and never edits `web/`. The web app's own `index.html` already clears its prerendered homepage on other paths, so it serves as the shell.
- **Fonts follow the brand guide** (user request, reversing the earlier Emotion-font decision): Plus Jakarta Sans for everything; display 800 with -2% tracking in sentence case, a 500 italic lead word, 12px/500 captions. IBM Plex Mono stays only for log lines (`font-mono`), where monospace is functional. Instrument Serif removed.
- **White nav bar** with the full-colour logo (user request); the over-the-world white text variant was removed.
- ~~**Gallery copies Emotion's CSS placement** exactly (staggered sizes and heights).~~ Superseded the same day: the user found the stagger disordered and chose **even rows** (five equal 4:5 cards, three then two centred; 2 columns on phones with the last centred). The Emotion hover (title slides right with a ↪) stays.
- **Card entry no longer shakes:** the stepped "grid shift" glitch moved cards ±8 px sideways; replaced by a smooth top-to-bottom clip reveal with an inner photo zoom (measured 0 px sideways movement).
- **Hover text is plain language** (user request): "What Helply finds" with one sentence per case, derived from the same failure each log line described; raw log lines are no longer shown on the cards.
- **Footer wordmark in flakes** (user request): scene 5 is now a sixth flake shape, the product name rasterised in Plus Jakarta Sans 800 (`wordShape`), facing the camera above the mirror floor. Shrinks on portrait screens.
- **Particle object re-matched to Emotion** (user request, after re-recording emotion-agency.com idle, cursor and scroll sequences): round beads instead of flat flakes (10,000 high / 3,600 low); morphs pass through a glowing ellipsoid cloud (shape A -> cloud -> shape B); the mark is a thick slab that sways and turns with scroll; other shapes drift on two axes; the object leans toward the cursor and a wide patch lights up; idle shimmer band, single-bead sparkle, a loose halo and drifting beads. A first pass looked packed ("sticky" per the user); beads were made smaller, offset from their sample points with a 10% halo, while keeping the core legible.
- **Round 5 (user feedback: logo not visible, beads motionless, light effects distorting, loader and entry unlike Emotion, flash late):** after recording Emotion's loader, cursor trail and Enter sequence frame by frame:
  - The mark is drawn from its own SVG paths, part by part, with heavier strokes and an open bubble (no filled body), the way Emotion's "e" is a bold outline with holes. It reads as the H, handshake and bubble at rest.
  - Beads float on a flow field keyed to their place in the shape (amplitude 0.11, was 0.045), so the surface visibly moves; beads are smaller and the halo is 4% (was 10%).
  - Light effects reduced to accents: lower shine, darker base colour with a small self-glow, shimmer and cursor glow halved. The periodic light pulse was removed at the user's request ("the bang is not supposed to pulsate, it's supposed to just spark"): the beads flash white once on entry and settle into colour.
  - Loader rebuilt after Emotion's: logo and caption high, a full-width progress line with "Experience / is loading... / Please / wait / 0042 / out of / 100%", a soft white smoke trail that follows the cursor, then Enter and Enter without motion. Audio is not offered (Helply has none).
  - Entry "light bang" on a 2D canvas: a white spark beats, then swells into a breathing cloud with a wobbly edge and a hole opening onto the world. The beads burst out of the centre through the glowing cloud into the mark.
  - The flash into the flat page is now fully white before the flat page starts to come up, and clears only as that page fills the screen. It used to fire after the page was already visible.
- **"Who it's for" heading** set as one tight line with its caption beside it (below on phones), replacing the spread-out split heading.
- **Photos from Pexels**, downloaded from the public CDN after web search (the pexels.com site blocks automated browsing, so no bot-check workaround), resized to WebP 640/1200 and self-hosted. Credited in the footer; the Pexels license needs no attribution.
- **Scroll lag fixes:** flake animation moved to the vertex shader (was a 7,000-flake CPU loop re-uploading ~450 KB per frame); the world renders on GSAP's ticker after Lenis; resolution cap 1.5 and adaptive step-down; no animated CSS blur on headlines; no backdrop-filter over the canvas; focus list reads then writes layout; text scrub follows Lenis directly (no extra 0.6 s lag); all shape buffers uploaded before the gate opens.

- **Assistant orb talks to the API (user: "use this now", with `docs/openapi.yaml`; "don't touch the api").** The orb follows the web demo's flow, per the contract: `GET /v1/config`, then in demo mode `POST /v1/demo/token` for the first demo customer (server-signed, so identity still comes only from a verified token), then `POST /v1/support/message` carrying `conversationId`. It shows the reply, the English when the reply is in another language, and needs-human / sign-in notes, in an `aria-live` log. Errors become plain sentences with a link to the live demo. When `NEXT_PUBLIC_API_URL` is unset in a build, it opens `/demo` as before. No API code or `.env` was changed.

## Known Limitations

1. ~~In-memory store.~~ Resolved: SQLite (`HELPLY_DB_PATH`, default `.data/helply.db` for `npm start`). Tests use `:memory:`.
2. ~~Khaya translate path/body unverified.~~ Verified live (translate for tw/ee/gaa/fat/dag, TTS for Twi). **ASR is still untested** (needs a .wav: `npm run check:khaya -- file.wav`).
3. ~~Gemma model id and generation unverified.~~ **Verified live 2026-10-28** (see Decisions). `gemma-4-31b-it` is valid for generateContent with the configured key (`gemma-4-26b-a4b-it` also exists). **Generation itself is unverified: the project returns 402 (credits depleted).**
4. ~~Pidgin code for Khaya unverified.~~ Khaya does **not** support Pidgin; it always uses the Gemma fallback and has no voice support.
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
19. ~~**Two homepages exist:** `site/` and `web/src/pages/Home.tsx`; routing not decided.~~ Resolved: `site/deploy` serves `/` from `site/` and `/demo`, `/app/*` from `web/`. `web/`'s Home is built but unreachable at `/` in production.
20. `site/` `NEXT_PUBLIC_GITHUB_URL` defaults to `https://github.com/kevinafenyo/helply`, which is **unconfirmed**. The "Next page: Docs" link goes to `${GITHUB_URL}#quickstart` because there is no `/docs` page.
21. The AI orb sends `/demo?q=…`; `web/`'s Demo page may ignore `q` (not touched, other owner).
22. `site/` has no sitemap, no dark/light toggle (it is light with navy scenes by design), and no automated tests beyond `tsc`/build. Lighthouse 93–94 assumes compression is enabled in production.
23. ~~No photography in the gallery.~~ Resolved: Pexels photos. Photographers are not individually credited (Pexels does not require it; the pages could not be fetched to read names).
24. `docs/brand/README.md`, referenced by the handover, does not exist; the brand kit was taken from the user's Downloads.
25. Scroll smoothness was measured in headless Chrome (no vsync, Apple GPU). Not yet checked on a low-end Windows laptop or a mid-range Android phone.
26. The DigitalOcean static-site settings in `site/README.md` are documented but not deployed or tested.
29. The chat orb opens `/demo`, which needs the API running (`npm run dev` at the root, port 8787) and the web dev server (`npm --prefix web run dev`, port 5173) when testing from `next dev`. With no `.env`, the API answers `identity_not_configured` (no `HELPLY_JWT_SECRET`) and `llm_not_configured` (no `GEMMA_API_KEY`), which the user saw as "server error". Needs the user's keys (KL-2, KL-3).
27. The loader's cursor trail is a 2D-canvas smoke imitation, not a fluid simulation like Emotion's; the entry bang is matched by eye from 100 ms captures, not from Emotion's source.
28. Round 5 visuals were checked in headless Chrome only; the user views them in Safari, where WebGL colour and canvas shadow blur can differ slightly.
30. The API allows a single `CORS_ORIGIN` (`.env` has `http://localhost:5173`), so the orb on `next dev` (localhost:3000) is blocked by the browser until the user sets `CORS_ORIGIN` to the site's origin (or `*` for local demos only). In production the API URL and its allowed origin must match the deployed site. Left to the user: the API and `.env` are not to be touched. The orb's live round trip is unverified (no API was started this session; `GEMMA_API_KEY` is still empty).

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
11. ~~Decide `/` routing (KL-19).~~ Confirm `GITHUB_URL` (KL-20); have `/demo` read `?q=` (KL-21). Set `CORS_ORIGIN` and `GEMMA_API_KEY`, then try the orb end to end (KL-30).
12. Enable gzip/brotli on the static host and re-run Lighthouse mobile on the deployed URL.

## Changelog

### 2026-10-28: v1.0 backend, docs, tests
- **Built:** config; token sign/verify; redaction; read-only log client; evidence builder; Gemma adapter; Khaya client; language layer; support agent; in-memory store; Express API; seed and Khaya check scripts; docs; `CLAUDE.md`.
- **Cross-repo:** `central-logging-service` `?userId=` filter (uncommitted there).
- **Commit:** none (no git repository yet).

### 2026-10-28: v1.1 (this session)
- **Reconciliation (Phase 0).** `PROGRESS.md` matched the code: no git history existed, so the first commit `69e08d6` captured v1.0 as found. A clean `npm install` + `npm test` gave 28/28 (KL-8 closed). Node here is 22.12, which needs `--experimental-sqlite`.
- **Built (backend):** migration + SQLite repository (workspace id required everywhere); scrypt accounts, hashed 12h sessions, login backoff, owner/admin/agent roles read live; API keys with scopes; per-workspace identity secret + `POST /v1/identity/tokens`; encrypted log source with a plain-language connection test; conversations/messages with `conversationId` continuity, takeover, agent replies with translation + round-trip preview, resolve, review queue; tickets with cursor pagination, filters, assignee, notes, GitHub-issue export; knowledge upload/edit/reindex; analytics summary + timeseries (root causes fingerprinted); append-only audit (every log lookup writes one); HMAC-signed webhooks with SSRF protection and delivery log; customer erasure; retention sweep; dashboard SSE; per-IP and per-workspace rate limits with headers; request ids; `trust proxy`.
- **Built (spec/tests):** `docs/openapi.yaml` (+ generator) and contract tests; 46 new tests (auth, authorization matrix over every route, workspace isolation matrix, conversation flow, SSRF/webhooks, data/knowledge/settings, rate limits, SSE).
- **Built (web):** design system, prerendered homepage, `/demo` (signed-in-as, quick prompts, mic, Glass Box), `/app` dashboard: login/signup/accept-invite, Overview, Conversations (+detail with Glass Box, takeover, translation preview), Tickets (+detail, copy as GitHub issue), Review queue, Knowledge (drag-drop, csv upload), Connections, Developers (keys, webhooks), Team, Audit, Settings (+ customer erasure).
- **Broke and fixed:** (1) isolation test showed `retrieve()` checked the query before the workspace id; fixed. (2) Browser walk-through showed free-text `token=...` was not redacted (KL-18) and `cleanText` mangled `_` (KL-19); both fixed with tests. (3) Lighthouse found React hydration error #418 (server rendered `<Home/>` while the client wrapped it in `<Suspense>`); server now renders the same `<App/>`, and dev injects the prerender too. (4) Render-blocking Google Fonts (perf 87): fonts self-hosted, perf 96. (5) The generated YAML used anchors that the parser rejected; aliases disabled.
- **Deliberately not done:** widget script and session bootstrap, customer SSE, `Idempotency-Key`, `/docs` page, email delivery, password reset, frontend unit/e2e tests, live-API verification, deployment, demo rehearsal.
- **Handover (later same day):** brand kit + 4 handover docs + `dev:mock` script added (see Decisions).
- **Processes:** the dev API (scripted fakes), Vite dev server and preview server started this session were stopped; none left running.
- **Commits:** `69e08d6` (v1.0 as found) ... `2519d06` (v1.1 code, dashboard, fixes, docs). Docs and this file: `e813de0`.

### 2026-10-28 (onboarding)
- **Built:** see Decisions "onboarding, business profile, FAQ". Tests 110/110 (+8), spec promoted 11 operations (32 planned remain). Existing tests now register workspaces already live via a helper option; relay resume test uses the repository because the API gate applies. **Not done:** playbooks, handoff rules, inbox counts/assign, issues, gaps, quality, public-key identity, password reset, customers, site crawler.

### 2026-10-28 (relay backend)
- **Built:** items in Decisions "relay backend built"; tests 102/102 (+14: channel lifecycle, relay auth negatives, identity rejections, suppression, events, isolation, rate limits, 503 handling); `docs/CHATFLOW_INTEGRATION.md`; spec promoted 9 operations from planned to built (43 planned remain); fixtures for them removed; web types updated.
- **Fixed on the way:** three tests encoded the old world (single migration, relay routes under the API-key matrix, planned count); updated deliberately.
- **Not done:** ChatFlow-side changes; any other v1.2 route.
- **Processes:** API and log service started for the live check were stopped. The temporary live-test channel was deleted.

### 2026-10-28 (Gemma live)
- **Fixed:** Gemma adapter for thinking models (+5 tests, 88 total); `.env.example` documents `GEMMA_THINKING_LEVEL`.
- **Verified live:** Gemma generation and JSON mode, Khaya, log service, the full demo story, Pidgin and Twi paths. **Not verified:** ASR, voice in a browser.
- **Processes:** the API and the isolated log service started for verification were stopped.

### 2026-10-28 (v1.2 planning and Gemma key)
- **Built:** v1.2 planned contract, fixtures, mock router, shared schema checker (`test/_schema.js`), `docs/API_V1_2_PLAN.md`, `docs/ADMIN_DASHBOARD_SPEC.md`; handover index updated. Tests 83/83.
- **Found:** Gemma key valid, model id valid, generation blocked by 402. `verify:live` now treats Pidgin-unsupported as expected.
- **Not done:** any v1.2 backend code; end-to-end with the real model; ChatFlow-side changes (not touched).

### 2026-10-28 (live verification, first real run)
- **Committed** the earlier uncommitted `.env`-loading and `verify:live` work (`0cab1da`, `8ee8552`, `fca633b`).
- **Fixed:** seed payload (`error: null`); Pidgin no longer attempts Khaya (+ test). **Added:** `scripts/start-local-cls.sh`. Tests 78/78.
- **Still open:** Gemma key; model id; ASR with a real recording; end-to-end demo story (`npm run verify:live -- --e2e`); `userId` filter in `_Modules/central-logging-service` still uncommitted (KL-9, user action); native-speaker samples.

### 2026-10-28 (later): live-verification prep
- **Built:** `src/loadEnv.js` + `test/loadEnv.test.js` (3 tests); `.env` loading in `src/server.js`, `scripts/seed-logs.js`, `scripts/check-khaya.js`; `scripts/verify-live.js` + `npm run verify:live`.
- **Found:** `.env` was never read by any entry point. `GEMMA_API_KEY` is empty. Khaya and the local log service are unreachable from the build sandbox (inconclusive, not a failure).
- **Broke and fixed (in my own script, found by running it against the mock server):** the e2e capability check wrongly failed when voice was off; the Kofi-scoping check false-positived on the customer's own echoed words. Both fixed; e2e then passed 6/6 against the mock.
- **Verified:** `npm test` 77/77; `node --check` clean; no leftover processes.
- **Deliberately not done:** live verification, committing, new endpoints (`/widget.js`, `/docs` page remain unbuilt: KL-10).
- **Commit:** none (uncommitted). Suggested, one per issue: `git add src/loadEnv.js test/loadEnv.test.js src/server.js scripts/seed-logs.js scripts/check-khaya.js && git commit -m "Load .env in server and scripts"`, then `git add scripts/verify-live.js package.json && git commit -m "Add live verification script"`, then `git add PROGRESS.md && git commit -m "Update PROGRESS"`. Record the hashes here.

### 2026-10-28 (landing page: orb on the API)
- **Built:** `site/src/lib/api.ts` (small fetch client for `/v1/config`, `/v1/demo/token` and `/v1/support/message`, with error codes turned into plain sentences); `AiOrb.tsx` now chats in place per `docs/openapi.yaml`; `NEXT_PUBLIC_API_URL` documented in `site/README.md`.
- **Reconciliation:** the merge `b483d54` (main into landing-page, made by the user) replaced this file with main's copy. The landing-page changelog entries for rounds 3 to 5, the loader entry and KL-29's original wording survive in `git show 65ba980:PROGRESS.md`; the round 5 decisions and KL-26 to 29 are still present above. Not rewritten here.
- **Verified:** `npx tsc --noEmit` and `npm run build` in `site/` clean. No API, `web/` or `.env` change (`git status` shows only `site/` and this file).
- **Not done:** a live chat round trip (needs `CORS_ORIGIN` and `GEMMA_API_KEY`, KL-30); no servers started, per the user's earlier "stop".
- **Commit:** see the next entry.

