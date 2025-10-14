# Dream River – Assistant Context

Purpose: This file helps the AI assistant instantly pick up where we left off.

## Current Repo Layout
- Next.js app in `web/` using App Router, TypeScript, Tailwind v4, Turbopack.
- Supabase client via `lib/supabaseClient.ts` (client-side helper `getSupabase`).
- Pages:
  - `/` landing (marketing) + Globe component (Three.js)
  - `/participate` (magic link OTP)
  - `/dashboard` (overlay panel; auth-aware)
  - `/r/[referral]` (referral landing)
  - `/admin` (placeholder)
- API:
  - `app/api/referral/route.ts` (basic referral creation placeholder)
  - `app/api/users/check/route.ts` (check by email)
  - `app/api/users/upsert/route.ts` (create/update with `country_code`)
  - `app/api/my-referral-link/route.ts` (scaffold; will return share URL when auth wired)
- DB:
  - Legacy: `db/schema.sql` (deprecated scaffold)
  - New: `supabase/migrations/*` implements `public.profiles`, `public.referral_awards`, RLS, RPC `finalize_join`, referral code generator/triggers, and seed
- Analytics: Plausible via `app/providers.tsx`.

## Env Vars Needed
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `PLAUSIBLE_DOMAIN`
- `PUBLIC_APP_BASE_URL` (e.g., `https://riverflowseshaan.vercel.app`)

Stored example: `web/.env.example`. Copy to `web/.env.local` for dev.

## Open Threads / Next Actions
- Wire `/api/my-referral-link` to authenticated user and return `${PUBLIC_APP_BASE_URL || stable}/r/<referral_code>`
- Add `/r/[referral]` landing + attribution on signup (`parent_user_id`)
- Dashboard: counts, share panel, copy/share; call `finalize_join` after verification
- Leaderboard + map enhancements per PRD
- Admin panel: moderation, exports, flags

## Decisions So Far
- Stack: Next.js 15, Tailwind v4, Supabase, Plausible. Three.js for globe (OrbitControls), TopoJSON for world data.
- Safe client init: `getSupabase()` avoids build-time crash if envs absent.
- Turbopack used for dev/build; workspace root warning acceptable for now.
- Globe now uses Three.js (blue ocean, amber extruded land, dual cloud layers). Double‑tap (mobile) or double‑click toggles fullscreen; aria-hidden to avoid focus trap; tooltip follows cursor.
- Country-only geography; ISO-2 required; pins jittered within country centroid.

## Today’s Changes
- Colors (`app/globals.css`): palette aligned to new CSS (kept Typekit). `--teal` is `#135E66`, `--aqua` is `#2AA7B5`. Global link color uses `var(--aqua)`.
- Hero/layout (`components/BelowMap.tsx`):
  - Consolidated controls to page corners: top-left shows Dashboard when logged-in, Participate/Login when logged-out; top-right shows Leaderboard (collapsed by default). Removed rim-adjacent buttons to avoid overlapping the globe.
  - Ensured globe sits centered on its own layer; controls are outside canvas hit area. Retain two-column layout: left text (`Hero`), right Bandcamp embed.
  - Exactly one H1 remains via `Hero`; headings maintain proper hierarchy.
- Globe (`components/Globe.tsx`): marked canvas as decorative (`aria-hidden`, `role=presentation`, `tabindex=-1`) to prevent focus trapping; retains visuals and tooltips.
- Globe overlay: lightweight SVG layer for nodes, labels, and straight edges. Overlay now renders from React state (post-fetch) with refs for per-frame positioning. Fallback “Test Node” when dataset empty. Debug overlay via `?debug=1` shows counts (profiles, nodes, edges).
- Cleanup: pruned unused rim controls; kept referral/auth logic intact. Identified unused placeholders (`DesktopSidebar.tsx`, `AlbumPlayer.tsx`) for removal when safe.
- DB (Supabase): unchanged.
- API: unchanged (`/api/my-referral-link` wiring still pending).

## Deployment
- Vercel project linked: `riverflows` (org: eshaans-projects-d91d58e1)
- Stable domain: `https://riverflowseshaan.vercel.app` (alias)
 - Latest Production: `https://riverflows-oyhlljgwr-eshaans-projects-d91d58e1.vercel.app` (current)
- CLI flow: `vercel --prod --yes` then `vercel alias set <prod_url> riverflowseshaan.vercel.app`

## Useful Commands
- Dev: `npm run dev` (in `web/`)
- Build: `npm run build`

## Links
- PRD context: “Dream River – Paper Boat / Six Degrees of Separation”.

## Assistant Notes
- Prefer absolute paths in commands.
- Keep edits minimal and lint-clean.
- When adding features, update `PROJECT_LOG.md` and this `CONTEXT.md` with new endpoints/pages and next steps.

