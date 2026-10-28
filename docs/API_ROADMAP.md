# API roadmap (v1.1): PLANNED contract

Status: **planned, not implemented.** The implemented contract is `docs/API_CONTRACT.md`. When you implement something here, move it into `API_CONTRACT.md` (and `openapi.yaml`) in the same commit. Changes to `/v1` are additive only.

## Cross-cutting rules
- **Auth modes:** (a) *customer token* (signed by the company's backend; public support endpoints), (b) *session* (`Authorization: Bearer <opaque>` for dashboard users, stored hashed, 12h), (c) *API key* (`Authorization: Bearer hk_live_...`, server-to-server, hashed, scoped). Tenant id always comes from the credential, never the body.
- **Roles:** `owner` > `admin` > `agent`. Agents: conversations, tickets, review. Admins: + knowledge, connections, team, keys, webhooks, settings. Owners: + workspace deletion/transfer.
- **Pagination:** cursor (`?limit=&cursor=`) -> `{ data: [], nextCursor: string|null }`.
- **Idempotency:** `Idempotency-Key` header on create endpoints.
- **Request ids:** `X-Request-Id` on every response; errors keep `{ error: { code, message } }` and add `requestId`.
- **Rate limits:** per workspace and per IP; `RateLimit-Limit/Remaining/Reset` headers; stricter on login.
- **Secrets at rest:** log-source API key and webhook secrets encrypted with AES-256-GCM (`HELPLY_ENCRYPTION_KEY`); passwords scrypt; session tokens and API keys stored as SHA-256 hashes.
- **Retention & privacy:** message retention days per workspace (default 30); `DELETE /v1/customers/:userId/data` erases a customer's conversations, messages and tickets (Ghana Data Protection Act readiness). Audit events are immutable.
- **Spec of record:** `docs/openapi.yaml`, with contract tests that fail when code and spec diverge.

## Endpoints

### Accounts, workspace, team
| Method | Path | Notes |
|---|---|---|
| POST | `/v1/auth/register` | `{ email, password, workspaceName }`. Open only when `ALLOW_SIGNUP=true` (demo). Creates workspace + owner. |
| POST | `/v1/auth/login` / `/logout` | -> `{ session, expiresAt, user, workspace }`. Lockout/backoff after repeated failures. |
| GET | `/v1/auth/me` | current user, role, workspace. |
| GET/PATCH | `/v1/workspace` | name, enabled languages, escalation threshold (round-trip similarity), retention days, brand colour. |
| GET | `/v1/team` | members + pending invitations. |
| POST | `/v1/team/invitations` | `{ email, role }` -> invitation token (email delivery out of scope; return a link). |
| PATCH/DELETE | `/v1/team/:userId` | change role / remove (cannot remove the last owner). |
| GET/POST/DELETE | `/v1/api-keys` | create returns the key once; list shows prefix + last used; scopes: `identity:mint`, `conversations:read`, `tickets:read`, `tickets:write`. |

### Connections
| Method | Path | Notes |
|---|---|---|
| GET/PUT | `/v1/log-source` | `{ baseUrl, apiKey (write-only), service, userIdField }`. Read returns a masked key. |
| POST | `/v1/log-source/test` | verifies connectivity and that `?userId=` filtering works; returns `{ ok, sampleCount, issues: [] }` (flag "logs carry no metadata.userId"). |
| POST | `/v1/identity/tokens` | API-key auth. `{ userId, name? }` -> `{ token, expiresIn }`. Lets a company mint customer tokens without sharing a secret. |
| GET | `/widget.js` | embeddable chat script (`data-workspace`, `data-token`). |
| POST | `/v1/widget/session` | origin-allowlisted bootstrap for the widget. |

### Conversations (customer side adds to the existing endpoints)
- `POST /v1/support/message` and `/voice` gain optional `conversationId` and return `conversationId` + `messageId`; prior turns (last 6) give the model context. Replies include `reply.sources` (knowledge titles used).
- `GET /v1/conversations/:id/events` (SSE, customer token): stream agent replies and status changes.

### Conversations (dashboard side)
| Method | Path | Notes |
|---|---|---|
| GET | `/v1/conversations` | filters: `status` (`ai`, `needs_human`, `human`, `resolved`), `language`, `q`, `userId`, date range. |
| GET | `/v1/conversations/:id` | messages with `understanding`, `roundTrip`, evidence line ids and trace. |
| POST | `/v1/conversations/:id/takeover` | agent takes over; AI stops replying. |
| POST | `/v1/conversations/:id/messages` | agent reply; `{ text, language: "en"|"customer" }`; translated to the customer's language with a round-trip check; may land in the review queue. |
| POST | `/v1/conversations/:id/resolve` | |
| GET | `/v1/events` | SSE for the dashboard (new ticket, handoff, review needed). |

### Review queue (translation safety)
`GET /v1/replies/pending`, `POST /v1/replies/:id/approve` (`{ text? }` edits before sending), `POST /v1/replies/:id/reject`. A reply is queued when `roundTrip.reviewRecommended` is true and the workspace setting `holdFlaggedReplies` is on.

### Tickets
| Method | Path | Notes |
|---|---|---|
| GET | `/v1/tickets` | cursor pagination; filters `status`, `assigneeId`, `priority`, `language`, `q`. |
| PATCH | `/v1/tickets/:id` | `{ status, assigneeId, priority }`. |
| POST | `/v1/tickets/:id/notes` | internal note. |
| GET | `/v1/tickets/:id/export` | `?format=github-markdown` -> `{ title, body }` (the developer handoff). |

### Knowledge
`POST /v1/knowledge/upload` (`.txt`, `.md`, `.csv`, base64 or multipart, size-capped), `PUT /v1/knowledge/:id`, `POST /v1/knowledge/:id/reindex`. Existing list/create/delete stay.

### Analytics
- `GET /v1/analytics/summary?from=&to=` -> `{ conversations, resolvedByAI, handedOff, handoffRate, avgFirstResponseMs, languages:[{code,count}], intents:[{intent,count}], reviewRate, topRootCauses:[{fingerprint,summary,count,lastSeen}] }` (fingerprint root causes the way central-logging-service's `errorFingerprint` does).
- `GET /v1/analytics/timeseries?metric=conversations|handoffs|errors&interval=hour|day`.

### Audit
`GET /v1/audit?actor=&action=&from=&to=` (admin+). Events: `log_lookup` (user, lines used, ticket), `login`, `settings_changed`, `key_created/revoked`, `ticket_updated`, `reply_approved`, `data_erased`. Every log lookup MUST write one.

### Webhooks (outbound)
`GET/POST/DELETE /v1/webhooks` (`{ url, events[] }`; secret returned once), `POST /v1/webhooks/:id/test`, `GET /v1/webhooks/:id/deliveries`. Events: `ticket.created`, `ticket.needs_human`, `reply.needs_review`, `conversation.handoff`. Signed `X-Helply-Signature: sha256=<hmac>` over `timestamp.body`; retries with backoff. **SSRF protection is mandatory** (https only, resolve DNS and block private/loopback/link-local/metadata ranges, also after redirects, short timeout, capped response).

### Privacy
`DELETE /v1/customers/:userId/data` (admin+, audited).

## Persistence (replace the in-memory store)
SQLite behind the existing store interface (prefer `node:sqlite` on Node >= 22.13, else `better-sqlite3`). Tables: `workspaces, users, memberships, invitations, sessions, api_keys, conversations, messages, tickets, ticket_notes, knowledge_docs, knowledge_chunks, audit_events, webhooks, webhook_deliveries, settings`. Every table with tenant data carries `workspace_id`; every repository method takes it as a required argument.
