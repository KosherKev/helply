# Admin dashboard spec (the team dashboard under `/app`)

For the developer building the dashboard in parallel with the backend. Read with `docs/handover/DASHBOARD_AND_DEMO.md` (what exists and the security rules), `docs/openapi.yaml` (every route; planned ones are `x-planned`), `docs/API_V1_2_PLAN.md` (planned behaviour) and `docs/brand/README.md` (look and voice; it overrides the older colours in `FRONTEND_SPEC.md`). Run `npm run dev:mock`: real routes work, planned routes answer with fixtures. **Onboarding, business profile, FAQ, channels and the relay are real now**: use the real backend (log in as `owner@kwikpay.demo`). New workspaces you register start with the AI paused, by design; the demo workspace is live.

Legend: **Built** = backend route exists and the page exists. **Page todo** = backend exists, page not built or incomplete. **Planned** = backend route does not exist yet (use the mock). Priorities P0/P1/P2 match `x-priority` in the spec.

## 1. What the dashboard is for
A company uses Helply so customers get a real answer in their own language and developers get the evidence. The dashboard has three jobs: get a company **live** (onboarding), let **people handle what the AI cannot** (agents), and make the AI and the product **better every week** (quality loop). Principles: show the evidence behind every AI answer; never hide a handoff; every list has loading, empty and error states; nothing destructive without a confirm; status is never colour alone.

## 2. People and their workflows
| Person | Role | Wants | Daily loop |
|---|---|---|---|
| Support agent | `agent` | Clear the queue fast, with the proof in front of them | Inbox (needs human) -> conversation (evidence, translated reply) -> resolve |
| Developer / engineer | `agent` or `admin` | Fix causes, not symptoms | Issues (grouped root causes) -> GitHub issue with evidence -> mark fixed |
| Support lead / admin | `admin` | Keep the AI accurate and safe | Knowledge gaps -> add FAQ or playbook -> review flagged translations -> check quality |
| Owner | `owner` | Get live, control access, stay compliant | Onboarding -> team -> connections -> audit and privacy |
The role diagram shown in the planning chat (three lanes: agent, developer, admin) is the source for this table.

### Workflow A: onboarding a company (first session, owner/admin)
1. Create workspace (sign-up) -> land on **Onboarding** (not Overview) until the AI is live.
2. Steps are computed by the backend (`GET /v1/onboarding`), shown as a checklist with the next action highlighted, in this order: ship logs with the user id (their side) -> connect the log source -> connect identity -> **business details** -> **FAQ and policies** -> link the chat channel -> test as a customer -> switch the AI on.
3. Each step deep-links to the real page with a "Back to setup" bar. Nothing is forced in order except "switch on" (needs `readyForLive`).
4. After go-live, the checklist collapses to a "Setup complete" chip; Overview becomes the home page.

### Workflow B: a customer is handed over (agent)
AI replies or hands over (`needs_human`) -> SSE toast and Inbox badge -> agent opens the conversation, sees transcript + Glass Box (identity, evidence, root cause) -> **Take over** -> writes in English, previews the translation and back-translation check -> sends -> resolves. If a reply is flagged it lands in the Review queue instead.

### Workflow C: a problem recurs (developer)
Several customers hit the same failure -> they appear as **one issue** with count and affected customers -> developer opens it, copies "GitHub issue" -> marks **fixed** -> (P2) notifies affected customers -> if it recurs the issue reopens.

### Workflow D: the AI missed a question (admin)
Customers ask something no FAQ or document covers -> it appears in **Knowledge gaps** with a count -> admin writes the answer once ("Create FAQ from this") -> the gap closes and the AI answers next time.

### Workflow E: linking ChatFlow (admin; backend built, see `docs/CHATFLOW_INTEGRATION.md`)
Connections > Chat channel > "Connect ChatFlow" (label + ChatFlow widget id) -> relay key shown once with copy and a short "paste this in ChatFlow: property > AI assistant" guide -> status goes `pending` to `connected` when ChatFlow first calls Helply -> "Send test" confirms. Rotating or disconnecting a key asks for confirmation and explains what stops working.

## 3. Navigation and routes
Top bar: workspace name; **AI status** switch (Live / Paused; Paused sends everything to people; confirm dialog; admin only). Backend is built: `PATCH /v1/workspace` with `{ settings: { aiLive } }`; the same switch moves to `onboarding/go-live|pause` when those ship; **Setup n/9** badge while not live; user menu (profile, sign out). Sidebar groups, in this order:
| Group | Page | Route | Min role | Status |
|---|---|---|---|---|
| Work | Inbox | `/app/inbox` (replaces Conversations) | agent | Page todo + Planned counts (P0) |
| | Conversation | `/app/inbox/:id` | agent | Built (move route) |
| | Tickets, ticket | `/app/tickets`, `/:id` | agent | Built |
| | Issues, issue | `/app/issues`, `/:id` | agent | Planned P1 |
| Quality | Overview | `/app` | agent | Built |
| | Review queue | `/app/review` | agent | Built |
| | Knowledge gaps | `/app/quality/gaps` | agent (resolve: admin) | Planned P1 |
| | AI quality | `/app/quality` | agent | Planned P1 |
| Business | Business details | `/app/business` | agent (edit: admin) | Backend built; page todo |
| | FAQ | `/app/business/faq` | agent (edit: admin) | Backend built (incl. CSV import); page todo |
| | Documents and sites | `/app/business/documents` | agent (edit: admin) | Built (documents) / Planned P1 (sites) |
| | Playbooks | `/app/business/playbooks` | agent (edit: admin) | Planned P1 |
| | Handoff rules | `/app/business/handoff` | agent (edit: admin) | Planned P1 |
| Setup | Onboarding | `/app/onboarding` | agent (act: admin) | Backend built; page todo |
| | Connections | `/app/connections` (Logs, Identity, Chat channel tabs) | admin | Built (logs, identity, **chat channel: backend built**, page todo) |
| | Developers | `/app/developers` | admin | Built |
| | Team | `/app/team` | admin | Built |
| | Customers | `/app/customers`, `/:id` | agent | Planned P2 |
| | Audit log | `/app/audit` | admin | Built |
| | Settings and privacy | `/app/settings` | admin | Built |
Login adds "Forgot password" (Planned P1). Role gating hides links but the API is the authority: handle 401/403/404 on every page.

## 4. Page specs
**Onboarding** (`GET /v1/onboarding`, `POST /v1/onboarding/test|go-live|pause`). Progress bar `completed/total`; list of steps with status chips (done, to do, their side, blocked) and a primary button per step (`actionPath`). `their_side` shows the instructions and the `@helply/node` snippet when it exists. "Test as a customer": pick or type a customer id and a message, run it, show the **Glass Box** result (reuse the component) and what a customer would see. "Switch the AI on" disabled with the blocking reason until `readyForLive`; on success confetti is not allowed, a calm confirmation with "Open Inbox" is. Pause is always available once live.

**Inbox** (`GET /v1/conversations`, `GET /v1/inbox/counts`, SSE). Tabs with counts: Needs human, Mine, Unassigned, AI active, Resolved. Rows: customer (name or id), last message, language, status, assignee, age; oldest "needs human" first by default; keyboard up/down/enter. Bulk none in v1. Assign via `PATCH /v1/conversations/:id`.

**Conversation** (built). Add: assignee control, "Open in ChatFlow" link when the conversation came through a channel (field arrives with the relay work), a feedback thumb on each AI reply (`POST /v1/messages/:id/feedback`, with reason on bad), and the ticket chips already shown.

**Tickets / ticket** (built). Keep "Copy as GitHub issue". Add link to its Issue (P1).

**Issues** (planned). Table: summary, severity, count, affected customers, last seen, status, assignee; filters status/search. Detail: summary, suggested fix, sample evidence table (reuse `EvidenceTable`), linked tickets, notes, status and assignee, **Copy as GitHub issue** (`/export`), **Notify affected customers** (P2: dry run count -> confirm -> send; disabled without a channel).

**Business details** (planned). One form: business name, about (what you sell), website, hours + timezone, contact email/phone, languages offered, tone (friendly/formal/concise), escalation contacts. Helper text explains the assistant quotes these. Unsaved-changes guard. Admin edits, agents read.

**FAQ** (planned). List with search, language filter, enable toggle; add/edit dialog (question, answer, language, tags); CSV import (P1, shows created/skipped/row errors); an empty state that offers three starter questions (delivery, returns, payments). Show a "used by the AI n times" figure only if the backend adds it; do not fake it.

**Documents and sites** (documents built; sites planned P1). Documents as today. Sites: add URL -> `queued/crawling/ready/failed` with page count and "Re-index"; explain what is crawled (same host, capped) and that nothing is executed.

**Playbooks** (planned P1). Table of error code, path pattern, title, owner, severity, handoff, enabled. Form: error code, optional path pattern, title, **wording for the customer (English; translated automatically)**, internal note, owner team, severity, "always hand over". Side panel "Suggestions": error codes seen in evidence without a playbook, one click to prefill. Explain: a playbook only applies when the log evidence actually shows that code.

**Handoff rules** (planned P1). Always hand over for: asked for a person (locked on), account issues (toggle); keywords list; minimum confidence slider with plain-language explanation; outside hours behaviour; notify email.

**Knowledge gaps** (planned P1). List: question, how many customers asked, language, last seen, sample conversations. Actions: **Create FAQ** (opens FAQ dialog prefilled; on save calls resolve), Link existing FAQ, Dismiss. Order by count.

**AI quality** (planned P1). Cards: rated replies, good rate, answered from knowledge, answered from logs, flagged translations; bar list of handoff reasons; date range. No invented trends: show only what the endpoint returns.

**Review queue** (built). Add the conversation's language and the customer's message (already returned).

**Connections** (built; add tab). Channel routes are **real** now: use the real backend, not the mock. Tabs: Logs (existing + the `no metadata.userId` guidance), Identity (existing; P1 adds mode switch: shared secret or public key with PEM/JWKS and key id), **Chat channel** (planned P0: list channels, connect, rotate key, test, disconnect; key shown once).

**Customers** (planned P2). Search by id/name; detail shows counts and links to conversations/tickets; **no log lines**; "Erase this customer's data" lives here and in Settings.

**Developers, Team, Audit, Settings** (built). Audit gains the new events and an action filter that reads them from the response, not a hard-coded list.

## 5. Permissions matrix (enforced by the API; the UI mirrors it)
| Capability | agent | admin | owner |
|---|---|---|---|
| Inbox, conversations, reply, takeover, resolve, tickets, issues, review queue | yes | yes | yes |
| View business details, FAQ, playbooks, rules, gaps, quality | yes | yes | yes |
| Edit any of those, knowledge, go-live/pause, test as a customer | no | yes | yes |
| Connections, channels, API keys, webhooks, audit, privacy erase | no | yes | yes |
| Team (invite agent), invite admin, change owners, rotate signing secret | no | agent only | yes |

## 6. Cross-cutting requirements
- **States:** skeleton or spinner for first load, quiet refresh for SSE ticks, empty states that say what to do next, error banners with Retry and the request id.
- **Live updates:** `GET /v1/events` events `ticket.created`, `ticket.needs_human`, `conversation.handoff`, `reply.needs_review`, `message.customer`; add `issue.created` later. Never auto-navigate; toast and badge only.
- **Security-visible UI:** tokens in memory only; render all server and customer text as text; never show a relay key, API key or secret again after creation; confirm key rotation, disconnect, delete and erase with a sentence saying what stops working.
- **Accessibility and responsiveness:** keyboard-only use, visible focus, AA contrast, labels on every control, works at 375 px and tablet; tables scroll inside their card.
- **Voice (brand):** plain verbs, sentence case, say what happened and how to fix it, no apologising. Errors from the API are already worded for humans; show them as is.
- **Telemetry:** none in v1. Do not add third-party scripts.
- **Tests:** unit tests for hooks and role gating (Vitest) and one Playwright smoke test per workflow A to E against `npm run dev:mock`.

## 7. Decisions still open (ask before building)
1. Is the Inbox a rename of Conversations or a separate page? (Recommendation: rename; keep the old route as a redirect.)
2. Should Overview stay the home page before go-live? (Recommendation: no, Onboarding is home until live.)
3. Status colours without green or gold in the brand guide (`docs/brand/README.md` suggests a mapping; needs a designer's sign-off).
4. Is "Notify affected customers" in scope for the first release? (P2; needs a channel that can message outside a live chat, which ChatFlow may not support.)

## 8. Delivery order for the dashboard developer
1. **Brand pass** (tokens, font, logo) and route restructure (sidebar groups, redirects).
2. **P0 against the mock:** Onboarding, Inbox + counts + assign, Business details, FAQ, Chat channel. Acceptance: workflows A, B and E run end to end on the mock; every page has all four states; keyboard-only pass.
3. **P1:** Issues, Playbooks, Handoff rules, Knowledge gaps, AI quality, public-key identity, forgot password.
4. **P2:** Customers, notify affected customers.
Switch a page from mock to real by deleting nothing: when the backend ships a route the same call starts returning real data. Report any field that differs from the spec as a bug against the spec.
