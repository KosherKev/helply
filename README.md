# Helply

**Open-source customer support that speaks Ghanaian languages and reads your logs.**

A customer writes (or speaks) in Twi, Ga, Ewe, Pidgin or English. Helply works out who they are, reads *only that customer's* recent logs (with secrets removed), explains what actually went wrong in their language, and hands your developers a ticket with the evidence.

Built for the CIREN Hacktoberfest 2026 hackathon ("Build the Next B2B Company on Open Source"). Powered by **Gemma 4** (open weights, Apache 2.0).

## Why

- Customers write in the language they think in. Most support tools only handle English.
- Support teams reply "please wait" while developers dig through logs.
- The answer was already in the logs.

## What it does

| | |
|---|---|
| **Understands** | Detects the language, translates to English (GhanaNLP Khaya, with a flagged Gemma fallback) and works out the intent. |
| **Answers general questions** | From the company's own documents (knowledge base). If they don't cover it, it hands over to a person. |
| **Explains account problems** | After verifying the customer, it reads their recent logs, finds the failing request and explains it, citing the exact log lines. |
| **Replies in their language** | Then translates the reply back to English as a *round-trip check* and flags shaky translations for review. |
| **Voice** | Speech-to-text and text-to-speech through Khaya. |
| **Tickets for developers** | Root cause, suggested fix and the cited evidence, ready to copy into an issue tracker. |

## Security model (the part to read twice)

1. **Verified identity only.** The company's backend signs a short-lived token for its logged-in user. The verified user id is the *only* id ever used to read logs. It never comes from the customer's message or from the model.
2. **Retrieval, not agency.** The model has no tools. It proposes hints (time window, keywords); our code validates them, applies the scope and fetches. Prompt injection cannot steer which logs are read.
3. **Scope is enforced twice.** The log query is scoped by user and service, and every returned row is re-checked.
4. **Redaction before the model.** Tokens, passwords, card numbers, emails and phone numbers are removed from log lines before the model sees them.
5. **Read-only.** Helply uses a `logs:read` key. It cannot write, change or delete anything.
6. **Cited or it didn't happen.** An explanation must cite real evidence lines; otherwise it is rejected and escalated. Model output is cleaned (no links, no secrets).
7. **Fails closed.** No token, bad token or unreachable log source means no log access.

Covered by tests (`npm test`): forged tokens, `alg=none`, cross-user scoping, injection, redaction, fabricated citations.

## Quickstart

Requires Node 20+, a [central-logging-service](https://github.com/KosherKev/central-logging-service) instance (MIT) with the `userId` filter, and a Gemma 4 key.

```bash
git clone <this repo> && cd helply
npm install
cp .env.example .env      # fill in the keys (see below)
npm test
npm run dev               # http://localhost:8787
```

Demo data (fictional shop, one seeded failed-payment story):

```bash
CLS_WRITE_KEY=sk_live_... npm run seed
```

Check your Khaya key and endpoints before relying on the language layer:

```bash
npm run check:khaya
```

### Configuration

| Variable | Purpose |
|---|---|
| `GEMMA_API_KEY`, `GEMMA_MODEL` | Gemma 4 through the Gemini API. Use the exact model id from Google AI Studio. |
| `KHAYA_API_KEY` | GhanaNLP Khaya (translation, speech). Optional: without it translation falls back to Gemma and is flagged. |
| `CLS_BASE_URL`, `CLS_API_KEY`, `CLS_SERVICE` | Where logs live. Use a **read-only** key. Helply only reads the one service you name. |
| `HELPLY_JWT_SECRET` | Shared secret used to verify customer tokens. |
| `CONSOLE_KEY` | Protects the support console API. |
| `DEMO_MODE` | `true` enables demo tokens and sample knowledge. **Never in production.** |

## How it fits together

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). API reference: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md). Frontend plan: [`docs/FRONTEND_SPEC.md`](docs/FRONTEND_SPEC.md). Demo script: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

## Open core

- **Free, self-hosted (MIT):** the full agent, console and API. Bring your own keys; keep your data on your own server.
- **Hosted (paid, planned):** managed hosting, chat and WhatsApp connectors, extra language packs, support.

## Known limitations (honest list)

- Storage is in memory (tickets and knowledge reset on restart). A database adapter is the next step.
- Khaya's translation endpoint shape must be confirmed with your key (`npm run check:khaya`).
- Ghanaian Pidgin support depends on the Khaya SDK/version; Gemma handles it otherwise.
- Round-trip quality uses word overlap, a cheap signal, not a human evaluation.
- Single tenant. Multi-tenant isolation is on the roadmap.
- WhatsApp calling is out of scope for now (it needs a WebRTC media server and a Cloud API number).

## Credits

Gemma 4 (Google DeepMind, Apache 2.0) | GhanaNLP Khaya | central-logging-service (MIT).

## License

MIT. See [LICENSE](LICENSE).
