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
- Layout container & footer
  - Unified site container with clamp gutters (max 32px) wrapping header, 3‑column grid, and thin footer; page uses flex column with min‑vh.
  - Desktop grid locked to 1:2:1; right column is independently scrollable (internal overflow); center globe scales without transforms; left embeds consolidated into one frosted panel.
  - Columns aligned: grid `items-start`; shared side-panel top offset `margin-top: var(--section-gap, 16px)`; center globe has no extra top margin; shared borders for visual alignment.
  - Bandcamp/YouTube embeds: responsive 100% width, 16:9 for YouTube; compact Bandcamp height with dynamic adjustment based on column space.
  - Left panel order: YouTube on top, Bandcamp below; Bandcamp height auto-computed from remaining space; lighter divider (1px rgba(255,255,255,0.25)).
  - Globe container: frosted glass background (`rgba(11,13,26,0.80)` + `backdrop-filter: blur(12px)`), matching borders.
  - Right text panel: sticky bottom gradient hint to suggest more content.
  - Footer: slim frosted bar (40px) inside container; if hidden, fallbacks documented; later restored and visible.
- Dashboard – Share overlay
  - Added `DashboardBadge` overlay with `data-mode` (default|share); Share button toggles to share mode and morphs into four tiles via staggered animation (reduced-motion aware).
  - Share screen mounts `ShareTiles` (WhatsApp/Email/SMS/Web Share) with default message, referral URL, fallback copy; Back restores focus to Share button; focus trap, ESC/outside click handled.
- Rewards – Mist & progression
  - Mist effect moved to CSS keyframes; visible layering (z‑index) with pointer‑events:none; opacity and duration tuned (40s) with reduced‑motion guard.
  - Fixed invalid opacity utilities; only the card container clips; mist shows only on locked tiers.
  - Added Next Reward panel with X/Y progress, pill “+N to unlock”, and progress bar; locked cards show matching pill.
  - Claimable cards glow/pulse; one‑shot confetti on claim; claimed stamp with date/time and persistent View Reward.
  - Persist `user_rewards` for all tiers (20/50/100/150/250/400); reload reconstructs claimed state.
  - Aria‑live announcements for unlocks/claims/errors; visible focus rings.
- Name required
  - Client: name sanitization, required, error UI; submit disabled until valid.
  - Server: `/api/users/upsert` validates name (`2..80`, has letter/digit); logs invalid_name; persists name.
  - Dashboard: email fallback removed; banner prompts legacy users to add name; `/api/me` returns `needs_name`.
- Country completeness
  - Introduced `lib/iso2.ts` (250 ISO‑2 incl. XK); UI dropdown now uses full set; artifacts generated under `.tmp/`; seeded `public.country_map` to 250 rows.
- SVG rivers (organic, stable)
  - ReactGlobe native arcs disabled; SVG overlay is the only link layer.
  - Per‑session seed + per‑edge params `{ sign, curvFactor (10–22%), wiggleAmp (1.5–5%), wiggleFreq (1–3), phase }` cached once.
  - Two‑control‑point Bézier in screen space; lateral clamp ≤ 22% of chord; gentle sine wiggle along perpendicular; single‑sided (no backtracking).
  - Fade easing: opacity = clamp(dot(camera, midpoint),0,1)^2.5 × 0.45; no floor, smooth horizon fade.
  - DOM reuse: one persistent `<path>` per edge; camera changes only reproject and update `d`/opacity; resize debounced (~150ms).
  - Tiny per‑edge hue variance (cyan/blue) and non‑scaling strokes; slow dash‑offset animation (reduced‑motion aware).
  - Boats’ 3D curves biased to the same side as rivers with bounded curvature; visually follow rivers.
- Build & deploy
  - Clean compile; deployed to Vercel; stable alias updated; pushed to GitHub. `.gitignore` excludes `.env*`.
- Share Your Boat flow (no layout changes):
  - New API `POST /api/profiles/by-email` returns `{ id, name, ref_code_8 }` for building referral URLs.
  - `components/ShareTiles.tsx` with four actions: WhatsApp, Email, Messages (SMS), and Web Share API; IDs: `#btn-whatsapp`, `#btn-email`, `#btn-messages`, `#btn-webshare`.
  - Uses `window.RIVER_REFERRAL_URL` if provided; falls back to computed origin + `?ref=<8‑digit>`; email greets with full name when available.
  - Copy-to-clipboard fallback with `aria-live` confirmation; modal remains open; focus preserved.
  - Processed white glyph icons placed under `/public/logos/` for dark-blue tiles.
- Globe containment & spacing:
  - Center globe panel uses dark frosted glass (`rgba(11,13,26,0.80)` + blur) with matching borders; square wrapper removed to prevent clipping; globe fills available height.
  - Mobile: added always-visible intro card (“Where The River Flows”) below the globe (not in accordion).
- Bandcamp mobile sizing: increased small player height to ~100px while keeping large desktop player.
- Lint/build hygiene:
  - Typed `navigator.share/clipboard` guards and `Intl.DisplayNames` wrapper; eliminated blocking ESLint errors.
  - Build verified locally with Next.js 15 + Turbopack; remaining warnings are non-blocking (unused vars in legacy code, next/no-img-element on logos). Dev server restarts used `?nocache=1` to bust cache.
- Deployment:
  - Deployed to Vercel production and pushed to git (main). Alias remains `riverflowseshaan.vercel.app`.

## Rewards – Additional Tweaks (Accessibility & UX)
- Mist overlay: z-index bumped to 90; opacity 0.30; drift speed +20% (32s). Confetti container z-index 40. Mist remains clipped by cards.
- Contrast: deeper teal progress fill and border; claim button with stronger border/fill; improved legibility for low-vision users.
- Layout: tightened vertical paddings by ~15–20% across sections and cards to reduce scroll.
- Bold body text (scoped): rewards panel body text uses bold Helvetica; site-wide body remains normal.
- Header/content scrolling: rewards header stays fixed; only content scrolls; focus trap intact.
- Modal focus: when “How Points Work” opens, focus auto-shifts to the modal container; close restores focus.

## Globe – Land Colors
- Main land: `#B56B45`
- Hover land: `#DCA87E`
- Back/side land: `#7C4A33`

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

