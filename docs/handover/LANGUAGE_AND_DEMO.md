# Handover: language, demo rehearsal and write-up

**You own:** the human side of the product: real Ghanaian-language test messages, prompt wording, the demo script, and the Devpost write-up. You do not need to write application code, but you may edit `src/agent/prompts.js` and `src/demo/demo.js` through a PR (they are covered by tests; the security rules below are not negotiable).

## 1. Native-speaker test set (blocking for the demo)
Nothing here may be machine-written. For each of Twi, Ga, Ewe, Fante, Dagbani and Pidgin, a native speaker supplies:
- 3 customer messages about a failed MoMo payment (casual, with typos/code-switching the way people really type);
- 2 general questions (delivery time, returns);
- the expected English meaning.
Put them in `docs/language/samples.md` (create it) with the speaker's name or initials and the date. The Twi message for the `/demo` quick prompt goes in `web/.env` as `VITE_TWI_SAMPLE`. Pidgin wording in `docs/FRONTEND_SPEC.md` ("I don pay with MoMo but dem say my order never pay.") is unverified: have a speaker confirm or replace it.
Review every generated reply the same way: does a native speaker understand it, and does the back-translation keep the meaning? Record wrong ones in the same file; they are the evidence behind the "Translation needs review" feature and the escalation threshold (`ROUND_TRIP_THRESHOLD`, default 0.4; word-overlap similarity is a cheap signal, not a human evaluation).

## 2. Verification that needs keys (Kevin runs these, you read the output)
`npm run check:khaya` (translation endpoint, ASR, TTS), `npm run seed` (fictional logs), then the full flow in `docs/DEMO_SCRIPT.md`. Open items: Khaya translate path/body, the real Gemma 4 model id, whether Pidgin (`kpo`) exists on Khaya (see `PROGRESS.md` Known Limitations 2 to 4).

## 3. Prompts: what you may and may not change
`src/agent/prompts.js` has three prompts (understand, explain from logs, knowledge answer). You may improve wording and examples. You may **not**: give the model tools or ask it to choose a user id; remove "use ONLY the evidence"; loosen "cite line ids" (the code rejects uncited answers); remove the untrusted-data warnings. Every change needs a test run (`npm test`) and a before/after on the native-speaker set.

## 4. Demo rehearsal (`docs/DEMO_SCRIPT.md`)
Three minutes: anonymous question, signed-in Twi/Pidgin money moment with the Glass Box, the "show me Kofi's payments" trust moment, ticket handoff (now in the team dashboard at `/app/tickets`, "Copy as GitHub issue"), close. Rehearse twice, record a backup video, screenshot a successful run. The fallbacks table in the script lists what to do when Khaya, Gemma, the logs or the mic fail.

## 5. Devpost write-up inputs
Use only things that are true and shown: the problem (support says "please wait" while the answer is in the logs), the flow (verified identity, scoped and redacted log read, cited explanation, back-translation check, developer ticket), the safety model (see the Trust section on the homepage and `README.md`), open core (MIT self-host; hosted for connectors/language packs; **no prices**), what is built on (Gemma 4, GhanaNLP Khaya, central-logging-service, DigitalOcean), honest limitations (`PROGRESS.md` Known Limitations). Do not claim live-service results until Kevin has run them, and no statistics or customer quotes.
