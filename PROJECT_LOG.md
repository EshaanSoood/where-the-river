# Dream River – Project Log

Audience: Anyone following development. Chronological updates + backlog.

## 2025-10-06
- Initialized Next.js app (`web/`) with TypeScript, Tailwind v4, App Router, Turbopack.
- Installed deps: Supabase, auth helpers, Plausible, Framer Motion, D3.
- Added core routes: `/`, `/participate`, `/dashboard`, `/r/[referral]`, `/admin`.
- Implemented `getSupabase` client and Plausible provider.
- API: `POST /api/referral` placeholder creating basic referral token.
- DB: committed `db/schema.sql` (users, referrals, leaderboard) for Supabase setup.
- Added `.env.example` and updated `README.md` quickstart.
- Verified `npm run build` and launched dev server.

### Notes
- Turbopack workspace root warning observed; acceptable for now.
- Client Supabase init deferred to runtime to avoid build-time env failures.

## Backlog / Next Up
- Supabase: create tables + RLS policies; add indexes.
- Auth UX: post-login profile capture (name, city, message, photo upload to Supabase storage).
- Referral attribution: capture inviter token when visiting `/r/[referral]` and bind on signup.
- Dashboard: share panel with copy + SMS/email/WhatsApp hooks; show connection counts.
- Map visualization: choose D3 Canvas/WebGL; render rivers; highlight animation.
- Leaderboard: compute largest/longest/fastest; possibly materialize/cache.
- Admin panel: auth, moderation (reports/photos/messages), CSV export.
- Analytics events: track invites sent, clicks, streams.
- Assets: add placeholder images per PRD.

## Done
- Project scaffold and core pages
- Supabase client + Plausible provider
- Referral API placeholder
- Build + dev run verified
