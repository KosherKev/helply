# Handover: live demo and team dashboard

**You own:** `/demo` (`web/src/pages/Demo.tsx`, `web/src/components/ChatWindow.tsx`, `web/src/hooks/useChat.ts`) and `/app/*` (`web/src/app/*`), plus shared components in `web/src/components/` (coordinate with the landing-page owner: `ui.tsx` is shared; brand tokens live in `web/src/styles/index.css`).
**API:** `docs/openapi.yaml` (spec of record), `docs/API_CONTRACT.md` (narrative + types). `web/src/types.ts` mirrors the spec by hand; if you change a type, check the spec first.

> **Next work is specified in [`../ADMIN_DASHBOARD_SPEC.md`](../ADMIN_DASHBOARD_SPEC.md)** (workflows, new pages, delivery order) against the planned routes in [`../API_V1_2_PLAN.md`](../API_V1_2_PLAN.md). `npm run dev:mock` serves fixtures for those routes.

## Run it
`npm run dev:mock` at the repo root, then `cd web && npm run dev`. Log in at `/app/login` (button "Sign in as the demo owner", or `agent@kwikpay.demo` / `helply-demo-pass` to see the agent role). Use `/demo` as Ama (signed in) to create conversations and tickets that then show up in the dashboard. API errors always look like `{ error: { code, message }, requestId }`; `web/src/api.ts` turns them into `ApiError`.

## Pages, files and the endpoints they use
| Route | File | Min role | Endpoints |
|---|---|---|---|
| `/demo` | `pages/Demo.tsx` | public | `GET /v1/config`, `POST /v1/demo/token`, `POST /v1/support/message`, `POST /v1/support/voice` |
| `/app/login`, `/signup`, `/accept` | `app/Login.tsx` | public | `POST /v1/auth/login`, `/register`, `/accept-invite` |
| `/app` Overview | `Overview.tsx` | agent | `GET /v1/analytics/summary`, `/timeseries`, `GET /v1/tickets?status=needs_human` |
| `/app/conversations` | `Conversations.tsx` | agent | `GET /v1/conversations` (filters, cursor) |
| `/app/conversations/:id` | `ConversationDetail.tsx` | agent | `GET /v1/conversations/:id`, `POST .../takeover`, `.../resolve`, `.../translate-preview`, `.../messages` |
| `/app/tickets`, `/tickets/:id` | `Tickets.tsx`, `TicketDetail.tsx` | agent | `GET/PATCH /v1/tickets`, `POST .../notes`, `GET .../export`, `GET /v1/members` |
| `/app/review` | `Review.tsx` | agent | `GET /v1/replies/pending`, `POST /v1/replies/:id/approve|reject` |
| `/app/knowledge` | `Knowledge.tsx` | agent (writes: admin) | `GET/POST/DELETE /v1/knowledge`, `POST /v1/knowledge/upload` |
| `/app/connections` | `Connections.tsx` | admin | `GET/PUT /v1/log-source`, `POST .../test`, `GET /v1/identity`, `POST /v1/identity/tokens`, `/rotate-secret` (owner) |
| `/app/developers` | `Developers.tsx` | admin | `/v1/api-keys`, `/v1/webhooks` (+ `/test`, `/deliveries`) |
| `/app/team` | `Team.tsx` | admin | `GET /v1/team`, `POST /v1/team/invitations`, `PATCH/DELETE /v1/team/:userId` |
| `/app/audit` | `Audit.tsx` | admin | `GET /v1/audit` |
| `/app/settings` | `Settings.tsx` | admin | `PATCH /v1/workspace`, `DELETE /v1/customers/:userId/data` |
Live updates: `app/AppLayout.tsx` opens `GET /v1/events` (server-sent events over `fetch`, see `hooks/useEvents.ts`) and pages reload on each event via the `tick` outlet context.

## Behaviour you must preserve (each is a security or product promise)
1. **Tokens in memory only.** The session token lives in React state (`app/auth.tsx`); a page refresh signs the user out. The customer token on `/demo` also lives in memory. Never `localStorage`/cookies for tokens.
2. **Render server text as text.** Log lines, customer messages and model replies are untrusted. No `dangerouslySetInnerHTML`. `[REDACTED]`-style markers render as grey chips (`components/EvidenceTable.tsx: Plain`).
3. **The UI never decides authorization.** Hiding a nav item by role is convenience; the API enforces roles and workspace isolation and returns 401/403/404. Handle all three gracefully (`useAuth().can(min)` is only for hiding).
4. **Every list has loading, empty and error states; every button that calls the API disables while pending.** Match the existing pages.
5. **Never convey status by colour alone** (icon + word, as `StatusPill` does).
6. **Glass Box honesty:** it shows what the pipeline actually did (identity, understanding, logs read, evidence, root cause, translation check). Do not fabricate or pad steps. The conversation page rebuilds it from stored message metadata (`toResponse` in `ConversationDetail.tsx`).
7. A reply flagged by the round-trip check shows "Translation needs review"; held replies are invisible to customers until approved.

## First job: apply the brand kit
Same table as `docs/handover/LANDING_PAGE.md` ("Your first job"): the tokens are shared, so agree **one** owner for the `@theme` block and the font change in `web/src/main.tsx`, then do the page-level work. Dashboard-specific items: the app currently has no logo (add the mark/horizontal logo in `AppLayout` and `Login`), status chips use green/gold/red (see the gap note in `docs/brand/README.md`), the chat window in `/demo` should use the brand's chat styling (Ice Blue bubbles, 20 px radius, Helply Blue for the customer).

## Known gaps (yours to take, in this order)
1. Brand pass (above).
2. No automated frontend tests. Add Vitest + Testing Library for `useChat`, `api.ts` error mapping, and the role gating; consider one Playwright smoke test against `npm run dev:mock`.
3. Mic recording converts to 16 kHz WAV in the browser (`web/src/audio.ts`); untested on Safari and against live Khaya ASR. Needs a real-device test once Kevin has keys.
4. Sessions are memory-only by design (spec), so refresh = login again. If that hurts, raise it as a product decision; do not quietly persist tokens.
5. The conversation list has no unread/assigned-to-me filter, and the Overview chart is a plain SVG: fine for now.
6. No password reset or email delivery: invitation links are shown to the admin to copy.
7. Spec items not built: `/docs` (landing owner), embeddable widget (`GET /widget.js` is PLANNED in the spec, needs a backend piece first: ask Kevin).
8. `/demo` Twi quick prompt is intentionally absent until a native speaker supplies a message (`VITE_TWI_SAMPLE`).
9. Responsive checks were done at 375 px and desktop only; check tablet.

## Asking for backend changes
Write what the screen needs (fields, filters, sort, error cases) in an issue; Kevin updates `docs/openapi.yaml` and the code and `test/contract.test.js` keeps them in sync. `/v1` changes are additive only. Do not work around a missing field by parsing text.

## Definition of done
`cd web && npm run build` clean; every new page has loading/empty/error states; keyboard-only walkthrough; works at 375 px; no new `any`; brand checklist satisfied.
