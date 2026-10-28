# ChatFlow integration guide (for whoever changes the ChatFlow repo)

Status: **the Helply side is built and tested** (`/v1/channels`, `/v1/relay/*`; see `docs/openapi.yaml`). Nothing in the ChatFlow repo has been changed yet. This guide says exactly what ChatFlow must do. Design rule: ChatFlow stays the chat channel and the human inbox; Helply is the AI behind it. Helply never calls ChatFlow.

## 1. Linking one ChatFlow property to one Helply workspace
1. A company admin opens Helply > Connections > Chat channel (or calls `POST /v1/channels` with `{ "kind": "chatflow", "label": "Website", "externalId": "<the property's widgetId>" }`).
2. Helply returns a **relay key** (`hr_live_...`) **once**. A ChatFlow property can be linked to only one workspace.
3. The admin pastes the key and the Helply base URL into the ChatFlow property's AI settings. Add two fields to `Property.settings.aiAutoReply` (or a new `settings.helply`): `baseUrl`, `relayKey` (encrypt the key at rest like other secrets; never return it to the mobile app after saving, show only a prefix) and a switch "Use Helply for AI replies".
4. ChatFlow calls `GET {baseUrl}/v1/relay/config` once on save to validate the key. `401 invalid_relay_key` means wrong or rotated key.
The key lets ChatFlow's **server** relay messages. It must never reach a browser or the Flutter app.

## 2. Where to call Helply
`aiReply.orchestrator.maybeReply()` already checks the gates (AI enabled, plan, no agent online, credits, per-conversation caps) and then calls `aiReplyService.generate`. When the property uses Helply, call Helply there instead of Gemini and skip ChatFlow's knowledge retrieval (Helply answers from its own knowledge base and the customer's logs). Keep ChatFlow's gates.
```js
const res = await fetch(`${helply.baseUrl}/v1/relay/message`, {
  method: "POST",
  headers: { Authorization: `Bearer ${helply.relayKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    externalConversationId: String(conversation._id),   // ChatFlow's conversation id, stable
    externalVisitorId: visitor.visitorId,               // ChatFlow's visitor UUID
    message: text,                                      // 1 to 1000 characters
    identityToken: visitor.identityToken,               // see section 4; omit when the visitor is anonymous
    agentOnline,                                        // true if any agent is online right now
  }),
  signal: AbortSignal.timeout(25_000),
});
```
Call it for **every** visitor message, even when an agent is online (send `agentOnline: true`): Helply then records the message and stays silent, so its transcript is complete. Helply typically takes 10 to 20 seconds to answer; show ChatFlow's typing indicator while waiting.

## 3. Handling the response
| Field | What ChatFlow does |
|---|---|
| `reply` (not null) | Save and emit as an agent-side message with `isAi: true`. Use `reply.text` (customer's language). `reply.english` is for your agents' view if you want it |
| `reply: null`, `suppressed` set | Say nothing. `agent_online`, `human_taken_over`, `ai_paused` (the company paused the AI), `cap_reached`, `outside_hours` |
| `needsHuman: true` | Route to the inbox: set the conversation to pending/open and notify agents as for any new conversation. If `reply` is present show it too (it tells the customer a person will reply) |
| `requiresAuth: true` | The customer asked about their account but is anonymous. Show the reply and, if your widget supports it, a "Sign in" prompt |
| `held: true` | The reply is waiting for review in Helply; `reply.text` is a holding message. Show it |
| `verified` | Whether this visitor's identity was verified on this message. Informational |
| `ticketId` | Optional: store it to deep-link from your inbox to Helply |
Errors: `401 invalid_relay_key` (disable AI for that property and tell the owner), `400` (a bug in your request), `429 rate_limited` (default 120 messages/minute per channel; back off), `503 llm_not_configured` or any timeout/5xx: **never lose the visitor's message**. Send the fallback text from `GET /v1/relay/config` (`fallbackMessage`), mark the conversation for a human, and refund any credit you reserved.
Credits: ChatFlow's own credit accounting is unchanged. Reserve before the call; refund when the call fails, when `suppressed` is set, or if you decide a human answered first.

## 4. Identity: how a logged-in customer is recognised
ChatFlow visitors are anonymous and their name/email are typed by the visitor, so **ChatFlow must never tell Helply who someone is**. It can only carry a token that the company's own backend signed.
1. The widget loads and registers the visitor (`POST /widget/visitor`), which returns `visitorId`.
2. If the host page has a logged-in user, it asks its own backend for a token **bound to that visitor**: the backend calls `POST {helply}/v1/identity/tokens` with a Helply API key (scope `identity:mint`) and `{ "userId": "<their user id>", "name": "...", "visitorId": "<ChatFlow visitorId>" }`, or signs the token itself (HS256, claims `sub`, `name`, `tenant`, `aud: "helply"`, `vid`, `iat`, `exp` at most 15 minutes after `iat`).
3. The page passes it to the widget, e.g. `ChatFlow.identify(token)`. **New ChatFlow work:** the widget sends it to a new endpoint (e.g. `POST /widget/visitor/identify`) that stores it on the visitor session. Do not show it to agents and do not log it.
4. ChatFlow sends it as `identityToken` on each relayed message. Helply verifies it every time against the workspace's own secret, checks `vid` equals `externalVisitorId`, and uses only that verified id for any log lookup. A token for another visitor, another workspace, an expired token, or a bad audience is ignored and the visitor is treated as anonymous (the reply asks them to sign in if they ask about their account).
5. Tokens last at most 15 minutes but visitor sessions last 30 days: the widget must fetch a fresh token before expiry and send it again. Optional: `POST /v1/relay/identify` with `{ externalVisitorId, identityToken }` returns `{ verified, expiresAt }` so the widget knows when to refresh.
If a different verified customer starts using the same ChatFlow conversation, Helply starts a new conversation on its side so histories never mix.

## 5. Keeping Helply in step with your inbox
Send `POST /v1/relay/events` (same key) with `{ externalConversationId, type }`:
| type | When | Effect in Helply |
|---|---|---|
| `agent_joined` | An agent is assigned or sends their first message | Conversation becomes `human`; the AI stays silent |
| `agent_message` (+ `text`) | Each agent reply | Mirrored into the transcript (personal data scrubbed) |
| `agent_left` | Agent unassigns | No change (a person still owns it until it is closed) |
| `conversation_closed` | Conversation resolved | Helply marks it resolved |
| `conversation_reopened` | Visitor writes again after close | Back to AI-eligible |
Unknown `externalConversationId` returns `404`: the visitor has not sent a message through the relay yet.

## 6. Try it without ChatFlow
Create a channel in Helply (or `POST /v1/channels` with a session token), then:
```bash
curl -X POST "$HELPLY/v1/relay/message" -H "Authorization: Bearer $RELAY_KEY" -H "Content-Type: application/json" \
  -d '{"externalConversationId":"cf_1","externalVisitorId":"vis_1","message":"How long does delivery take?"}'
```
`npm run dev:mock` also serves example responses for each reply shape (`scripts/planned-fixtures.js`, `__relayVariants`), and `test/relay.test.js` is the executable specification of every rule above.

## 7. What Helply does not do (so ChatFlow must)
Push replies to the visitor (ChatFlow does, from the response), email or push-notify agents, run ChatFlow's plan and credit rules, store any visitor name/email/phone (none is ever sent), and retry failed calls (ChatFlow decides).
