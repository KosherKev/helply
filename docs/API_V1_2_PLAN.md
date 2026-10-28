# API v1.2 plan

> **Built (2026-10-28):** channels, the relay API, token v2 claims `aud` and `vid`, the `aiLive` pause switch, **onboarding, business profile, FAQ, inbox counts and assignment, issues, playbooks, handoff rules, knowledge gaps, feedback and quality**. Still PLANNED: website indexing (`/v1/knowledge/sites`), customers, notify-fixed, public-key identity, password reset. Everything else below is still PLANNED. Integration guide for the ChatFlow side: [`CHATFLOW_INTEGRATION.md`](CHATFLOW_INTEGRATION.md).

The machine-readable contract is [`openapi.yaml`](openapi.yaml): every operation here is in it with `x-planned: true` and `x-priority` (P0 first). This file explains the **behaviour** the schema cannot. Types, request and response shapes live only in the spec (do not copy them here or they drift). Built routes are in [`API_CONTRACT.md`](API_CONTRACT.md).

## How the dashboard developer uses this
1. `npm run dev:mock` serves a fixture for every planned route (`scripts/planned-fixtures.js`; header `X-Helply-Mock: planned-route`). `test/planned-fixtures.test.js` keeps each fixture valid against the spec, so building against the mock is building against the contract.
2. Mock responses are canned: nothing persists, filters and pagination are ignored, errors are not simulated. Build error states from the error code lists below.
3. Need a change? Write the screen's needs (fields, filters, errors) in an issue. Backend updates `scripts/build-openapi.js`, regenerates the YAML and the fixtures in the same PR; `/v1` changes are additive only.
4. When a route ships, backend removes `x-planned`; the contract test then forces it to be routed and checked against its guard.

## Conventions (unchanged)
Tenant id always comes from the credential. Errors are `{ error: { code, message }, requestId }`. Lists are cursor pages `{ data, nextCursor }`. Roles: `agent` < `admin` < `owner`. New: a **relay key** (`hr_live_...`, stored hashed) authenticates a connected ChatFlow server on `/v1/relay/*` only; it can do nothing else.

## Route groups
| Group | Routes | Pri | Role | Used by |
|---|---|---|---|---|
| Onboarding | `GET /v1/onboarding`, `POST .../test`, `.../go-live`, `.../pause` | **built** | agent (read), admin | Onboarding wizard, top-bar "Setup" badge |
| Business info | `/v1/business-profile`, `/v1/faqs` (+import) **built**; `/v1/knowledge/sites`, `/v1/handoff-rules` P1 | agent read, admin write | Business section |
| Playbooks | `/v1/playbooks`, `/v1/playbooks/suggestions` | P1 | agent read, admin write | Playbooks page, Issue detail |
| Quality | `/v1/knowledge-gaps` (+resolve/dismiss), `POST /v1/messages/:id/feedback`, `GET /v1/analytics/quality` | P1 | agent / admin | Quality section, conversation view |
| Issues | `/v1/issues` (+detail, patch, export, notify-fixed) | P1 (notify P2) | agent, admin for notify | Issues page |
| Customers | `GET /v1/customers`, `GET /v1/customers/:userId` | P2 | agent | Customers page |
| Inbox | `GET /v1/inbox/counts`, `PATCH /v1/conversations/:id` (assign) | P0 | agent | Inbox tabs, assign menu |
| Channels | `/v1/channels` (+rotate-key, test) | **built** | admin | Connections > Chat channel |
| Relay | `POST /v1/relay/message`, `/events`, `/identify`, `GET /config` | **built** | relay key | **ChatFlow's server**, never the browser |
| Identity keys | `GET/PUT /v1/identity/key` | P1 | admin | Connections > Identity |
| Account | `POST /v1/auth/forgot-password`, `/reset-password` | P1 | public | Login |

## Relay protocol (ChatFlow <-> Helply)
Helply never calls ChatFlow; ChatFlow's server calls Helply (synchronously, from the place its `aiReplyService` calls Gemini today). A browser must never hold a relay key.
- **Auth:** `Authorization: Bearer hr_live_...`. The key identifies exactly one channel and therefore one workspace. Rotating a key revokes the old one at once. `POST /v1/channels` returns the key once. Disconnecting deletes the channel and its key; transcripts stay.
- **`POST /v1/relay/message`:** `externalConversationId` is ChatFlow's conversation id and is unique per channel: the first message creates the Helply conversation, later ones reuse it. `externalVisitorId` is ChatFlow's visitor UUID. `identityToken` is optional (see below); without a valid one the visitor is anonymous. ChatFlow should send the freshest token it has on every message.
- **Reply semantics:** `reply` is what to show as an AI message (`isAi: true` in ChatFlow). `reply: null` with `suppressed` set means "say nothing": `agent_online` (ChatFlow said `agentOnline: true`), `human_taken_over` (Helply conversation already in `human` status), `ai_paused` (workspace not live), `cap_reached`, `outside_hours` (per handoff rules). `needsHuman: true` means ChatFlow should route to its inbox and notify agents; the AI keeps its text in `reply` for the customer. `held: true` means the reply is waiting in Helply's review queue and `reply.text` is a holding message. `requiresAuth: true` means the customer asked about their account but is anonymous: ChatFlow should prompt sign-in.
- **Timeouts:** Helply targets under 20 s; ChatFlow must give up at 25 s and show its own fallback (`GET /v1/relay/config` returns `fallbackMessage`). A failed call must never lose the visitor's message.
- **`POST /v1/relay/events`:** keeps Helply's transcript and state in step with ChatFlow's inbox. `agent_joined` moves the conversation to `human` (AI goes silent); `agent_left` leaves it `human` until `conversation_reopened`/a new AI-eligible state is set by an admin; `agent_message` mirrors a human reply into the transcript; `conversation_closed` resolves it. Unknown `externalConversationId` returns `404 conversation_not_found`.
- **`POST /v1/relay/identify`:** call when the widget receives a refreshed identity token, so the next message does not depend on it being resent. Returns `verified` and the token's expiry. It stores nothing: identity is re-verified on every relayed message.
- **Errors:** `401 invalid_relay_key`, `403 channel_disabled`, `404 conversation_not_found`, `400 message_required|message_too_long`, `429 rate_limited` (per channel), `503 llm_not_configured`.
- **Privacy:** only the message text, the token and the two external ids cross; no visitor name/email/phone is sent or stored by Helply.

## Customer identity token v2
Today's token (HS256, shared secret, `sub`, `iat`, `exp <= 900 s`, optional `name`, `tenant`) keeps working. v2 adds, all optional so old tokens stay valid:
| Claim | Meaning | If present |
|---|---|---|
| `aud` | `"helply"` | must equal `helply` |
| `jti` | unique token id | read and returned in claims; replay rejection is NOT enforced yet |
| `vid` | ChatFlow `externalVisitorId` | must equal the relayed `externalVisitorId`, so a stolen token cannot be used from another visitor |
| `kid` | key id | selects the public key (public-key mode) |
Modes (`GET/PUT /v1/identity/key`): `shared_secret` (default; workspace secret) or `public_key` (RS256/ES256; Helply stores only the public key as PEM or JWKS URL; JWKS fetches use the SSRF-safe client, are cached and capped). `alg: none`, mismatched algorithms and lifetimes over 900 s are always rejected. **Verification order:** parse, algorithm allowed for the workspace, signature, `exp`/`iat`/lifetime, `aud`, `vid`, `sub`. Any failure means anonymous (never an error that reveals why to the visitor).
**Identity link (built, informational):** `channel_conversations` records `(channel, externalConversationId) -> conversation, externalVisitorId, customerId` so the dashboard shows who it was even when a later message arrives without a valid token. **No log lookup ever uses the link**; lookups use only the identity verified on that very message. A different verified customer on the same ChatFlow conversation gets a new Helply conversation.

## Behaviour of the new building blocks
- **Onboarding (`GET /v1/onboarding`):** steps are computed, never stored: `workspace` always done; `logs_shipped` is `their_side` until the last log-source test found `metadata.userId`, then `done`; `log_source`/`identity` from the connection tests; `business_profile` done when name, about, hours and one escalation contact exist; `knowledge` done at >= 5 enabled FAQs or >= 1 document; `channel` done when a channel has been called; `test` done once `POST /v1/onboarding/test` succeeded in the last 7 days; `live` is the stored `ai_live` flag. `readyForLive` is true when all steps before `live` are `done`. `go-live` returns `409 not_ready` otherwise.
- **`POST /v1/onboarding/test`:** mints a token for `userId` internally and runs the **real** pipeline (real logs, real model). Marked `test` so it is excluded from analytics and never emails or webhooks.
- **Business profile and FAQ:** trusted company text, passed to the model in a `<company_info>` block and used for retrieval ahead of documents. Still escaped and cleaned like any model input and output; cannot add tools or change rules. Limits: 500 FAQs, answers up to 1,000 characters. An FAQ in the customer's language is preferred; otherwise English is translated.
- **Playbooks:** matched by exact `errorCode`, optionally narrowed by a glob `pathPattern`. The matching playbook's `customerWording` is offered to the model as the approved explanation for that evidence line and `internalNote`/`ownerTeam` appear on the ticket and issue. Wording never overrides evidence: if the evidence does not show the code, the playbook is not used. `alwaysHandoff` forces `needsHuman`.
- **Handoff rules:** `minConfidence` (default 0.6): below it the AI hands over. `keywords` and `alwaysHandoffIntents` hand over before any lookup. `outsideHours` uses the profile's `hours`/`timezone`.
- **Knowledge gaps:** created when a question reaches a human because no FAQ/document answered it. The question is scrubbed (redaction rules) and clustered by normalised keywords; `count` is how many customers asked. `resolve` with `faq` creates a `source: "gap"` FAQ and closes the gap.
- **Issues:** the existing ticket fingerprint becomes the issue id; status lives in a new table. Marking `fixed` sets `fixedAt`; a later ticket with the same fingerprint reopens it with `regression: true` in a webhook payload. `notify-fixed` (P2) needs a channel and only sends to customers whose conversation was linked; `dryRun: true` must always be called first.
- **Customers:** ids, counts and links only. No log lines on this page. Erasure stays `DELETE /v1/customers/:userId/data`.
- **Feedback and quality:** `rating`/`reason` on an AI message; `goodRate` is good over rated. Feedback is per user per message (last write wins).
- **Password reset:** `forgot-password` always returns 202. Email goes through the email service; token is single use, 1 hour, stored hashed; success invalidates every session of that user.

## New audit events and webhooks
Audit: `channel_connected`, `channel_key_rotated`, `channel_disconnected`, `onboarding_test`, `ai_live_changed`, `business_profile_changed`, `faq_*`, `playbook_*`, `handoff_rules_changed`, `identity_key_changed`, `knowledge_gap_resolved`, `issue_status_changed`, `issue_customers_notified`, `password_reset`. Webhook events to add: `issue.created`, `issue.regression`, `knowledge_gap.created`.

## Storage (migration 002, sketch)
`business_profiles`, `faqs`, `knowledge_sites`, `playbooks`, `handoff_rules`, `knowledge_gaps`, `issues`, `channels` (hashed relay key), `channel_conversations` (`workspace_id, channel_id, external_conversation_id -> conversation_id`, unique), `identity_links`, `message_feedback`, `password_resets`, and the `aiLive` workspace setting (built; `false` = paused). Every table carries `workspace_id`; the schema test already enforces this.
Route-order note: register `GET /v1/knowledge/sites` before `GET /v1/knowledge/:id`.

## Backend build order
1. ~~Relay + channels + external ids (unblocks ChatFlow) and the pause switch.~~ **Done.** Still open from this step: `cap_reached` and `outside_hours` suppression (need business hours / handoff rules), `jti` replay checks.
2. Business profile, FAQ, onboarding computed steps + `onboarding/test`.
3. Inbox counts, assign, then issues, playbooks, handoff rules.
4. Knowledge gaps, feedback and quality.
5. Public-key identity, `vid`/`jti`, password reset, customers, notify-fixed.
Each step ships with tests including the negative cases (wrong workspace, wrong role, bad relay key) and the spec updated first.

## As built: onboarding, business profile, FAQ (differences from the plan above)
- **New workspaces start paused** (`aiLive: false`); the default/demo workspace and existing ones stay live. `PATCH /v1/workspace` with `aiLive: true` and `POST /v1/onboarding/go-live` share one gate: `409 not_ready` listing the open steps. Pausing is never gated.
- **Steps:** `GET /v1/onboarding` has a new `optional` field per step. `channel` is optional (companies may call the API directly); `readyForLive` ignores optional steps. `identity` is done once a token has been minted or a verified customer has used the service. `logs_shipped` and `log_source` come from the last log source test (remembered in `onboarding_state`); `test` is done for 7 days after a verified, error-free test run.
- **Test runs** (`POST /v1/onboarding/test`) create a conversation and ticket flagged `is_test`: hidden from conversation and ticket lists, analytics and root causes, and they never fire webhooks or SSE. The log lookup is still audited, marked `test: true`.
- **Company text reaches the model** as retrievable excerpts, never wholesale: enabled FAQ entries (boosted above documents) and a "Business details" excerpt (name, about, hours, contacts) are matched against the customer's question like document chunks. The profile `tone` is passed as `<tone>` to the knowledge and explanation prompts. Disabled FAQs are never offered. Personal data is scrubbed from profile and FAQ text on save. `languages` is stored but not yet enforced.
- **FAQ import:** `row` in errors counts non-empty rows with the header as row 1. Limit 500 entries; duplicate questions (case-insensitive) are skipped or 409.

## As built: inbox, issues, playbooks, handoff rules, gaps, quality
- **Inbox counts** exclude test conversations; `mine` is the calling user's `human` conversations. `PATCH /v1/conversations/:id` assigns (assignee must be a member).
- **Issues are derived, not stored:** tickets with the same root-cause fingerprint form one issue (`iss_<fingerprint>`); only status, assignee and `fixedAt` are stored. A ticket created after `fixedAt` makes it show as `open` again (regression). Severity is computed (count and affected customers). `notify-fixed` is still planned.
- **Playbooks** apply only when the evidence line's `error.code` equals the playbook's (and the optional glob matches the path). The wording is offered inside `<approved_wording>` for those lines only; `alwaysHandoff` forces a handover when such a line is cited. Wording is scrubbed on save. Suggestions come from the last 300 non-test tickets.
- **Handoff rules can only add handovers:** keywords and `account_issue` hand over before any log lookup; confidence below `minConfidence` hands over; `human_request` is always on. `outsideHours` is stored but **not enforced** (no business-hours logic yet).
- **Knowledge gaps** are recorded when the knowledge path answered nothing (not for test runs or "I want a person"); clustered by normalised keywords; the question is scrubbed. Resolving with `faq` creates a `source: "gap"` FAQ.
- **Quality:** feedback is per user per message (last write wins, notes scrubbed); `handoffReasons` are derived from stored traces (`customer_asked`, `knowledge_miss`, `no_evidence`, `logs_unavailable`, `other`).
