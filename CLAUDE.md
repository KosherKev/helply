# Helply: project rules for Claude Code

Open-source customer support that speaks Ghanaian languages and reads the company's logs to explain what went wrong. MIT. Node 20+, CommonJS, zero-dependency core (Express is the only runtime dependency).

**Start of every session:** read `PROGRESS.md` top to bottom, then `README.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`. The kickoff task for the v1.1 expansion is `docs/CLAUDE_CODE_PROMPT.md`.

## Commands
```bash
npm install
npm test            # node --experimental-sqlite --test (75 tests at last count, includes the OpenAPI contract and isolation matrix)
npm run dev         # http://localhost:8787  (web/: cd web && npm run dev -> :5173; npm run build runs tsc + prerender)
npm run seed        # fictional demo logs into central-logging-service (needs CLS_WRITE_KEY)
npm run check:khaya # verify Khaya endpoints with your key
```

## Security invariants (never regress; each has tests)
1. **Verified identity only.** The only user id ever used to read logs comes from a verified token. Never from a message, a request body, or model output.
2. **Retrieval, not agency.** The model has no tools. It proposes hints; code validates and fetches.
3. **Scope is enforced twice:** in the query, and again on every returned row.
4. **Redact before the model.** Everything that reaches a model, a ticket or a customer passes `src/logs/redact.js`.
5. **Read-only log access.** Use a `logs:read` key only.
6. **Cited or rejected.** Explanations must cite real evidence line ids; model output is cleaned.
7. **Fail closed.** No/bad token or unreachable log source means no log access.
8. **Workspace isolation (v1.1).** Every query is scoped by a tenant id taken from the session, API key or verified token. Never from the request body.

## Conventions
- Docs first: update `docs/API_CONTRACT.md` (and `docs/openapi.yaml` once it exists) before changing API behaviour.
- Every behaviour change ships with a test, especially identity, scoping, redaction and authorization (include the negative cases).
- Each external dependency (model, language provider, log source, store) stays behind a small interface in one file.
- No secrets in the repo. `.env` is gitignored; `.env.example` documents every variable.
- Commits: short and succinct, one per issue, no `Co-authored-by` trailers. Never merge branches.
- The product name lives in one constant (`HELPLY_BRAND` / `web/src/brand.ts`). Do not hard-code it in copy.

## Session continuity & documentation discipline for this project

`PROGRESS.md` at the repo root is the single source of truth for project state. At the start of any session, read it top to bottom before touching anything else: it tells you what exists, what's decided, what's blocked, and what to do next. If a `BUILD_PLAN.md` or similar phase plan exists, cross-check `PROGRESS.md`'s claimed phase against actual `git log` history, not just commit messages: read the diffs, not just the subject lines, since a commit can touch more than its message says.

Every session that does real work must, before finishing:

1. Update the Status Snapshot table (current phase, blocking issues, next action, repo state, verified-running).
2. Add a dated entry to the Decisions log summarizing what was decided and why.
3. Add or update entries in Known Limitations for anything left undone, deferred, or discovered: numbered sequentially, marked ~~resolved~~ (strikethrough) rather than deleted when fixed.
4. Update Next Steps in order, striking through completed items rather than removing them.
5. Append a dated Changelog entry describing what was built, what broke and got fixed, what was deliberately not done, and the commit hash.
6. Verify before claiming anything done: run the project's analyzer and full test suite, and only report something as working after actually seeing it pass. Don't assume from the diff alone.
7. Commit the code and documentation changes together (or in clearly linked commits), and record the real commit hash in `PROGRESS.md` rather than leaving it as "pending."
8. End every process you spawned (dev servers, test runs, build daemons) before ending the session: check with a process list and kill anything you started that isn't the user's own active session.

If you find `PROGRESS.md` is stale relative to `git log` (work landed that was never documented), reconcile it explicitly in its own section rather than quietly overwriting history: say what was found, what was verified, and what's still genuinely open.
