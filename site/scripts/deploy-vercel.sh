#!/usr/bin/env bash
# Builds landing page + web app, assembles site/deploy, and deploys that folder to the Vercel project "helply-web".
# `/` = landing page (site/), `/demo` and `/app/*` = web app (web/); `/v1/*` and `/health` are proxied to the API (see vercel.json).
# Optional: NEXT_PUBLIC_API_URL=https://api.helplygh.online makes the landing-page orb chat with the API directly (the API must allow this origin in CORS_ORIGIN); unset = the orb opens /demo.
# Requires: vercel CLI logged in. First run links the project (kept out of git).
set -euo pipefail
cd "$(dirname "$0")/.."
export NEXT_PUBLIC_GITHUB_URL="${NEXT_PUBLIC_GITHUB_URL:-https://github.com/KosherKev/helply}"
export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://helplygh.online}"
npm run build:all
cp vercel.json deploy/vercel.json
cd deploy
[ -d .vercel ] || vercel link --yes --project helply-web
vercel deploy --prod --yes
