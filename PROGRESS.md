# PROGRESS

Single source of truth for project state. Read top to bottom at the start of every session.

## Status Snapshot

| Field | Value |
|---|---|
| Current phase | **v1.0 backend complete** (hackathon core). Next: **v1.1 expansion**: contract -> landing page -> user dashboard -> API functionality. Task: `docs/CLAUDE_CODE_PROMPT.md`. |
| Blocking issues | None hard-blocking. Needs the user's keys (KL-2, KL-3) and a committed `userId` filter in central-logging-service (KL-9). |
| Next action | `git init -b main` + first commit, `npm install`, run `npm test`, then Phase 0 of `docs/CLAUDE_CODE_PROMPT.md`. |
| Repo state | **Not a git repository; every file is uncommitted** (KL-16). Cross-repo: `../central-logging-service` has an uncommitted `userId` filter (3 files). |
| Verified running | `npm test`: **28/28 pass** (Express resolved from `../central-logging-service/node_modules` because `npm install` was blocked in the build sandbox). Live smoke test of the real server OK: `/health`, `/v1/config`, `/v1/knowledge`, `/v1/tickets`, `/v1/demo/token`, and `503 llm_not_configured` when no model key. `node --check` clean on all source files. **Not verified against live Gemma, Khaya or central-logging-service.** No analyzer/linter configured (KL-7). |
| Deadline | Hackathon submission ~19:00 Africa/Accra, 2026-10-28. Feature freeze target 18:00. |

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

## Known Limitations

1. In-memory store: tickets and knowledge reset on restart. (v1.1: SQLite.)
2. Khaya **translate** path/body (`/v1/translate`, `{in, lang}`) is unverified; ASR/TTS shapes come from Maame. Run `npm run check:khaya`.
3. Gemma 4 model id on the Gemini API is unverified (`GEMMA_MODEL=gemma-4-31b-it` is a guess). The adapter retries without system instructions/JSON mode on a 400.
4. Ghanaian Pidgin code for Khaya (`kpo`) is unverified; falls back to Gemma.
5. Round-trip quality is word-overlap (Jaccard), a cheap signal, not a human evaluation.
6. Single tenant; no accounts. Console is protected by one shared `CONSOLE_KEY`.
7. No analyzer/linter or CI configured. Verification is `node --test` + `node --check`.
8. `test/server.test.js` needs `npm install` (Express). Verified here only with Express borrowed from another repo's `node_modules`.
9. The `userId` filter exists only as an **uncommitted** working-tree change in `../central-logging-service` (`src/routes/logs.js`, `src/models/Log.js`, `tests/logsUserFilter.test.js`; that repo's suite: 78/78). Helply cannot find a customer's logs without it deployed.
10. Frontend not built; specs only (`docs/FRONTEND_SPEC.md`).
11. Rate limiter is in-memory per IP and ignores `trust proxy`; behind DigitalOcean's proxy it needs `app.set("trust proxy", ...)`.
12. Hints come from the model; clamped and validated, but search quality depends on the model's keyword choices.
13. `scripts/seed-logs.js` has **never been run against a live central-logging-service**; the log-batch schema it posts is inferred from that service's README.
14. Gemma adapter, Khaya client and the end-to-end flow were tested only with fakes, never with live APIs.
15. Logs must carry `metadata.userId`; the AcademicX and pharma apps still run the old `@bevingh/telemetry` 0.2.0, which ships raw auth headers and bodies to central-logging-service. **Never point the demo at their real logs.**
16. **Nothing is committed** (no git repo in `helply`). Rule 7 of the session discipline is therefore unmet this session; first action next session.
17. Twi/Ga/Ewe/Pidgin sample messages for the demo have not been written or reviewed by a native speaker.

## Next Steps

1. `git init -b main`, first commit, record the real hash here (KL-16).
2. `npm install`; run the full suite; confirm 28/28 without borrowed modules (KL-8).
3. Commit and push the `userId` filter in `central-logging-service` (KL-9).
4. Obtain `GEMMA_API_KEY`, `KHAYA_API_KEY`, a read-only `CLS_API_KEY` and a `logs:write` key; set `.env`.
5. `npm run check:khaya`; fix `src/language/khaya.js` if translate differs (KL-2). Confirm the Gemma model id (KL-3).
6. `npm run seed` against a live central-logging-service; run the demo story end to end (KL-13, KL-14).
7. Execute `docs/CLAUDE_CODE_PROMPT.md`: contract + OpenAPI -> landing page + demo page -> user dashboard -> API functionality (SQLite, workspaces, auth, analytics, audit, webhooks...).
8. Get a native-speaker Twi sample message (KL-17). Rehearse `docs/DEMO_SCRIPT.md`.
9. Deploy (API + static site) on DigitalOcean; record the demo; Devpost write-up. Feature freeze 18:00.

## Changelog

### 2026-10-28: v1.0 backend, docs, tests
- **Built:** config; token sign/verify; redaction; read-only log client; evidence builder (hint validation, scope re-check, ranking, line ids); Gemma adapter; Khaya client; language layer with fallback and round-trip similarity; support agent (identity, understanding, translation, knowledge answers, evidence-based explanations, ticket creation, output cleaning); in-memory store; Express API (health, config, demo token, text and voice support, console tickets/knowledge, CORS, rate limit); seed and Khaya check scripts; docs (README, ARCHITECTURE, API_CONTRACT, FRONTEND_SPEC, DEMO_SCRIPT, API_ROADMAP, CONTRIBUTING, CLAUDE_CODE_PROMPT); `CLAUDE.md`.
- **Cross-repo:** `central-logging-service` `GET /api/v1/logs?userId=` filter + index + `tests/logsUserFilter.test.js` (uncommitted there).
- **Broke and fixed:** `npm install` was blocked (403) in the build sandbox, so Express was borrowed from the other repo for verification. A first run of that repo's suite with `npx jest` showed 12 failures; they were only the missing `--experimental-vm-modules` flag (`npm test` passes it), then 78/78. One Helply run showed 23/24 because Express was off the path; with it, 28/28.
- **Deliberately not done:** frontend implementation, persistence, accounts/roles, WhatsApp calling, live-API verification, committing (see KL-16).
- **Commit:** none (no git repository yet).
