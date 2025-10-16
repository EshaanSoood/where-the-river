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

## Recent Changes — Yesterday Afternoon
- Globe visual refresh:
  - Introduced `components/GlobeRG.tsx` using `react-globe.gl` with real arcs data sourced from our nodes/links.
  - Tooltip follows cursor with viewport clamping; pinch-to-zoom enabled with guarded range; node markers always visible and responsively sized.
  - Kept WebGL canvas non-interactive for AT: `aria-hidden="true" role="presentation" tabindex="-1"`.
- Screen reader support:
  - Added `components/GlobeSummarySR.tsx` — an SR-only live region summarizing people, countries, connections, and longest river endpoints; refreshes every 10 minutes and on tab focus.
- Dashboard overlay (inline):
  - `components/BelowMap.tsx` now opens a responsive inline overlay for guest (signup/login) and user dashboards; focus trap and Escape handling included.
  - Signup flow includes country ISO-2 select sourced from our world data, favorite song, and boat color picker with preview.
- Bandcamp & branding:
  - `components/BandcampEmbed.tsx` themed to project palette; large player on desktop, small embed on mobile.
  - `components/Background.tsx` adds a fixed background image with subtle blur and overlay; `Hero` pane uses aqua glass effect.
- Packages:
  - Added `react-globe.gl`, bumped `three` to `^0.169.0` to satisfy subpath imports.

## Recent Changes — Today
- Share Your Boat flow (no layout changes):
  - New API `POST /api/profiles/by-email` returns `{ id, name, ref_code_8 }` for building referral URLs.
  - `components/ShareTiles.tsx` with four actions: WhatsApp, Email, Messages (SMS), and Web Share API; IDs: `#btn-whatsapp`, `#btn-email`, `#btn-messages`, `#btn-webshare`.
  - Uses `window.RIVER_REFERRAL_URL` if provided; falls back to computed origin + `?ref=<8‑digit>`; email greets with full name when available.
  - Copy-to-clipboard fallback with `aria-live` confirmation; modal remains open; focus preserved.
  - Processed white glyph icons placed under `/public/logos/` for dark-blue tiles.
- Globe containment & spacing:
  - Dedicated globe container with `overflow-hidden` and responsive height `clamp(45vh, 60vh, 70vh)`.
  - CSS vars `--globe-offset-y` and `--globe-scale` applied to canvas layer; tuned per breakpoint to maintain safe gap from CTAs and keep the globe fully contained.
- Bandcamp mobile sizing: increased small player height to ~100px while keeping large desktop player.
- Lint/build hygiene:
  - Typed `navigator.share/clipboard` guards and `Intl.DisplayNames` wrapper; eliminated blocking ESLint errors.
  - Build verified locally with Next.js 15 + Turbopack; remaining warnings are non-blocking (unused vars in legacy code, next/no-img-element on logos).
- Deployment:
  - Deployed to Vercel production and pushed to git (main). Alias remains `riverflowseshaan.vercel.app`.

## Deployment
- Vercel project linked: `riverflows` (org: eshaans-projects-d91d58e1)
- Stable domain: `https://riverflowseshaan.vercel.app` (alias)
- Latest Production: `https://riverflows-5umcyvw4i-eshaans-projects-d91d58e1.vercel.app` (current)
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


## Recent Changes — Yesterday & Today (ISO‑2, Referrals, Globe Arcs)
- ISO‑2 Canonical Country Handling
  - Frontend: `app/(auth)/participate/page.tsx` country dropdown now submits ISO‑2 (`value=code`, `label=name`). Placeholder disabled.
  - Backend: `app/api/users/upsert/route.ts` normalizes to ISO‑2; rejects unknown labels with `400 invalid_country`.
  - `/api/me`: returns `country_code` and derived `country_name` using `lib/countryMap.ts`.
  - Shared util: `lib/countryMap.ts` (normalize input, resolve ISO‑2, derive friendly name from Intl.DisplayNames).
- Referral Generation & Robustness
  - Server‑side referral_id generation with auto‑retry on unique conflict (max 5 attempts). Client‑sent `referral_id` ignored; `referred_by` still accepted.
  - DB confirmed: `users.referred_by` → `users.referral_id` with ON DELETE SET NULL; unique index on `referral_id` (plus partial numeric 8‑digit).
- Globe Feed & Rendering
  - Data source `lib/globeData.ts`: returns only public fields; nodes keyed by `referral_id`; edges built client‑side `referred_by → referral_id`.
  - Edges: switched from straight `<line>` to organic quadratic Bézier `<path>` with deterministic seeding and facing‑aware opacity in `components/Globe.tsx`.
  - Hover verification (temporary): logs `{ code, name }` under `?debug=1`.
- Tests & Audits
  - Built deep branching referral chain A–N plus O via real API; verified ISO‑2 writes, unique 8‑digit IDs, correct edges; then cleaned up test users.
  - Added/updated docs:
    - `docs/audit-signup-login-referral.md`, `docs/proposed-diffs.patch`, `docs/test-plan.md`, `docs/test-results.md`, `docs/testresultsnew.md`
    - `docs/country-handling.md`, `docs/country-and-referrals.md`
    - `docs/countryhandlingtest.md`
    - `docs/point test.md` (graph hardening, edge mapping audit, organic edges, cleanup)
- Misc UI
  - Reduced outer container horizontal padding by ~20% in `components/BelowMap.tsx`.

## Action Items
- Consider adding `.limit`/cursor pagination to globe feed for scale.
- Optional guard: skip self‑loop edges if `source===target`.

