# Dream River – Assistant Context

Purpose: This file helps the AI assistant instantly pick up where we left off.

## Current Repo Layout
- Next.js app in `web/` using App Router, TypeScript, Tailwind v4, Turbopack.
- Supabase client via `lib/supabaseClient.ts` (client-side helper `getSupabase`).
- Pages:
  - `/` landing (marketing) + Globe component (realtime, time filters)
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
- Stack: Next.js 15, Tailwind v4, Supabase, Plausible. D3 installed for map (canvas/webgl TBD).
- Safe client init: `getSupabase()` avoids build-time crash if envs absent.
- Turbopack used for dev/build; workspace root warning acceptable for now.
 - Globe uses D3 Canvas (brand palette); time filters All/30d/7d; realtime Supabase.
 - Country-only geography; ISO-2 required; pins jittered within country centroid.

## Useful Commands
- Dev: `npm run dev` (in `web/`)
- Build: `npm run build`

## Links
- PRD context: “Dream River – Paper Boat / Six Degrees of Separation”.

## Assistant Notes
- Prefer absolute paths in commands.
- Keep edits minimal and lint-clean.
- When adding features, update `PROJECT_LOG.md` and this `CONTEXT.md` with new endpoints/pages and next steps.

