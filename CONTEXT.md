# Dream River – Assistant Context

Purpose: This file helps the AI assistant instantly pick up where we left off.

## Current Repo Layout
- Next.js app in `web/` using App Router, TypeScript, Tailwind v4, Turbopack.
- Supabase client via `lib/supabaseClient.ts` (client-side helper `getSupabase`).
- Pages:
  - `/` landing (marketing) + Globe component (Three.js)
  - `/participate` (magic link OTP; country-only form)
  - `/dashboard` (badge placeholder)
  - `/r/[referral]` (referral landing)
  - `/admin` (placeholder)
- API:
  - `app/api/referral/route.ts` (basic referral creation placeholder)
  - `app/api/users/check/route.ts` (check by email)
  - `app/api/users/upsert/route.ts` (create/update with `country_code`)
- DB scaffolding: `db/schema.sql` (users, referrals, leaderboard) – to run in Supabase SQL editor.
  - Added `country_code CHAR(2) not null`; `city` deprecated.
- Analytics: Plausible via `app/providers.tsx`.

## Env Vars Needed
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `PLAUSIBLE_DOMAIN`

Stored example: `web/.env.example`. Copy to `web/.env.local` for dev.

## Open Threads / Next Actions
- Implement RLS and finalize schema for `users`, `referrals`, `leaderboard`.
- Auth flow: after magic link, collect name/country/message/photo; upsert user and generate `referral_id`.
- Referral attribution: read inviter token from `/r/[referral]`, store as `referred_by` when signing up.
- Dashboard: show counts, share panel, generate share URL `/r/[id]`.
- Leaderboard + map enhancements per PRD.
- Admin panel: moderation, exports, flags.

## Decisions So Far
- Stack: Next.js 15, Tailwind v4, Supabase, Plausible. Three.js for globe (OrbitControls), TopoJSON for world data.
- Safe client init: `getSupabase()` avoids build-time crash if envs absent.
- Turbopack used for dev/build; workspace root warning acceptable for now.
- Globe now uses Three.js (glass ocean, rotating clouds, extruded land, animated river tubes, markers, boat). Double‑tap (mobile) or double‑click toggles fullscreen globe overlay.
- Country-only geography; ISO-2 required; pins jittered within country centroid.

## Today’s Changes
- Replaced D3 canvas globe with Three.js implementation from local prototype; integrated exactly, no extra files.
- Layout overhaul (`components/BelowMap.tsx`):
  - Desktop: 25px global side padding; Dashboard (top-left) and Leaderboard (top-right) chips above the centered globe; 15px gap below globe, then two columns (left text/Hero, right Bandcamp).
  - Mobile: Globe dominates; top-left/right hamburger chips for Dashboard/Leaderboard open as overlay panels with shadow and close; double‑tap globe for fullscreen overlay with close; below globe, heading/text then Bandcamp.
- Globe enhancements (`components/Globe.tsx`): fullscreen overlay behavior; tooltips on country hover; OrbitControls with auto-rotate.
- Added `web/types.ts` for GeoJSON typings.
- Dependencies: added `three`, `topojson-client`; dev types `@types/three`, `@types/topojson-client`.

## Deployment
- Vercel project linked: `riverflows` (org: eshaans-projects-d91d58e1)
- Deployed directly from local (no git push):
  - Live URL: https://riverflows-7fkwo9qch-eshaans-projects-d91d58e1.vercel.app
  - CLI: `vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod`

## Useful Commands
- Dev: `npm run dev` (in `web/`)
- Build: `npm run build`

## Links
- PRD context: “Dream River – Paper Boat / Six Degrees of Separation”.

## Assistant Notes
- Prefer absolute paths in commands.
- Keep edits minimal and lint-clean.
- When adding features, update `PROJECT_LOG.md` and this `CONTEXT.md` with new endpoints/pages and next steps.

