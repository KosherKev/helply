# Helply landing page (`site/`)

The marketing page for `/`, built as a static Next.js export. It is separate from the API (`src/`) and from the demo app (`web/`), and it never calls the API.

**Stack:** Next.js 16 (App Router, `output: 'export'`), TypeScript, three.js, GSAP + ScrollTrigger, Lenis, lucide-react, Tailwind v4. Type follows the brand guide: Plus Jakarta Sans for everything (IBM Plex Mono only for real log lines). Fonts and photos are self-hosted, so the page makes no third-party requests.

```bash
cd site
npm install
npm run dev        # http://localhost:3000
npm run build      # static files in site/out
npm run build:all  # builds web/ too, then assembles site/deploy (see Routing)
npm run preview    # serves site/deploy on http://localhost:4173
```

## Routing and deployment

`/` is this landing page and `/demo` is the `web/` app (its `/app/*` dashboard routes too). `npm run assemble` (part of `build:all`) merges the two builds into `site/deploy/` without changing `web/`:

- everything in `site/out`
- `web/dist/assets` and other `web/dist` files (it stops if a name exists in both builds)
- `web/dist/index.html` copied to `deploy/demo/index.html` and `deploy/app/index.html` (the web app clears its prerendered homepage on any path but `/`)

Host `site/deploy` as one static site. On DigitalOcean App Platform: a static site component with build command `cd web && npm ci && cd ../site && npm ci && npm run build:all`, output directory `site/deploy`, and catch-all document `app/index.html` so deep links into the web app load. Set `VITE_API_URL` for the web build and the `NEXT_PUBLIC_*` variables below for this one. Turn on compression (App Platform does by default); Lighthouse was measured with it.

In `npm run dev`, "Try the live demo" points at the web app's Vite dev server (`http://localhost:5173/demo`); run `npm run dev` in `web/` alongside.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BRAND` | Product name (copy never hard-codes it). Default `Helply`. |
| `NEXT_PUBLIC_DEMO_URL` | Where "Try the live demo" and the assistant orb go. Default `/demo` (the `web/` app, same origin); `http://localhost:5173/demo` in dev. |
| `NEXT_PUBLIC_GITHUB_URL` | Public repository. Confirm before launch. |
| `NEXT_PUBLIC_SITE_URL` | Public origin, for absolute Open Graph URLs. |

## How the page works

The UI follows the Emotion agency site's structure and motion, in Helply colours and with Helply content:

1. **Entry gate** (`Gate.tsx`): logo, caption, an Enter pill that shows 3D loading progress, and "Enter without motion". Entering opens a soft circle onto the world.
2. **3D world** (`world/`, rendered on GSAP's ticker right after Lenis so camera and scroll stay in step): a fixed full-screen three.js scene, *Helply HQ at blue hour*: a glass-walled support atrium with a mirror floor, columns, support desks and hanging screens drawn on canvas (a Pidgin chat, cited log lines, a developer ticket, language chips), with a city skyline outside. A cloud of glossy flakes forms the Helply mark (sampled from `public/brand/helply-mark-color.svg`, coloured with the on-navy palette), then morphs into a chat bubble, a globe, a shield and a ring as you scroll. Flakes near the cursor brighten and move aside. All flake motion runs in the vertex shader (each shape is uploaded once), and the renderer lowers its resolution if frames run slow.
3. **Five scenes** (`scenes.tsx`): tall sections whose `data-scene` value maps to a camera keyframe in `World.tsx`. Headlines warp in and out with an RGB split (`MotionRoot.tsx`).
4. **Flash** (`FlashZone` + `WorldStage.tsx`): the camera zooms into the ring, a white ring grows and floods into the flat page.
5. **Flat page** (`flat.tsx`): pinned word-scrub paragraph with a focus list, the "Who it's for" gallery (five equal Pexels photo cards in even rows, three then two centred; each opens top to bottom on entry and, on hover, says in plain words what Helply finds), the trust table (the mark follows the cursor), contact, and a "next page" reveal where the world returns and the flakes spell the product name.
6. **Chrome**: a white nav bar with caption links, Settings (motion, quality), a pill CTA, and the assistant orb (`AiOrb.tsx`), which opens the live demo.

## Accessibility and fallbacks

- All copy is server-rendered. Without JavaScript the gate is hidden and the page reads as a normal document over a static backdrop.
- Without WebGL, the static backdrop with the mark stays and every section still works.
- `prefers-reduced-motion` (or Settings → Motion off, or "Enter without motion") turns off smooth scroll, idle animation and text warps; the camera cuts between scenes instead of flying.
- Settings → High quality off drops the mirror floor and reduces flakes; it is automatic on small or low-core devices.

## Product promises

The four "never does" statements in `flat.tsx` are product promises backed by tests. Reword only with the maintainers' agreement; never weaken them or add new ones.
