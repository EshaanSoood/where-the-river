# Audit: Sign Up / Log In / Referral + Country Reliability (Next.js + Supabase)

Author: Senior Full‑Stack Engineer
Date: 2025‑10‑16
Scope: Frontend (Next.js), API routes, Supabase clients, auth, DB migrations/policies

## System overview (text diagram)

Auth (Supabase OTP)
→ participate page `app/(auth)/participate/page.tsx`
→ on verify OTP → POST `/api/users/upsert`
→ server writes to `public.users` via service role
→ profile/dashboard reads from `public/users` (various components) and supplemental views (leaderboard)
→ referral sharing uses `referral_id`

```
Client (Participate)
  ├─ signInWithOtp(email)
  └─ verifyOtp(email, code)
       └─ POST /api/users/upsert { name, email, country_code, message, referral_id }
            └─ supabaseServer.from('users').upsert(...)

Dashboard (BelowMap)
  ├─ POST /api/me { email } → merges users + profiles views; returns name, country_code, etc.
  └─ Reads /api/profiles/by-email to build referral URL
```

## Single Source of Truth (SoT)

- Active SoT in the running app: `public.users`
  - Fields used: `name`, `email`, `country_code`, `message`, `referral_id`, `referred_by`, `otp_verified`, `boat_color`, `created_at`.
- A newer `public.profiles` schema exists in migrations (with an 8–10 char `referral_code` generator), but the app code paths do not insert or hydrate from it.
- To satisfy "single table" constraint without schema duplication: continue using `public.users` as SoT across Sign Up and Log In.

## 1) Trace: Sign Up → Profile row → Referral handling

- Profile table: `public.users` (SoT)
- Insert path: `app/(auth)/participate/page.tsx` → `/api/users/upsert/route.ts`
  - `page.tsx` submits `{ name, email, country_code, message, referral_id }`
  - `upsert/route.ts` writes into `public.users`
- Referral code:
  - Currently created on the client via `Math.random().toString(36).slice(2, 10)` (alphanumeric, not guaranteed numeric and not guaranteed unique).
  - Stored in `users.referral_id`. A unique constraint is implied by `ON CONFLICT (email)` upsert (email unique), not by `referral_id`.
  - No central numeric 8‑digit generator in code; no DB uniqueness guard on the code.
- Referral attach:
  - A placeholder `app/api/referral/route.ts` exists; there is no atomic linkage logic observed for "parent referral code" on profile creation.

Verification:
- Insert lands in `public.users` (server route hardcodes `from('users')`).
- No numeric‑only, 8‑digit, uniqueness retry found in code for referral generation.

## 2) Trace: Log In → Profile fetch

- Login path (OTP) uses `/api/users/check/route.ts` to read `public.users` by email.
- Dashboard hydration: `components/BelowMap.tsx` calls `/api/me` (server) which merges `public.users` and a limited view from `public.profiles` for referral display only; SoT remains `users`.
- No evidence of accidental read from a different table for the main profile fields in the user dashboard.

## 3) Country field reliability audit

- UI control: `participate/page.tsx` country dropdown is populated from `lib/countries.ts` and uses the visible country name as the `value`.
- Sanitization: `/api/users/upsert` uppercases `country_code`, but does not normalize names to ISO‑2; if `users.country_code` is constrained to 2‑char or has a length check (common in this codebase), inserts may fail or truncate.
- Symptom "—" (em‑dash): `BelowMap.tsx` renders `resolvedCountryName` and falls back to `'—'` when `country_code` is falsy/not matched. This is view‑only, but exposes missing writes.
- Error swallowing: the client `.catch(() => {})` on the upsert call hides failures—navigation continues to the dashboard, so the user thinks signup "worked" even if the write failed.

Repro:
- Select any country → value is a long label (e.g., "United States").
- Upsert expects ISO‑2; DB layer may reject; client hides error; dashboard shows em‑dash.

## 4) Policies & Permissions

- `supabase/lib/supabaseServer.ts` uses service role key → bypasses RLS for inserts/updates in API routes.
- `globe_seed_and_rls.sql` shows RLS policies for `public.users` allowing anon SELECT for nodes; write operations occur via service role.
- Recommendation: maintain RLS for read paths; server writes remain service‑role.

## 5) Edge cases & race conditions

- Double submit: concurent verify/submit not disabled everywhere—button disable is present at submit points but the optimistic upsert call needs a consistent awaiting path.
- Referral uniqueness under concurrency: no DB uniqueness on `users.referral_id` and no retry loop → risk of collision.
- Sentinel country: ensure the dropdown does not submit the sentinel ("Select your country"); ensure we submit canonical ISO‑2 values and trim/strip punctuation like U+2014.

---

## Findings

| Issue | Evidence | Impact | Proposed fix |
|------|----------|--------|--------------|
| Country is missing / shows "—" | `participate/page.tsx` sends full country names; DB expects 2‑char code; client swallows errors | Profiles missing country; poor UX; downstream features fail | Normalize to ISO‑2 before POST; trim and strip U+2014; enforce 2‑char on server; show error if upsert fails |
| Referral code not 8‑digit numeric or unique | Client random base‑36 slice; no uniqueness/constraint | Collisions possible; non‑numeric codes | Generate 8‑digit numeric code on server with retry; add unique index + numeric CHECK; fall back if conflict |
| Not attaching parent referral atomically | Placeholder referral route; no atomic linkage visible | Lost referrals under race/partial failures | Server route: within one transaction (Postgres function), insert profile + attach parent by code; return full profile |
| Inconsistent SoT hints (`profiles` vs `users`) | Code inserts into `users`, but migrations add `profiles` | Drift/confusion | Confirm `users` as SoT; remove stray profile reads for hydration; expose one `/api/me` from users only |
| Error swallowing on upsert | `.catch(() => {})` in `participate/page.tsx` | Users advance despite failed writes | Remove catch/ or handle status; surface error message and stay on page |

---

## Proposed minimal diffs (not applied; see `docs/proposed-diffs.patch`)

- Normalize `country` to ISO‑2 on client and server; do not submit sentinel.
- Add server referral generator to produce numeric 8‑digit codes w/ uniqueness retry.
- If `ref` param present, attach parent in the same server call (transaction via RPC).
- Hydrate dashboard from `public.users` consistently; keep `/api/me` as single source.

---

## File map (relevant paths)

- Sign Up form & handlers: `app/(auth)/participate/page.tsx`
- Login check: `app/api/users/check/route.ts`
- Upsert: `app/api/users/upsert/route.ts`
- Dashboard hydration: `components/BelowMap.tsx` → `/api/me`
- Country helpers: `lib/countryList.ts`, `lib/countries.ts`
- Supabase server/client: `lib/supabaseServer.ts`, `lib/supabaseClient.ts`
- Legacy/referral SQL: `supabase/migrations/20251012_referrals_profiles_awards.sql`, `scripts/globe_seed_and_rls.sql`

---

## Acceptance criteria checklist

- [x] Single SoT identified: `public.users` used for both Sign Up and Log In.
- [x] Referral: propose 8‑digit numeric unique generation attached to the same row; atomic parent attach proposed.
- [x] Country repro + concrete fix (ISO‑2 normalization + sanitization; stop swallowing errors).
- [x] Diffs prepared (see patch) — not applied.
- [x] Test plan included (manual scripts).
