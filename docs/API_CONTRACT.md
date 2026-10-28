# Helply API contract

Everything the frontends call. Base URL in dev: `http://localhost:8787`. JSON in, JSON out. Errors always look like:

```json
{ "error": { "code": "llm_not_configured", "message": "Set GEMMA_API_KEY" } }
```

## Types (TypeScript)

```ts
type LangCode = "en" | "tw" | "gaa" | "ee" | "fat" | "dag" | "pcm"; // pcm = Ghanaian Pidgin
type Intent = "general_question" | "account_issue" | "human_request" | "other";

interface LogLine {            // a redacted log line the model was allowed to see
  id: string;                  // "L1", "L2", ...
  time: string;                // ISO 8601
  level: "info" | "warn" | "error" | "debug";
  method: string | null;
  path: string | null;
  status: number | null;
  durationMs: number | null;
  traceId: string | null;
  error: { message: string; code: string | null } | null;
  response: string | null;     // redacted + truncated response body
}

interface TraceStep {          // powers the "glass box" timeline
  step: "identity" | "understand" | "translate_in" | "logs" | "explain" | "knowledge" | "translate_out" | "done";
  ms: number;                  // elapsed since the request started
  [detail: string]: unknown;   // e.g. verified, language, intent, provider, fetched, kept, found, similarity
}

interface SupportResponse {
  verified: boolean;
  user: { id: string; name: string | null } | null;
  requiresAuth: boolean;       // true => customer asked about their account but is not signed in
  needsHuman: boolean;
  understanding: { language: LangCode; languageName: string; english: string; intent: Intent };
  reply: { language: LangCode; english: string; text: string };  // text = reply in the customer's language
  roundTrip: null | {
    backTranslation: string;   // reply translated back to English
    similarity: number;        // 0..1
    reviewRecommended: boolean;
    provider: "khaya" | "gemma" | "none";
  };
  evidence: LogLine[] | null;  // only the lines the answer cites
  rootCause: null | { summary: string; suggestedFix: string; citedLines: string[]; confidence: number };
  ticketId: string | null;
  trace: TraceStep[];
}

interface VoiceResponse extends SupportResponse {
  transcript: string;
  replyAudio: null | { mimeType: "audio/wav"; base64: string };
}

interface Ticket {
  id: string;                  // "T-0001"
  createdAt: string;
  status: "open" | "needs_human" | "resolved";
  title: string;
  userId: string | null;
  language: LangCode;
  customerMessage: string;     // English, already scrubbed
  replyEnglish: string;
  rootCause: SupportResponse["rootCause"];
  evidence: LogLine[];
}

interface Capabilities {
  brand: string;
  demoMode: boolean;
  model: string;
  capabilities: {
    model: boolean;            // Gemma key configured
    languageLayer: "khaya" | "model-fallback";
    voice: boolean;
    logs: boolean;             // log source configured
    identity: boolean;         // JWT secret configured
  };
  languages: { code: LangCode; name: string }[];
  demoUsers?: { id: string; name: string }[];   // demo mode only
}
```

## Public endpoints (used by the chat widget and demo)

### `GET /health` -> `{ ok: true, brand }`
### `GET /v1/config` -> `Capabilities`
Use it to show which parts are live (model, language layer, logs, identity, voice) and to hide the mic button when `capabilities.voice` is false.

### `POST /v1/demo/token`  (demo mode only, otherwise 404)
Stands in for "the company's backend signs a token for its logged-in user".
Request `{ "userId": "usr_demo_ama" }` -> `{ token, user: {id, name}, expiresIn }` (seconds).
Errors: `unknown_demo_user` (400), `identity_not_configured` (503).

### `POST /v1/support/message`
Request:
```json
{ "message": "I paid with MoMo but my order says awaiting payment", "token": "<optional signed token>", "language": "tw" }
```
- `token` omitted or invalid => anonymous (knowledge-base answers only). The API never errors on a bad token; it simply treats the caller as anonymous (`verified: false`).
- `language` is an optional hint; the server detects the language itself.
- Max 1000 characters. Rate limit 30 requests/minute/IP.
Response: `SupportResponse`.
Errors: `message_required` (400), `message_too_long` (400), `rate_limited` (429), `llm_not_configured` (503).

### `POST /v1/support/voice`
Request `{ "audioBase64": "<wav|mp3|ogg|flac>", "language": "tw", "token": "<optional>" }` (max 5 MB).
Response: `VoiceResponse`. If speech synthesis fails, `replyAudio` is `null` and the text reply is still returned.
Errors: `voice_not_configured` (501), `audio_required` / `audio_size` (400), plus the message errors above.

## Console endpoints (support team)

Send header `X-Console-Key: <CONSOLE_KEY>`. In demo mode with no key configured they are open. Outside demo mode without a key they return `console_not_configured` (503). Wrong key => `unauthorized` (401).

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/v1/tickets` | `?status=open\|needs_human\|resolved` | `{ tickets: Ticket[] }` newest first |
| GET | `/v1/tickets/:id` | | `Ticket` (404 `not_found`) |
| PATCH | `/v1/tickets/:id` | `{ "status": "resolved" }` | `Ticket` |
| GET | `/v1/knowledge` | | `{ documents: { id, title, chunks, createdAt }[] }` |
| POST | `/v1/knowledge` | `{ "title": "Returns", "text": "...(>=20 chars)" }` | 201 `{ id, title, chunks, createdAt }` (`text_required`) |
| DELETE | `/v1/knowledge/:id` | | 204 |

## Embedding the real customer flow (production path)

1. The company's backend signs a short-lived HS256 JWT for the logged-in user:
```js
const crypto = require("node:crypto");
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64u({ alg: "HS256", typ: "JWT" });
const body = b64u({ sub: user.id, name: user.name, iat: now, exp: now + 600 });
const sig = crypto.createHmac("sha256", process.env.HELPLY_JWT_SECRET).update(`${head}.${body}`).digest("base64url");
const token = `${head}.${body}.${sig}`;   // send this to the chat widget
```
2. The widget includes `token` on every `/v1/support/*` call.
3. The company's API logs must carry `metadata.userId` (the same value as `sub`) so Helply can find that customer's requests.
