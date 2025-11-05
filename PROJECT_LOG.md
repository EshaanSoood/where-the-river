## 2025-11-05

- Created separate Vercel project `riverflows-dev` for staging/dev deployments (production `riverflows` left untouched).
- Mirrored Supabase environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) across production/preview/development targets on the new project.
- Stored local project links as `.vercel/project.dev.json` (dev) and `.vercel/project.prod.json` (production) for easy switching.

## 2025-10-09

- Added country-only schema: `country_code CHAR(2)` (deprecated `city`).
- Updated signup (participate and dashboard sheet) to require country dropdown (ISO-2), removed city.
- Implemented Globe component (D3 canvas): nodes (users), links (parent→child), time filters (All/30d/7d), realtime updates via Supabase.
- Integrated Globe under landing (BelowMap) with touch pan support; brand palette applied.
- Added server API routes: `/api/users/check`, `/api/users/upsert` with `country_code`.
- Vercel: linked project `riverflows`, deployed. Env vars confirmed. 401 on root traced to protection/middleware; verify Pages/Access Controls settings and middleware matcher.

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
