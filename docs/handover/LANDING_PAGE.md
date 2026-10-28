# Handover: landing page

**You own:** `/` (and the `/docs` page, which is not built yet). Files: `web/src/pages/Home.tsx`, `web/src/styles/index.css`, `web/index.html`, `web/public/`, and the build helpers listed below.
**Do not touch:** `web/src/app/*` and `web/src/pages/Demo.tsx` (other owner), anything outside `web/`.

## What exists
- `Home.tsx` implements `docs/FRONTEND_SPEC.md` §3 sections 1 to 10 with the spec's copy. Nav, hero (static mock of a Pidgin message + Glass Box), problem, how it works, features, trust ("What {BRAND} never does"), built on open source + open core, who it's for, CTA, footer.
- The page is **prerendered at build time** into `dist/index.html` so sections 1 to 8 appear with JavaScript off. In dev the same HTML is injected (see `web/vite.config.ts`).
- Measured on the production build (mobile, Lighthouse in Edge): **performance 96, accessibility 100, best practices 100**, no console errors, no horizontal scroll at 375 px. Keep it that way: it is the acceptance bar (>= 90).

## Your first job: apply the brand kit
The page was built before the brand guide arrived and still uses the old spec tokens. Source of truth: `docs/brand/README.md` and the full HTML guide.
| Today | Change to |
|---|---|
| Colours in the `@theme` block of `web/src/styles/index.css` (`ink`, `paper`, `green`, `gold`, `red`, `muted`...) | Deep Navy `#0F172A` text; White / Ice Blue `#EFF6FF` surfaces; Border Slate `#DBEAFE` lines; Helply Blue `#2563EB` for the primary action; Sky Blue `#60A5FA` for accents and focus ring (never text). Components use token names like `bg-green`, `text-green`, `bg-gold-50`: rename or remap the tokens, then search for the old names |
| Fonts: Space Grotesk + Inter + JetBrains Mono via `@fontsource` imports in `web/src/main.tsx` | Plus Jakarta Sans (400 to 800) via `@fontsource/plus-jakarta-sans` (self-hosted: do **not** add a Google Fonts `<link>`, it cost 9 Lighthouse points). Keep a mono font only for log lines |
| Pill buttons (`rounded-full`), cards `rounded-xl` | 12 px controls, 20 px cards, 999 px badges only |
| Text wordmark `{BRAND}` in the nav and footer | `web/public/brand/helply-logo-horizontal-color.svg` (min 96 px wide; clear space = height of the H). Keep an accessible name |
| `web/public/favicon.svg` | `web/public/brand/helply-app-icon.svg` (PNG sizes are in `docs/brand/assets/png/`) |
| Gold "cited line" highlight and green "success" | The guide has neither. Use the mapping suggested at the bottom of `docs/brand/README.md`; get a designer decision, then write it into that file |
Also check the hero and section copy against the brand voice (plain verbs, sentence case, describe rather than sell). Copy marked final in the spec may be improved, but the four "never does" statements in the trust section are **product promises backed by tests**: reword, never weaken or add new ones without asking Kevin.

## Rules that will bite you
1. **Hydration:** `web/src/entry-server.tsx` must render exactly the tree `web/src/main.tsx` hydrates (`<App/>` inside the router). If they differ React throws hydration error #418 and Lighthouse drops. After any change to `App.tsx`/`Home.tsx` structure run `npm run build` and open `dist/index.html`: your copy must be in it.
2. Anything in `Home.tsx` must render on the server: no `window`/`document` during render, no state that differs between server and client, no random ids or dates in markup.
3. No placeholder text, no invented statistics, no customer logos, no prices ("Early access, talk to us" is deliberate).
4. Links: "Try the live demo" -> `/demo`; GitHub -> `GITHUB_URL` in `web/src/brand.ts` (set `VITE_GITHUB_URL`; confirm the real repo URL with Kevin).
5. Accessibility: keep the skip link, one `<h1>`, heading order, visible focus (Sky Blue 3 px), AA contrast (Helply Blue on white is 5.2:1; Sky Blue is never text), `prefers-reduced-motion` respected.
6. Performance: no new third-party requests, no images above the fold without width/height, keep JS for `/` small (React + router is ~89 kB gzip today).

## Backlog (yours)
- Brand pass (above).
- `/docs` page (spec §6): sticky table of contents, quickstart, connect logs, sign a customer token (Node snippet is in `docs/API_CONTRACT.md`), languages, security model (`#security`; the footer/trust link points at the GitHub README anchor until it exists), self-hosting, FAQ. **Source the content from `README.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`; do not rewrite it twice.** Add the route in `web/src/App.tsx`, and prerender it too if it should work without JS (extend `web/scripts-prerender.mjs`).
- `<title>`/meta description per page, Open Graph image (use the stacked logo), `robots.txt`, `sitemap.xml`.
- Optional: animate the hero mock (must work with no JS animation).

## Definition of done
`cd web && npm run build` clean; `dist/index.html` contains sections 1 to 8; Lighthouse mobile >= 90 on `/` (`npx lighthouse http://localhost:4173/ --form-factor=mobile` after `npx vite preview`); no horizontal scroll at 375 px; keyboard-only walkthrough works; brand checklist in `docs/brand/README.md` satisfied.
