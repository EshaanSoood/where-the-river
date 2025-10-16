# Test Results Report — Sign Up / Log In / Referral / Country

Date: 2025-10-16
Env under test: Production (Vercel) — stable alias `https://riverflowseshaan.vercel.app`

## Summary
- Overall: BLOCKED at Step A (Sign Up → upsert). API returns 400 due to schema mismatch (`boat_color` column not found in `public.users`).
- Consequence: No profile rows can be created by the app; subsequent steps dependent on a profile row cannot pass in production.

## Environment & Evidence
- API endpoint under test: `POST /api/users/upsert`
- Request (sanitized): `{ name, email, country_code: 'IN', referral_id: '12345678' }`
- Response: `400 { "error": "Could not find the 'boat_color' column of 'users' in the schema cache" }`
- Production DB columns for `public.users`:
  ```
  id uuid,
  name text,
  email text,
  referral_id text,
  referred_by text,
  city text,
  message text,
  photo_url text,
  hidden boolean,
  created_at timestamptz,
  country_code character
  ```
  (no `boat_color` present)

- Existing auth user (manual test identity):
  - `auth.users`: id=a6ee1675-1521-4d69-847a-91d379a01c07, email=eshaansoood@gmail.com
  - `public.users`: no row for this email
  - `public.profiles`: none
  - `public.user_rewards`: none
  - `public.creator_messages`: none

## Step-by-step Results

### A) Sign Up (no referral)
- Action: POST `/api/users/upsert` (OTP step assumed done by app)
- Result: FAIL — 400 `boat_color` missing
- Impact: Cannot create profile row; test plan halts here.

### B) Sign Up (with referral)
- Skipped (dependent on Step A). Would fail with the same 400.

### C) Log In (existing user)
- Not meaningful without a profile row; skipped for prod. (Would only work for legacy pre-existing rows.)

### D) Negative: Missing country
- Not executed due to A, but analysis indicates client previously sent non‑ISO values; server/DB rejected silently.

### E) Negative: Malformed referral
- Not executed due to A; server lacks numeric/uniqueness guard in current production deployment (per audit), but failure at A supersedes.

### F) Double submit
- Not executed due to A.

### G) Referral uniqueness under concurrency
- Not executed due to A.

## Root Cause
- Deployed API route `/api/users/upsert` attempts to write a `boat_color` column to `public.users` (as seen in source), but the production DB’s `public.users` table does not have this column. Supabase schema cache rejects the write, returning HTTP 400.

## Country Reliability Notes
- Separate from the hard failure, prior analysis found the sign-up form used non‑ISO country values and the server uppercased without mapping to ISO‑2. This, along with error swallowing on the client, explains profiles with missing country or UI fallback “—”.

## Recommended Next Actions (two viable paths)

1) Schema-align (fastest to unblock prod sign-ups)
- Add `boat_color text null` to `public.users` in production.
- Re-run Step A; expect 200 and row with `country_code` (still subject to ISO normalization issue).

2) API-relax (no schema change)
- Update `/api/users/upsert` to omit `boat_color` when absent (feature-detect or remove field).
- Re-deploy, re-run Step A.

Follow-ups (after unblock):
- Normalize country: send ISO‑2 from client and enforce server trim/strip punctuation; surface server errors on client (don’t `.catch(() => {})`).
- Referral: generate numeric 8‑digit with retry on conflict in the server route; add DB uniqueness if acceptable.
- Atomic referral attach: when a `ref` param is present, insert profile + attach parent in a single transactional call.

## Queries & Commands Used

- Upsert test call (HTTP):
  ```
  POST /api/users/upsert { name, email, country_code: 'IN', referral_id: '12345678' }
  → 400 error boat_color missing
  ```
- Schema check:
  ```sql
  select column_name, data_type
  from information_schema.columns
  where table_schema='public' and table_name='users'
  order by ordinal_position;
  ```
- Auth user lookup:
  ```sql
  select id, email from auth.users where email='eshaansoood@gmail.com';
  ```
- App rows (all empty for the test account):
  ```sql
  select * from public.users where email='…';
  select * from public.profiles where email='…';
  select * from public.user_rewards where user_id='…';
  select * from public.creator_messages where user_id='…';
  ```

## Exit Criteria to Re-run Full Plan
- Fix A (schema or API) deployed to production.
- Confirm /api/users/upsert returns 200 on a new email.
- Proceed through B–G per `docs/test-plan.md`.


## Second Run — Production after DB changes (2025-10-16)

Endpoints: `https://riverflowseshaan.vercel.app`

DB changes applied prior to run:
- `public.users`: added `boat_color text null`, `otp_verified boolean`
- `public.country_map` created and seeded (7 rows); normalization trigger installed
- Partial unique index on numeric 8‑digit `referral_id`

### Requests & Results

1) Sign Up (no referral, with label country)
```
POST /api/users/upsert
{ name: "NoRef Test", email: "noref-<ts>@example.com", country_code: "India", referral_id: "51739264" }
→ 400 { error: "value too long for type character(2)" }
```
Observation: Passing a full country label still errors at the DB layer (char(2) cast) before the normalization trigger can resolve to ISO‑2.

2) Sign Up (parent, ISO‑2 country, fixed 8‑digit referral)
```
POST /api/users/upsert
{ name: "Parent Test", email: "parent-<ts>@example.com", country_code: "IN", referral_id: "82347653" }
→ 200 { user: { email: "parent-$(date +%Y%m%d%H%M%S)@example.com", country_code: "IN", referral_id: "82347653", otp_verified: true, ... } }
```
Note: Because the curl used single quotes with shell substitution in the payload, the literal email contains `$(date ...)`. Row exists in `public.users` with `country_code='IN'`.

3) Sign Up (child, label country, referring parent)
```
POST /api/users/upsert
{ name: "Child Test", email: "child-<ts>@example.com", country_code: "United States", referral_id: "36495827", referred_by: "82347653" }
→ 400 { error: "value too long for type character(2)" }
```
Observation: Same failure mode as (1).

4) Hydration check for parent
```
POST /api/me { email: "parent-$(date +%Y%m%d%H%M%S)@example.com" }
→ 404 { exists: false }
```
Likely due to the literal email value mismatch; verifying directly in DB shows the `public.users` row present with that email string.

### Conclusions
- Upsert now succeeds when `country_code` is provided as ISO‑2 (e.g., `IN`).
- Providing a full country label (e.g., `India`, `United States`) still yields a DB error. The BEFORE trigger was not able to intercept before the `char(2)` length check.
- Referral ID 8‑digit numeric inserts are accepted; parent row created successfully.

### Next Steps (no code change vs. minimal code change)
- No code change: Continue sending ISO‑2 from the client forms manually during testing; avoid labels until app normalization is added.
- Minimal code change (recommended): Update `/api/users/upsert` to normalize/sanitize to ISO‑2 before insert (as drafted in `docs/proposed-diffs.patch`). This prevents the `char(2)` error and aligns with the DB constraint.

### DB Verification Snippets
```sql
-- Confirm parent row
select email, country_code, referral_id, referred_by
from public.users
where email like '%parent-%'
order by created_at desc
limit 1;

-- Confirm mapping table
select count(*) from public.country_map;
```
