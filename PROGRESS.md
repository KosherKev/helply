# PROGRESS

Single source of truth for project state. Read top to bottom at the start of every session.

## Status Snapshot

| Field | Value |
|---|---|
| Current phase | **v1.1 built** (API + OpenAPI + web app). Remaining before submission: keys, live-service verification, deploy, demo rehearsal, Devpost write-up. |
| Blocking issues | None hard-blocking in code. Needs the user's keys (KL-2, KL-3), a native-speaker Twi sample (KL-17) and the committed `userId` filter in `../central-logging-service` (KL-9). |
| Next action | Set `.env` (Gemma, Khaya, CLS keys), `npm run check:khaya`, `npm run seed`, run `docs/DEMO_SCRIPT.md` end to end against live services; then deploy. |
| Repo state | Git repository on `main`. v1.1 code landed in `2519d06`; this file's own commit follows it. `../central-logging-service` still has its `userId` filter **uncommitted** (not touched by this session). |
| Verified running | `npm test`: **74/74 pass** (Node 22.12, `--experimental-sqlite`). `cd web && npm run build` (tsc + vite + prerender): clean. Lighthouse mobile on the production build of `/`: **performance 96, accessibility 100, best practices 100**, no console errors. UI exercised in the in-app browser against the real API with **scripted fakes for Gemma, Khaya and the log service** (login, overview, conversations, takeover, translated reply preview, tickets, connections test, API key, webhook SSRF refusal, invite, audit), and checked at 375px (no horizontal scroll). **Not verified against live Gemma, Khaya or central-logging-service.** No linter configured (KL-7). |
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

## Known Limitations

1. ~~In-memory store.~~ Resolved: SQLite (`HELPLY_DB_PATH`, default `.data/helply.db` for `npm start`). Tests use `:memory:`.
2. Khaya **translate** path/body (`/v1/translate`, `{in, lang}`) is unverified; ASR/TTS shapes come from Maame. Run `npm run check:khaya`.
3. Gemma 4 model id on the Gemini API is unverified (`GEMMA_MODEL=gemma-4-31b-it` is a guess).
4. Ghanaian Pidgin code for Khaya (`kpo`) is unverified; falls back to Gemma.
5. Round-trip quality is word-overlap (Jaccard), a cheap signal, not a human evaluation.
6. ~~Single tenant; no accounts.~~ Resolved: workspaces, users, roles, sessions. Sessions are not revocable per device beyond logout/removal; no password reset or email delivery (invitation links are returned, not emailed); no MFA.
7. No linter configured. Verification is `node --test`, `node --check`, `tsc -b`.
8. ~~`test/server.test.js` needs `npm install`.~~ Resolved: 28/28 passed with real Express in a clean install (Phase 0).
9. The `userId` filter exists only as an **uncommitted** working-tree change in `../central-logging-service`. Helply cannot find a customer's logs without it deployed. The dashboard's "Test connection" now detects a source that ignores the filter (`filter_ignored`).
10. ~~Frontend not built.~~ Resolved for `/`, `/demo` and `/app/*`. **Not built:** `/docs` page, `/console` legacy routes (superseded by `/app`), embeddable widget.
11. ~~Rate limiter ignores `trust proxy`.~~ Resolved: `TRUST_PROXY` configures it; set it to `1` behind DigitalOcean. Limiters are in-process (not shared across instances).
12. Hints come from the model; clamped and validated, but search quality depends on the model's keyword choices.
13. `scripts/seed-logs.js` has **never been run against a live central-logging-service**.
14. Gemma adapter, Khaya client and the end-to-end flow were tested only with fakes, never with live APIs. The UI walk-through in this session also used fakes.
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
27. No end-to-end browser test suite; UI behaviour was verified manually in the in-app browser. Frontend has no unit tests.

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
- **Processes:** the dev API (scripted fakes), Vite dev server and preview server started this session were stopped; none left running.
- **Commits:** `69e08d6` (v1.0 as found) ... `2519d06` (v1.1 code, dashboard, fixes, docs). This file's own commit is the next one on `main` (`git log -1 -- PROGRESS.md`).
