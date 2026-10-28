# Brand kit

Source of truth for how Helply looks and sounds. **This overrides the colours and fonts in `docs/FRONTEND_SPEC.md` §1.**

- `Helply-Brand-Identity-Guidelines.html`: the full guide (open in a browser; it loads Plus Jakarta Sans from Google Fonts).
- `assets/svg/`: true vectors (use these first). `assets/png/`: transparent PNGs at 1024 and 4096 px, app icons at 32 to 1024 px.
- `web/public/brand/` holds the three SVGs the site needs today (horizontal logo, mark, app icon).

## Quick reference (from the guide, v1.0)

| Token | Value | Use |
|---|---|---|
| Deep Navy | `#0F172A` | Text, dark surfaces, wordmark |
| Helply Blue | `#2563EB` | Buttons, links, active states, logo bubble. The one primary action per screen |
| Sky Blue | `#60A5FA` | Hover, charts, secondary icons, 3 px focus ring. **Never text** |
| Ice Blue | `#EFF6FF` | Cards, chat bubbles, light panels |
| Border Slate | `#DBEAFE` | Dividers, 1 px borders |
| White | `#FFFFFF` | Page surface, text on blue |

Mix: about 70% white/Ice Blue, 20% Deep Navy, 10% Helply Blue. Font: **Plus Jakarta Sans** (400/500/600/700/800), fallback Inter then system sans. Display 64/1.1 800 (letter-spacing -2%), H1 40/1.2 700, H2 32/1.3 600, body 16/1.5 400, caption 12/1.4 500. Sentence case; lines under 75 characters.
Radius: 12 px controls, 20 px cards and chat widget, 999 badges. 8 px spacing grid (4, 8, 16, 24, 32, 48, 72). Borders first; one soft shadow only on floating elements. Icons: 2 px rounded stroke. Max content width 1080 px, 12 columns, 24 px gutters.
Logo: never redraw, stretch, recolour, rotate, outline, shadow or place on busy backgrounds. Minimum sizes: horizontal 96 px, stacked 64 px, mark 24 px.
Voice: confident, warm, specific; plain verbs; describe the product rather than sell it; errors say what happened and how to fix it, without apologising.

## Known gaps in the guide (decide, then record in `PROGRESS.md`)
The guide has no yellow/gold and no green. The product UI currently uses gold for "cited log line" highlights and warnings, and green for success. Suggested mapping: success = Helply Blue or a green you add to the guide; warnings/cited rows = Ice Blue with a Sky Blue left border plus an icon; error = `#DC2626` (appears in the guide's source). Never convey status by colour alone.
