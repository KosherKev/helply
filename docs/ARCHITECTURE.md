# Architecture

```
 Customer (text / voice, Twi | Ga | Ewe | Pidgin | English)
        |
        v
 Channel: demo chat  |  ChatFlow widget (adapter)  |  Voice (Maame's Khaya ASR/TTS)
        |   message + signed token (from the company's backend)
        v
 +--------------------------- Helply API ---------------------------+
 | 1 Identity   verify token  -> verified user id | anonymous        |
 | 2 Understand Gemma 4: language, English, intent, search hints     |
 |   Language   Khaya translate (fallback: Gemma, flagged)           |
 | 3 Route                                                           |
 |    general question -> knowledge base (retrieve, answer or hand over)
 |    account issue + verified -> Evidence -> Explain (cited)        |
 |    account issue + anonymous -> ask to sign in (no log access)    |
 |    asks for a person -> hand over                                 |
 | 4 Reply      translate to customer's language, round-trip check   |
 | 5 Ticket     root cause + evidence for developers                 |
 +-------------------------------------------------------------------+
        |  read-only, scoped by verified user id + service
        v
 central-logging-service  GET /api/v1/logs?userId=&service=&from=&to=
```

## Modules (`src/`)

| Path | Responsibility |
|---|---|
| `identity/token.js` | HS256 token sign/verify on `node:crypto`. Rejects `alg=none`, bad signature, expiry, over-long lifetime, missing subject. |
| `logs/clsClient.js` | Read-only log query. Scope (service, userId) is set here from trusted values. |
| `logs/evidence.js` | Validates model hints, queries, **re-checks scope on every row**, redacts, ranks, caps, assigns ids `L1..Ln`. |
| `logs/redact.js` | Key-based and pattern-based redaction (JWTs, bearer tokens, API keys, emails, Ghana phone numbers, Luhn-valid card numbers). |
| `llm/gemma.js` | Gemma 4 over the Gemini API. One file to swap for a self-hosted endpoint. |
| `language/` | Khaya client (translate, ASR, TTS) and the language layer with fallback and similarity. |
| `agent/supportAgent.js` | The pipeline above, plus output cleaning and citation validation. |
| `store/store.js` | In-memory tickets and knowledge (keyword retrieval). |
| `server.js` | HTTP API, CORS, rate limit, console auth. |

## Design decisions

- **Retrieval, not tools.** ChatFlow's own AI plan already says the model gets no tools. We keep that rule: the model suggests hints, code decides what to fetch. This removes the largest prompt-injection risk (steering the lookup to someone else's data).
- **Two models of trust.** Customers, log text and documents are all untrusted data placed in delimited blocks; only our fixed instructions are trusted.
- **Honest uncertainty.** Unverified explanations are rejected; shaky translations are flagged; the default on doubt is a human.
- **Pluggable edges.** Model, language provider, log source and store are each one file behind a small interface.

## Integration points with the wider stack

- **central-logging-service (MIT).** Needs the `GET /api/v1/logs?userId=` filter (matches `metadata.userId`, plus an index). The company's API must log `metadata.userId`. The service does **no redaction at ingest**, which is why Helply redacts on read. Use bodies-off or redacting log shippers.
- **ChatFlow (text channel).** Production path: call `POST /v1/support/message` from ChatFlow's AI-reply orchestrator in place of (or before) its knowledge-only answer, passing the visitor's signed token. ChatFlow's existing gates (no agent online, plan, credits, human handoff) stay in charge.
- **Maame (voice).** Helply's `language/khaya.js` follows Maame's `khayaAsrClient` / `khayaTtsClient` (same endpoints and language-code mapping). The harness pattern (audio in, transcript, reply, audio out) is what `POST /v1/support/voice` does.
- **WhatsApp calling.** Not built. Meta's Cloud API calling needs your own WebRTC media server and a Cloud API number; track as a future channel.

## Verified vs. assumed (read before the demo)

| Item | Status |
|---|---|
| Identity, redaction, evidence scoping, agent behaviour, HTTP API | Verified by automated tests. |
| Khaya ASR and TTS request shapes | Taken from Maame's working clients. |
| Khaya **translate** path and body (`/v1/translate`, `{in, lang}`) | **Unverified.** Run `npm run check:khaya`; adjust `KHAYA_TRANSLATE_PATH` and `khaya.js`. |
| Gemma 4 model id on the Gemini API | **Unverified.** Copy the exact id from AI Studio into `GEMMA_MODEL`. The adapter retries without system instructions / JSON mode on a 400. |
| Pidgin code for Khaya (`kpo`) | **Unverified.** Falls back to Gemma if Khaya rejects it. |
