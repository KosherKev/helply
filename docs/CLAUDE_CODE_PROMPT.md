# Claude Code kickoff: Helply v1.1

You are continuing a hackathon project (CIREN Hacktoberfest 2026, "Build the Next B2B Company on Open Source"). Submission target: **19:00 Africa/Accra on 2026-10-28; feature freeze 18:00**. Work autonomously. Make reasonable decisions, record them in `PROGRESS.md`, and keep going. Ask only if you are blocked on something only the user can provide (keys, a product decision that changes scope).

## 0. Read first, then reconcile (15 min)
1. Read `CLAUDE.md`, then `PROGRESS.md` top to bottom, `README.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`, `docs/API_ROADMAP.md`, `docs/FRONTEND_SPEC.md`, `docs/DEMO_SCRIPT.md`.
2. If the repo is not a git repository yet: `git init -b main`, make the first commit of everything that exists (short message), and record the real hash in `PROGRESS.md`. Do not merge branches.
3. `npm install`, then `npm test` and confirm everything passes (28 tests at last count; if `server.test.js` fails, Express is missing). Record the real result.
4. Skim the code. If `PROGRESS.md` disagrees with `git log` or the code, reconcile in its own section.
5. Post a short plan (phases, order, what you will cut if late). Then proceed.

## Product in one paragraph
A customer writes or speaks in Twi, Ga, Ewe, Pidgin or English. Helply verifies who they are (a short-lived token signed by the company's backend), reads only that customer's recent logs from central-logging-service (redacted, read-only), explains what went wrong in their language citing log lines, translates back as a quality check, and gives developers a ticket with the evidence. Model: Gemma 4. Language: GhanaNLP Khaya (Gemma fallback). Open core: MIT self-host, paid hosting/connectors.

## Non-negotiables
The security invariants in `CLAUDE.md` (verified identity only, retrieval not tools, double scope check, redact before the model, read-only, cited-or-rejected, fail closed, workspace isolation) must not regress. Every new endpoint needs authorization tests including the negative cases (wrong role, wrong workspace, no credential). Keep all existing tests green.

## Workstream 1: expand functionality and the API contract (docs first, ~30 min)
- Review `docs/API_ROADMAP.md`. Challenge it: cut anything that will not be demo-visible by 18:00, keep the security-relevant pieces. Record cuts in the Decisions log.
- Produce `docs/openapi.yaml` (OpenAPI 3.1) covering the CURRENT API plus the roadmap items you will build. Update `docs/API_CONTRACT.md` with the TypeScript types for every new response. Mark anything planned-but-not-built as PLANNED.
- Add contract tests that fail if a route exists in code but not in the spec, or the reverse.
- Define the DB schema (SQLite) with `workspace_id` on every tenant table. Write it as a migration file.

## Workstream 2: landing page (~45 min)
Build `web/` (Vite + React + TypeScript + Tailwind, React Router, `VITE_API_URL`). Implement **only the homepage `/` and the live demo `/demo`** from `docs/FRONTEND_SPEC.md` first (sections 1, 2, 3, 8). Follow the copy there; `BRAND` from `web/src/brand.ts`. Requirements: responsive at 375px, accessible, renders sections 1 to 8 without JS, Lighthouse mobile performance >= 90, no placeholder text. The demo page must work against the real API (signed-in-as selector, quick prompts, mic, Glass Box). Ask the user for a Twi sample message instead of inventing Twi.

## Workstream 3: user dashboard (~90 min)
The "users" are the **company team members** who run support (owner, admin, agent). Build under `/app` (separate layout from the marketing site), auth via the session endpoints. Pages, in priority order:
1. `/login` (and `/signup` when enabled).
2. **Overview:** KPI cards (conversations, resolved by AI, handoff rate, avg first response), language mix, intents, top root causes, tickets needing a human. Charts: lightweight (hand-rolled SVG or a small library).
3. **Conversations:** filterable list; detail view with the transcript, the Glass Box (reuse the demo components), takeover, and an agent reply composer that previews the translation and its round-trip check.
4. **Tickets:** list with filters, detail with root cause, evidence, notes, assignee, status, **Copy as GitHub issue**.
5. **Review queue:** flagged translations to approve, edit or reject.
6. **Knowledge:** list, add, upload `.txt/.md/.csv`, delete.
7. **Connections:** log-source setup with a Test button (explains problems in plain words, e.g. "your logs carry no metadata.userId"); identity setup showing the token-minting snippet and a "mint test token" button; channel snippets (widget, ChatFlow).
8. **Developers:** API keys, webhooks (+ test delivery + delivery log), link to docs. **Team**, **Audit log**, **Settings** (languages, escalation threshold, retention, hold flagged replies).
Every list needs loading, empty and error states. Render all server text as plain text. Tokens in memory only. If time is short, cut in this order: Settings, Team, Audit, Developers, Review queue (keep Overview, Conversations, Tickets, Knowledge, Connections).

## Workstream 4: API functionality (~90 min, run alongside Workstream 3)
Implement in this order, each with tests: (1) SQLite store behind the existing interface + migrations; (2) workspaces, users, sessions, roles, auth middleware (scrypt, hashed session tokens, login backoff); (3) tenant scoping on every query + an isolation test matrix (two workspaces, every endpoint); (4) conversations/messages persistence, `conversationId` continuity, takeover, agent replies with translation; (5) log-source settings with encrypted API key + test endpoint; (6) API keys + `POST /v1/identity/tokens`; (7) tickets (pagination, assignee, notes, export); (8) analytics summary/timeseries; (9) audit events (every log lookup must write one); (10) review queue; (11) outbound webhooks with HMAC signing and **SSRF protection**; (12) knowledge upload + reindex; (13) SSE events; (14) customer data erasure. Add per-workspace rate limiting and `trust proxy` configuration for deployment behind DigitalOcean's proxy.

## Dependencies you must not forget
- central-logging-service needs the `userId` filter (matches `metadata.userId`). It exists as an UNCOMMITTED change in `../central-logging-service` (`src/routes/logs.js`, `src/models/Log.js`, `tests/logsUserFilter.test.js`). Tell the user to commit and push it; do not touch their other repo's git state.
- When keys exist: verify the real Gemma 4 model id (`GEMMA_MODEL`) and Khaya's translate endpoint with `npm run check:khaya`; fix `src/language/khaya.js` accordingly. Run `npm run seed` against a live central-logging-service and confirm the demo story works end to end. These were never verified against live services (see Known Limitations).

## Cut lines and definition of done
- **18:00 feature freeze.** After that: bug fixes, deploy (API + static site on DigitalOcean), demo rehearsal from `docs/DEMO_SCRIPT.md`, README polish, Devpost write-up.
- Done means: tests pass (full suite, shown), the demo flow in `docs/DEMO_SCRIPT.md` works end to end against real services, the frontend builds with no TypeScript errors, `PROGRESS.md` is current, and everything is committed with real hashes recorded.

## Session discipline
Follow "Session continuity & documentation discipline" in `CLAUDE.md` exactly: update the Status Snapshot, Decisions log, Known Limitations, Next Steps and Changelog; verify before claiming done; commit code and docs; record the real hash; end any process you started.
