# Helply landing page (`site/`)

The marketing page for `/`, built as a static Next.js export. It is separate from the API (`src/`) and from the demo app (`web/`), and it never calls the API.

**Stack:** Next.js 16 (App Router, `output: 'export'`), TypeScript, three.js, GSAP + ScrollTrigger, Lenis, lucide-react, Tailwind v4. Fonts are self-hosted through `@fontsource` (no third-party requests).

```bash
cd site
npm install
npm run dev        # http://localhost:3000
npm run build      # static files in site/out
```

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BRAND` | Product name (copy never hard-codes it). Default `Helply`. |
| `NEXT_PUBLIC_DEMO_URL` | Where "Try the live demo" and the assistant orb go. Default `/demo` (the `web/` app). |
| `NEXT_PUBLIC_GITHUB_URL` | Public repository. Confirm before launch. |
| `NEXT_PUBLIC_SITE_URL` | Public origin, for absolute Open Graph URLs. |

## How the page works

The UI follows the Emotion agency site's structure and motion, in Helply colours and with Helply content:

1. **Entry gate** (`Gate.tsx`): logo, caption, an Enter pill that shows 3D loading progress, and "Enter without motion". Entering opens a soft circle onto the world.
2. **3D world** (`world/`): a fixed full-screen three.js scene, *Helply HQ at blue hour*: a glass-walled support atrium with a mirror floor, columns, support desks and hanging screens drawn on canvas (a Pidgin chat, cited log lines, a developer ticket, language chips), with a city skyline outside. A cloud of glossy flakes forms the Helply mark (sampled from `public/brand/helply-mark-color.svg`, coloured with the on-navy palette), then morphs into a chat bubble, a globe, a shield and a ring as you scroll. Flakes near the cursor brighten and move aside.
3. **Five scenes** (`scenes.tsx`): tall sections whose `data-scene` value maps to a camera keyframe in `World.tsx`. Headlines warp in and out with an RGB split (`MotionRoot.tsx`).
4. **Flash** (`FlashZone` + `WorldStage.tsx`): the camera zooms into the ring, a white ring grows and floods into the flat page.
5. **Flat page** (`flat.tsx`): pinned word-scrub paragraph with a focus list, the "Who it's for" gallery (pixel grid-shift entry), the trust table (the mark follows the cursor), contact, and a "next page" reveal where the world returns.
6. **Chrome**: nav with mono links, Settings (motion, quality), a glass pill CTA, and the assistant orb (`AiOrb.tsx`), which opens the live demo.

## Accessibility and fallbacks

- All copy is server-rendered. Without JavaScript the gate is hidden and the page reads as a normal document over a static backdrop.
- Without WebGL, the static backdrop with the mark stays and every section still works.
- `prefers-reduced-motion` (or Settings → Motion off, or "Enter without motion") turns off smooth scroll, idle animation and text warps; the camera cuts between scenes instead of flying.
- Settings → High quality off drops the mirror floor and reduces flakes; it is automatic on small or low-core devices.

## Product promises

The four "never does" statements in `flat.tsx` are product promises backed by tests. Reword only with the maintainers' agreement; never weaken them or add new ones.
