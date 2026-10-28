# Contributing

Thanks for helping. This project handles customer data, so tests and security matter more than speed.

## Setup
```bash
npm install
npm test          # must pass before any PR
npm run dev
```
Node 20+. No build step. Tests use the built-in `node:test`.

## Ground rules
- **Never** let the model choose whose data is read. Scope comes from the verified token and server config only.
- Anything that reaches a model, a ticket or a customer must pass through `logs/redact.js`.
- Add a test for every behaviour you change, especially anything touching identity, scoping or redaction.
- Keep each external dependency (model, language provider, log source, store) behind its small interface.
- Report security issues privately to the maintainers instead of opening a public issue.

## Good first issues (file these on GitHub with the labels shown)
| Title | Labels |
|---|---|
| Add a SQLite/Postgres store adapter for tickets and knowledge | `good first issue`, `backend` |
| Embedding-based retrieval behind `store.retrieve()` | `enhancement`, `ml` |
| Add Hausa, Yoruba and Kikuyu to the language layer | `good first issue`, `languages` |
| Human-approval queue for replies flagged by the round-trip check | `enhancement`, `frontend` |
| Multi-tenant isolation (per-tenant log source, secret and knowledge) | `enhancement`, `security` |
| Native speaker review set: Twi/Ga/Ewe/Pidgin support messages for evaluation | `help wanted`, `languages` |
| Replace word-overlap round-trip score with a model-judged score | `enhancement`, `ml` |
| WhatsApp channel adapter (messages first, calling later) | `enhancement`, `integration` |

## Style
Plain CommonJS, small modules, no clever abstractions. Comments explain *why*, not *what*.
