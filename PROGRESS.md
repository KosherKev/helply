# PROGRESS

Single source of truth for project state. Read top to bottom at the start of every session.

## Status Snapshot

| Field | Value |
|---|---|
| Current phase | **v1.1 built** (API + OpenAPI + web app). Remaining before submission: keys, live-service verification, deploy, demo rehearsal, Devpost write-up. |
| Blocking issues | None in the verified demo path. Open: `userId` filter in `../_Modules/central-logging-service` still uncommitted (KL-9, user action); native-speaker Twi/Ga/Ewe samples (KL-17); ASR untested with a real recording (KL-2); ChatFlow architecture awaiting the user's confirmation. |
| Next action | Remaining planned backend: website indexing, customers, public-key identity, password reset, notify-fixed. Then deploy (DigitalOcean) and demo rehearsal; ChatFlow-side wiring needs the user's go-ahead. Dashboard developer builds against `npm run dev:mock` (almost everything is real now). |
| Repo state | Git repository on `main`, last commit `5cf6745`. **Uncommitted from the 2026-10-28 live-verification session:** `src/loadEnv.js`, `test/loadEnv.test.js`, `scripts/verify-live.js`, edits to `src/server.js`, `scripts/seed-logs.js`, `scripts/check-khaya.js`, `package.json`, this file. `../central-logging-service` `userId` filter still uncommitted. |
| Verified running | `npm test`: **77/77 pass** (Node 22.12, `--experimental-sqlite`). `cd web && npm run build` (tsc + vite + prerender): clean. Lighthouse mobile on the production build of `/`: **performance 96, accessibility 100, best practices 100**, no console errors. UI exercised in the in-app browser against the real API with **scripted fakes for Gemma, Khaya and the log service** (login, overview, conversations, takeover, translated reply preview, tickets, connections test, API key, webhook SSRF refusal, invite, audit), and checked at 375px (no horizontal scroll). **Not verified against live Gemma, Khaya or central-logging-service** (attempted from the build sandbox on 2026-10-28: network blocked, so inconclusive, not failed). `scripts/verify-live.js --e2e` was validated against the mock server (6/6 e2e steps). No linter configured (KL-7). |
| Deadline | Hackathon submission ~19:00 Africa/Accra, 2026-10-28. Feature freeze 18:00. |

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

### 2026-10-28 (inbox, issues, playbooks, rules, gaps, quality)
- **Built:** `GET /v1/inbox/counts`, conversation assignment, issues (derived from ticket fingerprints, regression reopens, export), playbooks (+suggestions; wording injected for cited matching lines; `alwaysHandoff`), handoff rules (keyword/account-issue/low-confidence handovers; `human_request` always on), knowledge gaps (clustered, resolve to FAQ), message feedback and quality summary. Migration `004`. 18 operations promoted; 14 planned remain.
- **Decision:** handoff rules can only increase handovers, never suppress one; playbook wording never applies to lines the model did not cite.

### 2026-10-28 (rest of v1.2)
- **Built:** public-key identity (RS256/ES256), customers, notify-fixed (webhook hand-off, never direct messaging), SSRF-safe website indexing (crawler + robots.txt + limits), password reset via the email microservice. Migration `005`. **All v1.2 operations are built**; only the widget routes remain planned. Tests 121/121.
- **Decision:** the onboarding test uses a server-trusted identity instead of signing a token, so it works in public-key mode.
- **Decision:** `issue.fixed` webhook is the delivery mechanism for "notify affected customers".

### 2026-10-28 (deployment artifacts)
- **Decision: DigitalOcean Droplet + Docker Compose + Caddy, not App Platform**, because SQLite needs a persistent disk. Same-origin proxy (`/v1`, `/health`) so the site needs no CORS. Files: `Dockerfile`, `deploy/Dockerfile.web`, `deploy/Caddyfile`, `docker-compose.yml`, `deploy/production.env.example`, `deploy/docker-compose.logs.yml` (optional log service + MongoDB), `deploy/backup.sh`, `docs/DEPLOY.md`.
- **Validated:** `docker compose config` parses; the API boots in production mode (`DEMO_MODE=false`) and registers a workspace. **Not validated:** the Docker images were never built (no Docker daemon was running here) and Caddy was never started; nothing was deployed (no DigitalOcean access from this session).

### 2026-10-28 (Render deployment check)
- **Live at `https://helply-pjww.onrender.com` (user-deployed, API only).** Probe: `/health` and `/v1/config` fine (demo mode, model, Khaya, identity on); `/`, `/demo`, `/app` 404 because only the API was deployed; the demo Ama message failed closed with `ClsError` (log service unreachable from Render, `CLS_BASE_URL` not a public URL or key mismatch); CORS allows only `http://localhost:5173`; `/v1/config` exposes the demo login password (demo mode).
- **Fix built:** the API now serves `web/dist` from the same origin (`WEB_DIST`, defaulting to `web/dist` when present), API/health paths unaffected; the web app defaults to same-origin API URLs off localhost. +1 test (122/122). Needs a Render redeploy with the new build command (see `docs/DEPLOY.md` appendix).

## Known Limitations

1. ~~In-memory store.~~ Resolved: SQLite (`HELPLY_DB_PATH`, default `.data/helply.db` for `npm start`). Tests use `:memory:`.
2. ~~Khaya translate path/body unverified.~~ Verified live (translate for tw/ee/gaa/fat/dag, TTS for Twi). **ASR is still untested** (needs a .wav: `npm run check:khaya -- file.wav`).
3. ~~Gemma model id and generation unverified.~~ **Verified live 2026-10-28** (see Decisions). `gemma-4-31b-it` is valid for generateContent with the configured key (`gemma-4-26b-a4b-it` also exists). **Generation itself is unverified: the project returns 402 (credits depleted).**
4. ~~Pidgin code for Khaya unverified.~~ Khaya does **not** support Pidgin; it always uses the Gemma fallback and has no voice support.
5. Round-trip quality is word-overlap (Jaccard), a cheap signal, not a human evaluation.
6. ~~Single tenant; no accounts.~~ Resolved: workspaces, users, roles, sessions. Sessions are not revocable per device beyond logout/removal; no password reset or email delivery (invitation links are returned, not emailed); no MFA.
7. No linter configured. Verification is `node --test`, `node --check`, `tsc -b`.
8. ~~`test/server.test.js` needs `npm install`.~~ Resolved: 28/28 passed with real Express in a clean install (Phase 0).
9. The `userId` filter exists only as an **uncommitted** working-tree change in `../central-logging-service`. Helply cannot find a customer's logs without it deployed. The dashboard's "Test connection" now detects a source that ignores the filter (`filter_ignored`).
10. ~~Frontend not built.~~ Resolved for `/`, `/demo` and `/app/*`. **Not built:** `/docs` page, `/console` legacy routes (superseded by `/app`), embeddable widget.
11. ~~Rate limiter ignores `trust proxy`.~~ Resolved: `TRUST_PROXY` configures it; set it to `1` behind DigitalOcean. Limiters are in-process (not shared across instances).
12. Hints come from the model; clamped and validated, but search quality depends on the model's keyword choices.
13. ~~`scripts/seed-logs.js` never run live.~~ Run live; found and fixed a schema mismatch; 40 logs seeded into the local demo DB.
14. ~~Adapters tested only with fakes.~~ Gemma, Khaya and the log service are verified live, and `npm run verify:live -- --e2e` passes the whole demo story. **Still unverified live:** speech-to-text with a real recording, Khaya TTS for languages other than Twi, voice end to end in a browser.
15. The AcademicX and pharma apps still run `@bevingh/telemetry` 0.2.0, which ships raw auth headers and bodies. **Never point the demo at their real logs.**
16. ~~Nothing is committed.~~ Resolved: first commit `69e08d6`.
17. Twi/Ga/Ewe/Pidgin sample messages have not been written or reviewed by a native speaker. The Twi quick prompt is intentionally absent until `VITE_TWI_SAMPLE` is set.
18. **Redaction gap found and fixed this session:** secrets embedded in free-text strings (`token=...`, `password: ...`, `?api_key=...`) passed `scrubString`. Now redacted, with positive and negative tests. Other unstructured secret shapes (e.g. bare long hex strings) are still not caught; key-name and known-format rules remain the defence.
19. `cleanText` used to strip `_` and mangle identifiers (`ORDER_UPDATE_FAILED`); fixed.
20. Demo mode seeds a known owner login (`owner@kwikpay.demo`, password from `DEMO_PASSWORD`) and exposes it in `GET /v1/config`. Demo only; never enable `DEMO_MODE` in production.
21. In demo mode with no `CONSOLE_KEY`, `/v1/tickets` and `/v1/knowledge` stay open (v1.0 behaviour) for the default workspace.
22. Audit events are immutable, so they keep customer ids after `DELETE /v1/customers/:userId/data` (the erasure itself is audited). Decide whether to hash ids there before real customers.
23. Retention sweep deletes messages/conversations on an hourly in-process timer; tickets are not swept (they hold the developer evidence).
24. The mic recorder converts to 16 kHz WAV in the browser; untested on Safari and with live Khaya ASR.
25. Log-source and webhook URL checks resolve DNS at validation time; the log-source fetch itself uses the platform `fetch`, so a rebinding host is only caught at save/test time (webhooks are checked at connect time).
26. Lighthouse was run on `/` only (production build, Microsoft Edge). `/demo` and `/app` were not scored.
28. The web app does not follow the brand guide yet (see Decisions, handover). `FRONTEND_SPEC.md` §1 is superseded by `docs/brand/`.
27. No end-to-end browser test suite; UI behaviour was verified manually in the in-app browser. Frontend has no unit tests.

29. ~~`.env` was never loaded by the server or scripts.~~ Resolved this session (`src/loadEnv.js`, tested). Existing deployments must still set real environment variables.
30. ~~Gemma key empty / no credits.~~ Resolved with a new key; generation verified live.
31. `scripts/verify-live.js` e2e step names the seeded demo story (Ama/Kofi, `PAY-8842`) and needs `DEMO_MODE=true` for `POST /v1/demo/token`; it is a demo check, not a production smoke test.

32. **Latency:** an answered account question takes about 11 to 17 s end to end (understand ~4 s, explain ~5 to 7 s, translation ~1 to 4 s) against the real model. Levers, not yet pulled: run `translate_in` in parallel with the log fetch; skip `translate_in` when the model's own English is good; stream the reply; cache the explanation for repeat questions; tune `maxOutputTokens`. For the live demo, pre-send the Ama message once (see `docs/DEMO_SCRIPT.md` fallbacks).
33. Khaya quality varies by language and sentence (observed: a Twi back-translation that changed the meaning). The round-trip check and review queue exist for this; the escalation threshold (`ROUND_TRIP_THRESHOLD`, 0.4) has not been tuned on native-speaker data (KL-17).

34. Relay gaps: `cap_reached` and `outside_hours` suppression are in the contract but never emitted (they need handoff rules and business hours); `jti` replay protection is not enforced; the `Channel.status` value `error` is never set; there is no channel-level audit of failed relay calls.
35. Relay latency equals the pipeline latency (10 to 18 s). ChatFlow must keep a 25 s timeout and a fallback message (documented). A visitor-bound token (`vid`) cannot be used on the direct support API by design.
36. Channel keys are looked up by hash on every relay call with no cache (fine at this scale; revisit with load).

37. Business profile `languages` is stored but not enforced; `escalation` contacts are stored but not yet shown to customers; `hours` are free text (no outside-hours logic yet).
38. The onboarding `identity` step is satisfied by a minted token or any verified customer conversation, which proves the token path was used, not that the company's own backend signs correctly. The customer test uses a token Helply signs itself.
39. FAQ matching is keyword overlap like documents (no embeddings); paraphrased questions may miss. Knowledge-gap capture (planned) is the safety net.

40. `outsideHours` handoff option is stored but not enforced (needs business-hours parsing from the profile); `cap_reached`/`outside_hours` relay suppressions are still never emitted.
41. Issues have no stored history of status changes beyond the audit log; severity is a simple heuristic; `notify-fixed` (needs a way to message customers outside a live chat) is not built.
42. Knowledge-gap clustering is keyword-based (first 8 distinct words, sorted): paraphrases with different words create separate gaps.
43. Not live-tested this round with real Gemma (covered by fakes); the playbook wording and rule paths should be tried once against the real model.

44. JWKS URLs and key rotation by `kid` are not supported (single PEM per workspace). Password reset email has no HTML template (plain text rendered as HTML). The crawler does not execute JavaScript, so client-rendered sites index poorly.
45. Real-model live check of the latest paths (playbook wording, rules, tone with Khaya languages, crawler against a real site) has not been run.

46. Deployment is untested end to end (images unbuilt, no server). First `docker compose up` may need small fixes. No CSP header, single API process (do not scale out: in-memory rate limits/events), SQLite only.

## Next Steps

1. ~~`git init -b main`, first commit.~~ `69e08d6`.
2. ~~`npm install`; confirm tests without borrowed modules.~~ 28/28 at start; 74/74 now.
3. Commit and push the `userId` filter in `central-logging-service` (KL-9). **User action.**
4. Obtain `GEMMA_API_KEY`, `KHAYA_API_KEY`, a read-only `CLS_API_KEY` and a `logs:write` key; set `.env` (also `HELPLY_ENCRYPTION_KEY`, `HELPLY_JWT_SECRET`).
5. `npm run check:khaya`; fix `src/language/khaya.js` if translate differs (KL-2). Confirm the Gemma model id (KL-3).
6. `npm run seed` against a live central-logging-service; run the demo story end to end (KL-13, KL-14).
7. ~~Execute `docs/CLAUDE_CODE_PROMPT.md`~~: contract + OpenAPI, SQLite, auth, tenancy, conversations, tickets, analytics, audit, review, webhooks, knowledge, SSE, erasure, rate limits, homepage, demo, dashboard are built. Remaining from it: widget, `/docs` page.
8. Get a native-speaker Twi sample message (set `VITE_TWI_SAMPLE`) (KL-17). Rehearse `docs/DEMO_SCRIPT.md`; update it for `/app` (it still says `/console`).
9. Deploy: API (Node >= 22.5, `npm start`, `TRUST_PROXY=1`, `HELPLY_DB_PATH` on a persistent volume) + static site (`web/dist`, SPA fallback to `index.html`, `VITE_API_URL`) on DigitalOcean; set `CORS_ORIGIN` and `APP_URL`. Devpost write-up.

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

### 2026-10-28 (quality features)
- Tests 116/116 (+6 files of cases in `test/quality.test.js`). **Not done:** website indexing, customers, notify-fixed, public-key identity, password reset; any frontend pages.

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
