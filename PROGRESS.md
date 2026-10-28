# PROGRESS

Single source of truth for project state. Read top to bottom at the start of every session.

## Status Snapshot

| Field | Value |
|---|---|
| Current phase | **v1.1 expansion in progress.** API (SQLite, auth, workspaces, webhooks, OpenAPI) and the `web/` app (homepage + `/demo`) are committed. **Landing page built in `site/`** (Next.js static export). Remaining: user dashboard, deployment. Task: `docs/CLAUDE_CODE_PROMPT.md`. |
| Blocking issues | None hard-blocking. Needs the user's keys (KL-2, KL-3) and a committed `userId` filter in central-logging-service (KL-9). |
| Next action | Confirm `GITHUB_URL` with Kevin (KL-20); deploy `site/deploy` (`npm run build:all` in `site/`); then the user dashboard. |
| Repo state | Git repo on `main` with commits up to the landing page (see Changelog). Landing page on branch `landing-page`, not merged. Cross-repo: `../central-logging-service` still has an uncommitted `userId` filter (3 files). |
| Verified running | `npm test` (root): **73/73 pass** with real `npm ci` (no borrowed modules). `site/`: `tsc --noEmit` clean, `next build` clean; Lighthouse mobile on `/` served compressed (`serve`): **performance 92–94, accessibility 100, best practices 100, SEO 100** (LCP 3.0–3.1 s, TBT 70–120 ms, CLS 0), measured on the assembled `site/deploy`. Scroll profile at 1440x900, DPR 2, CPU 4x slowdown: 0.6–1% of frames over 20 ms in round 5 (run-to-run noise; was 4.3% before the round-1 fixes). Round 5 Lighthouse mobile 91–94/100/100/100. `/`, `/demo` and `/app/*` load from `site/deploy` with no errors. Desktop 1440x900 and mobile 390x844 walkthroughs: no console errors, no horizontal scroll. **Not verified against live Gemma, Khaya or central-logging-service.** No root linter (KL-7). |
| Deadline | Hackathon submission ~19:00 Africa/Accra, 2026-10-28. Feature freeze target 18:00. |

## Reconciliation (2026-10-28, landing-page session)

This file said "not a git repository" and "28/28", but `git log` showed 9 commits that were never recorded here. Read each commit's file list (not just the subject):

| Commit | What it actually contains |
|---|---|
| `69e08d6` | v1.0 backend, docs and tests (what the 2026-10-28 changelog below describes). Resolves KL-16. |
| `5b7b753` | `migrations/001_init.sql` + root `package-lock.json`. |
| `0f7eddb` | `src/auth/auth.js`, `src/db/db.js`, `src/store/repo.js`, `src/security/crypto.js`, `src/events.js`, `src/webhooks/{service,ssrf}.js`; agent and log client made workspace-aware. |
| `9a15f51` | Routes split into `src/routes/{account,connections,console,support}.js`; `src/server.js` rewired. |
| `7eb01fb`, `75732ed`, `cffa510` | Tests: auth, authorization, conversations, isolation matrix, webhooks/SSRF, data/tickets/knowledge/settings/rate-limit/SSE. |
| `5593b6b` | `docs/openapi.yaml`, `scripts/build-openapi.js`, contract tests. |
| `3f114ad` | `web/` Vite + React app: prerendered homepage (`web/src/pages/Home.tsx`) and `/demo` with the Glass Box. |

**Verified this session:** after `npm ci`, the full root suite passes, **73/73**. That resolves KL-8 (no borrowed Express). **Still open:** KL-9 (cross-repo filter), live-API checks (KL-2, KL-3, KL-13, KL-14), and the v1.1 decisions those commits made were not logged here at the time; they are only described by the code and `docs/`.

## Decisions log

### 2026-10-28
- **Name kept as "Helply"** at the user's instruction ("it's just for the hackathon"), despite an established AI support product of the same name (Helply, Inc., formerly Groove). Mitigation: the name lives in one constant (`HELPLY_BRAND` / `web/src/brand.ts`). Revisit before any public launch.
- **Retrieval, not tools.** The model never calls a tool and never chooses whose logs to read; it proposes hints, code validates and fetches. Matches ChatFlow's own "model has no tools" rule and removes the main prompt-injection risk.
- **Identity = short-lived HS256 token** signed by the company backend (`node:crypto`, no JWT dependency). Verified `sub` is the only user id used for log lookups.
- **Scope enforced twice** (query + per-row re-check) and **redaction on read**, because central-logging-service does no redaction at ingest.
- **New repo, adapters to existing products.** ChatFlow (ISC, no LICENSE file), Maame (no license) and LogPulse (README says MIT, no LICENSE file) are not published here; central-logging-service is MIT. Helply is a fresh MIT repo that integrates through HTTP/adapters. Khaya ASR/TTS client shapes were ported from Maame's working clients.
- **central-logging-service gets a `userId` filter** (`metadata.userId`, string-only to block `userId[$ne]=` injection, plus an index) rather than filtering client-side. Edited in the working tree only; no git operations (git in the build sandbox needs delete permission across the user's whole GitHub folder).
- **Zero-dependency core, CommonJS, in-memory store** for speed. Persistence is v1.1 work.
- **Khaya translate endpoint is configurable** (`KHAYA_TRANSLATE_PATH`) and shipped with `npm run check:khaya` instead of guessing silently.
- **WhatsApp calling deferred.** Needs a Cloud API number and a WebRTC media server; not feasible for the deadline. Voice is demoed with browser mic/audio upload through Khaya.
- **Dashboard "users" interpreted as company team members** (owner/admin/agent), not end customers. Change if wrong.

### 2026-10-28 (landing page)
- **Landing page lives in its own folder, `site/`** (Next.js 16 App Router, `output: 'export'`), with its own `package.json`. It never imports from or calls the API, so `src/` and `web/` are untouched. Stack per the user: Next.js, TypeScript, three.js, GSAP + ScrollTrigger, Lenis, lucide-react, Tailwind v4.
- **UI follows the Emotion agency site (emotion-agency.com), not the brand guide's UI**, at the user's explicit instruction. Emotion's structure is copied in Helply colours with Helply content: an entry gate, a fixed 3D world, the scene-headline warp, a ring flash into a flat page, a word scrub with a focus list, a glitch gallery, a trust table, and a next-page reveal. Fonts deviate from the brand guide for the same reason: Instrument Serif, Plus Jakarta Sans and IBM Plex Mono, self-hosted via fontsource with no third-party requests.
- **"Business environment" instead of Emotion's outdoor landscape** (user request): the world is a glass-walled support atrium at blue hour. It has a mirror floor, desks, a skyline, and hanging screens showing a Pidgin chat, cited log lines, a ticket and language chips. The centre object is a flake cloud sampled from the official mark SVG. It morphs into a bubble, a globe, a shield and a ring.
- **No invented statistics, logos or prices**; the four "never does" promises are verbatim from the handover. "Try the live demo" and the AI orb go to `/demo` (the `web/` app).
- **Hero text stays painted under the gate** and warps in after Enter, so LCP is measured on real text, not on a hidden element.
- **Lighthouse is measured against a compressing server** (`npx serve`), because production hosts gzip/brotli; Python's `http.server` does not compress and gave a misleading 73.

### 2026-10-28 (landing page, round 2)
- **Routing: `site/` serves `/`, `web/` serves `/demo` and `/app/*`** (user decision). `site/scripts/assemble.mjs` merges both static builds into `site/deploy` and never edits `web/`. The web app's own `index.html` already clears its prerendered homepage on other paths, so it serves as the shell.
- **Fonts follow the brand guide** (user request, reversing the earlier Emotion-font decision): Plus Jakarta Sans for everything; display 800 with -2% tracking in sentence case, a 500 italic lead word, 12px/500 captions. IBM Plex Mono stays only for log lines (`font-mono`), where monospace is functional. Instrument Serif removed.
- **White nav bar** with the full-colour logo (user request); the over-the-world white text variant was removed.
- ~~**Gallery copies Emotion's CSS placement** exactly (staggered sizes and heights).~~ Superseded the same day: the user found the stagger disordered and chose **even rows** (five equal 4:5 cards, three then two centred; 2 columns on phones with the last centred). The Emotion hover (title slides right with a ↪) stays.
- **Card entry no longer shakes:** the stepped "grid shift" glitch moved cards ±8 px sideways; replaced by a smooth top-to-bottom clip reveal with an inner photo zoom (measured 0 px sideways movement).
- **Hover text is plain language** (user request): "What Helply finds" with one sentence per case, derived from the same failure each log line described; raw log lines are no longer shown on the cards.
- **Footer wordmark in flakes** (user request): scene 5 is now a sixth flake shape, the product name rasterised in Plus Jakarta Sans 800 (`wordShape`), facing the camera above the mirror floor. Shrinks on portrait screens.
- **Particle object re-matched to Emotion** (user request, after re-recording emotion-agency.com idle, cursor and scroll sequences): round beads instead of flat flakes (10,000 high / 3,600 low); morphs pass through a glowing ellipsoid cloud (shape A -> cloud -> shape B); the mark is a thick slab that sways and turns with scroll; other shapes drift on two axes; the object leans toward the cursor and a wide patch lights up; idle shimmer band, single-bead sparkle, a loose halo and drifting beads. A first pass looked packed ("sticky" per the user); beads were made smaller, offset from their sample points with a 10% halo, while keeping the core legible.
- **Round 5 (user feedback: logo not visible, beads motionless, light effects distorting, loader and entry unlike Emotion, flash late):** after recording Emotion's loader, cursor trail and Enter sequence frame by frame:
  - The mark is drawn from its own SVG paths, part by part, with heavier strokes and an open bubble (no filled body), the way Emotion's "e" is a bold outline with holes. It reads as the H, handshake and bubble at rest.
  - Beads float on a flow field keyed to their place in the shape (amplitude 0.11, was 0.045), so the surface visibly moves; beads are smaller and the halo is 4% (was 10%).
  - Light effects reduced to accents: lower shine, darker base colour with a small self-glow, shimmer and cursor glow halved. The periodic light pulse was removed at the user's request ("the bang is not supposed to pulsate, it's supposed to just spark"): the beads flash white once on entry and settle into colour.
  - Loader rebuilt after Emotion's: logo and caption high, a full-width progress line with "Experience / is loading... / Please / wait / 0042 / out of / 100%", a soft white smoke trail that follows the cursor, then Enter and Enter without motion. Audio is not offered (Helply has none).
  - Entry "light bang" on a 2D canvas: a white spark beats, then swells into a breathing cloud with a wobbly edge and a hole opening onto the world. The beads burst out of the centre through the glowing cloud into the mark.
  - The flash into the flat page is now fully white before the flat page starts to come up, and clears only as that page fills the screen. It used to fire after the page was already visible.
- **"Who it's for" heading** set as one tight line with its caption beside it (below on phones), replacing the spread-out split heading.
- **Photos from Pexels**, downloaded from the public CDN after web search (the pexels.com site blocks automated browsing, so no bot-check workaround), resized to WebP 640/1200 and self-hosted. Credited in the footer; the Pexels license needs no attribution.
- **Scroll lag fixes:** flake animation moved to the vertex shader (was a 7,000-flake CPU loop re-uploading ~450 KB per frame); the world renders on GSAP's ticker after Lenis; resolution cap 1.5 and adaptive step-down; no animated CSS blur on headlines; no backdrop-filter over the canvas; focus list reads then writes layout; text scrub follows Lenis directly (no extra 0.6 s lag); all shape buffers uploaded before the gate opens.

## Known Limitations

1. In-memory store: tickets and knowledge reset on restart. (v1.1: SQLite.)
2. Khaya **translate** path/body (`/v1/translate`, `{in, lang}`) is unverified; ASR/TTS shapes come from Maame. Run `npm run check:khaya`.
3. Gemma 4 model id on the Gemini API is unverified (`GEMMA_MODEL=gemma-4-31b-it` is a guess). The adapter retries without system instructions/JSON mode on a 400.
4. Ghanaian Pidgin code for Khaya (`kpo`) is unverified; falls back to Gemma.
5. Round-trip quality is word-overlap (Jaccard), a cheap signal, not a human evaluation.
6. Single tenant; no accounts. Console is protected by one shared `CONSOLE_KEY`.
7. No analyzer/linter or CI configured. Verification is `node --test` + `node --check`.
8. ~~`test/server.test.js` needs `npm install` (Express). Verified here only with Express borrowed from another repo's `node_modules`.~~ Resolved 2026-10-28.
9. The `userId` filter exists only as an **uncommitted** working-tree change in `../central-logging-service` (`src/routes/logs.js`, `src/models/Log.js`, `tests/logsUserFilter.test.js`; that repo's suite: 78/78). Helply cannot find a customer's logs without it deployed.
10. ~~Frontend not built; specs only (`docs/FRONTEND_SPEC.md`).~~ `web/` (homepage + demo) and `site/` (landing page) exist; the user dashboard is still not built.
11. Rate limiter is in-memory per IP and ignores `trust proxy`; behind DigitalOcean's proxy it needs `app.set("trust proxy", ...)`.
12. Hints come from the model; clamped and validated, but search quality depends on the model's keyword choices.
13. `scripts/seed-logs.js` has **never been run against a live central-logging-service**; the log-batch schema it posts is inferred from that service's README.
14. Gemma adapter, Khaya client and the end-to-end flow were tested only with fakes, never with live APIs.
15. Logs must carry `metadata.userId`; the AcademicX and pharma apps still run the old `@bevingh/telemetry` 0.2.0, which ships raw auth headers and bodies to central-logging-service. **Never point the demo at their real logs.**
16. ~~**Nothing is committed** (no git repo in `helply`).~~ Resolved: see Reconciliation.
17. Twi/Ga/Ewe/Pidgin sample messages for the demo have not been written or reviewed by a native speaker.
18. ~~`npm install` never run at the root (KL-8)~~: resolved 2026-10-28, `npm ci` and 73/73.
19. ~~**Two homepages exist:** `site/` and `web/src/pages/Home.tsx`; routing not decided.~~ Resolved: `site/deploy` serves `/` from `site/` and `/demo`, `/app/*` from `web/`. `web/`'s Home is built but unreachable at `/` in production.
20. `site/` `NEXT_PUBLIC_GITHUB_URL` defaults to `https://github.com/kevinafenyo/helply`, which is **unconfirmed**. The "Next page: Docs" link goes to `${GITHUB_URL}#quickstart` because there is no `/docs` page.
21. The AI orb sends `/demo?q=…`; `web/`'s Demo page may ignore `q` (not touched, other owner).
22. `site/` has no sitemap, no dark/light toggle (it is light with navy scenes by design), and no automated tests beyond `tsc`/build. Lighthouse 93–94 assumes compression is enabled in production.
23. ~~No photography in the gallery.~~ Resolved: Pexels photos. Photographers are not individually credited (Pexels does not require it; the pages could not be fetched to read names).
24. `docs/brand/README.md`, referenced by the handover, does not exist; the brand kit was taken from the user's Downloads.
25. Scroll smoothness was measured in headless Chrome (no vsync, Apple GPU). Not yet checked on a low-end Windows laptop or a mid-range Android phone.
26. The DigitalOcean static-site settings in `site/README.md` are documented but not deployed or tested.
27. The loader's cursor trail is a 2D-canvas smoke imitation, not a fluid simulation like Emotion's; the entry bang is matched by eye from 100 ms captures, not from Emotion's source.
28. Round 5 visuals were checked in headless Chrome only; the user views them in Safari, where WebGL colour and canvas shadow blur can differ slightly.

## Next Steps

1. ~~`git init -b main`, first commit, record the real hash here (KL-16).~~ Done (`69e08d6`).
2. ~~`npm install`; run the full suite; confirm 28/28 without borrowed modules (KL-8).~~ 73/73 on 2026-10-28.
3. Commit and push the `userId` filter in `central-logging-service` (KL-9).
4. Obtain `GEMMA_API_KEY`, `KHAYA_API_KEY`, a read-only `CLS_API_KEY` and a `logs:write` key; set `.env`.
5. `npm run check:khaya`; fix `src/language/khaya.js` if translate differs (KL-2). Confirm the Gemma model id (KL-3).
6. `npm run seed` against a live central-logging-service; run the demo story end to end (KL-13, KL-14).
7. Execute `docs/CLAUDE_CODE_PROMPT.md`: contract + OpenAPI -> landing page + demo page -> user dashboard -> API functionality (SQLite, workspaces, auth, analytics, audit, webhooks...).
8. Get a native-speaker Twi sample message (KL-17). Rehearse `docs/DEMO_SCRIPT.md`.
9. Deploy (API + static site) on DigitalOcean; record the demo; Devpost write-up. Feature freeze 18:00.
10. ~~Landing page~~ (built in `site/`, branch `landing-page`). Review and merge are the user's call; never merged by Claude.
11. ~~Decide `/` routing (KL-19).~~ Confirm `GITHUB_URL` (KL-20); have `/demo` read `?q=` (KL-21).
12. Enable gzip/brotli on the static host and re-run Lighthouse mobile on the deployed URL.

## Changelog

### 2026-10-28: v1.0 backend, docs, tests
- **Built:** config; token sign/verify; redaction; read-only log client; evidence builder (hint validation, scope re-check, ranking, line ids); Gemma adapter; Khaya client; language layer with fallback and round-trip similarity; support agent (identity, understanding, translation, knowledge answers, evidence-based explanations, ticket creation, output cleaning); in-memory store; Express API (health, config, demo token, text and voice support, console tickets/knowledge, CORS, rate limit); seed and Khaya check scripts; docs (README, ARCHITECTURE, API_CONTRACT, FRONTEND_SPEC, DEMO_SCRIPT, API_ROADMAP, CONTRIBUTING, CLAUDE_CODE_PROMPT); `CLAUDE.md`.
- **Cross-repo:** `central-logging-service` `GET /api/v1/logs?userId=` filter + index + `tests/logsUserFilter.test.js` (uncommitted there).
- **Broke and fixed:** `npm install` was blocked (403) in the build sandbox, so Express was borrowed from the other repo for verification. A first run of that repo's suite with `npx jest` showed 12 failures; they were only the missing `--experimental-vm-modules` flag (`npm test` passes it), then 78/78. One Helply run showed 23/24 because Express was off the path; with it, 28/28.
- **Deliberately not done:** frontend implementation, persistence, accounts/roles, WhatsApp calling, live-API verification, committing (see KL-16).
- **Commit:** none (no git repository yet).

### 2026-10-28: landing page (`site/`)
- **Built:** a Next.js static-export landing page in `site/`:
  - an entry gate with load progress
  - a three.js atrium world with a reflective floor, desks, a skyline and canvas screens
  - a 7k-flake instanced cloud sampled from the mark SVG, morphing mark → bubble → globe → shield → ring, with cursor push
  - five warped scene headlines and the ring flash into the flat page
  - a word scrub with a focus list, the "Who it's for" glitch gallery, the trust table with the cursor follower, contact, and the next-page reveal
  - the nav with a Settings popover (motion, quality) and a mobile menu
  - an AI orb that opens the demo
  - self-hosted fonts, Lenis on the GSAP ticker, reduced-motion and no-JS/no-WebGL fallbacks, and Open Graph/icons from the brand kit
- **Broke and fixed:**
  - headline clipping
  - the see-through gate centre
  - a navy H that was invisible on the dark atrium (recoloured with the on-navy palette)
  - 40px horizontal overflow from the warp skew (`overflow-x-clip`)
  - the IntersectionObserver visibility counter (replaced with a Set)
  - Lighthouse fixes:
    - LCP hidden behind the gate
    - scrub-word and focus-list contrast
    - footer link target size
    - 12px minimum mono/tag size
    - source maps
  - Result: Lighthouse went from 73/93/96/100 to 93–94/100/100/100.
- **Deliberately not done:** touching `src/`, `web/`, `web/src/app/*` or `Demo.tsx`; a `/docs` page; generated imagery; changing the four promises; merging.
- **Commit:** `330a83e` on branch `landing-page`.

### 2026-10-28: landing page round 2 (routing, photos, brand fonts, scroll performance)
- **Built:**
  - `site/scripts/assemble.mjs`, plus `npm run assemble`, `build:all` and `preview`
  - the dev demo URL pointing at Vite
  - Pexels photos in the gallery and contact block
  - Emotion's exact gallery grid
  - Plus Jakarta Sans throughout
  - the white nav
  - the GPU flake shader
  - the world loop on the GSAP ticker, with adaptive resolution
- **Broke and fixed:** the gallery caption wrapped one word per line on phones (moved under the heading). Measuring Lighthouse against Python's `http.server` understated performance (no compression); measured with `serve` instead.
- **Verified:**
  - `tsc` clean, build clean
  - Lighthouse mobile 92–94/100/100/100
  - no frames over 20 ms at 4x CPU slowdown
  - desktop and mobile screenshots: no console errors, no horizontal scroll
  - `/demo` and `/app/*` load from `site/deploy`
  - root `npm test` 73/73
- **Deliberately not done:** editing `web/`; deploying; crediting individual photographers.
- **Commit:** `22fafcb` on branch `landing-page`.

### 2026-10-28: landing page round 3 (gallery order, shake, plain hover text, footer word)
- **Built:** even-row gallery; smooth card reveal; plain-language "What Helply finds" hover notes; `wordShape` and the footer keyframe spelling the product name; tight "Who it's for" heading; centred "[ Just continue to reveal ]".
- **Broke and fixed:** the stepped glitch entry shook cards sideways by 7–13 px (measured); replaced it. The photo entry animation's fill mode would have blocked the hover zoom (`backwards` instead of `both`).
- **Verified:** `tsc` and build clean; Lighthouse mobile 93/100/100/100; no frames over 20 ms at 4x CPU slowdown; 0 px card movement after settling; desktop, tablet and phone screenshots; root `npm test` 73/73.
- **Commit:** `04e450b` on branch `landing-page`.

### 2026-10-28: landing page round 4 (particle object matched to Emotion)
- **Built:** bead geometry and a new vertex shader in `site/src/components/world/flakes.ts` (morph through cloud, halo, per-bead float, drift, shimmer, sparkle, wide cursor glow); thick-slab mark sampling in `shapes.ts`; lean-to-cursor, scroll turn and two-axis drift in `World.tsx`.
- **Broke and fixed:** first bead pass was too dense and too white (sticky look); second pass too blurry to read the mark; final pass tightens the core (offset 0.08, halo 10%, float 0.045) and lowers environment shine.
- **Verified:** `tsc` and build clean; side-by-side captures against Emotion (idle, cursor sweep, scroll morph); Lighthouse mobile 93/100/100/100; 0.1% frames over 20 ms at 4x CPU slowdown; no console errors.
- **Commit:** `6d3b772` on branch `landing-page`.

### 2026-10-28: landing page round 5 (legible mark, flowing beads, Emotion loader and light bang)
- **Built:**
  - `shapes.ts`: the mark is sampled from its own paths (Path2D), with heavier strokes and an open bubble.
  - `flakes.ts`: flow-field float, smaller beads, softer light, a one-off `uBang` white flash, and the periodic pulse removed.
  - `Gate.tsx`: the loader rebuilt (progress line and counter, cursor smoke trail, beating spark that opens into a breathing cloud-edged hole).
  - `MotionRoot.tsx`: the flash goes white before the flat page and clears after it.
  - `World.tsx`: a gentler intro camera and less resting sway.
- **Broke and fixed:**
  - The first colour pass washed the beads to white under the room lights. Fixed with a darker base, lower shine and a small self-glow.
  - The first float was still too small to read as motion.
- **Verified:**
  - `tsc` and `build:all` clean; root `npm test` 73/73.
  - Captures of the loader, trail, entry and flash hand-off, compared with Emotion's.
  - Lighthouse mobile 94/100/100/100; 0.6% of frames over 20 ms at 4x CPU slowdown; no console errors.
- **Not done:** fluid-sim trail (KL-27); Safari check (KL-28).
- **Commit:** `d87d733` on branch `landing-page`.

