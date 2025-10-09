# Dream River – Assistant Context

Purpose: This file helps the AI assistant instantly pick up where we left off.

## Current Repo Layout
- Next.js app in `web/` using App Router, TypeScript, Tailwind v4, Turbopack.
- Supabase client via `lib/supabaseClient.ts` (client-side helper `getSupabase`).
- Pages:
  - `/` landing (marketing)
  - `/participate` (magic link OTP)
  - `/dashboard` (placeholder)
  - `/r/[referral]` (referral landing)
  - `/admin` (placeholder)
- API:
  - `app/api/referral/route.ts` (basic referral creation placeholder)
- DB scaffolding: `db/schema.sql` (users, referrals, leaderboard) – to run in Supabase SQL editor.
- Analytics: Plausible via `app/providers.tsx`.

## Env Vars Needed
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `PLAUSIBLE_DOMAIN`

Stored example: `web/.env.example`. Copy to `web/.env.local` for dev.

## Open Threads / Next Actions
- Implement real Supabase schema and RLS for `users`, `referrals`, `leaderboard`.
- Auth flow: after magic link, collect name/city/message/photo, create user row, generate `referral_id`.
- Referral attribution: read inviter token from `/r/[referral]`, store as `referred_by` when signing up.
- Dashboard: show counts, share panel, generate share URL `/r/[id]`.
- Map + leaderboard implementations per PRD.
- Admin panel: moderation, exports, flags.

## Decisions So Far
- Stack: Next.js 15, Tailwind v4, Supabase, Plausible. D3 installed for map (canvas/webgl TBD).
- Safe client init: `getSupabase()` avoids build-time crash if envs absent.
- Turbopack used for dev/build; workspace root warning acceptable for now.

## Useful Commands
- Dev: `npm run dev` (in `web/`)
- Build: `npm run build`

## Links
- PRD context: “Dream River – Paper Boat / Six Degrees of Separation”.

## Assistant Notes
- Prefer absolute paths in commands.
- Keep edits minimal and lint-clean.
- When adding features, update `PROJECT_LOG.md` and this `CONTEXT.md` with new endpoints/pages and next steps.

