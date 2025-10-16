# Test Plan: Sign Up / Log In / Referral / Country Reliability

## Environments
- Local dev: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Production (Vercel): same vars present and verified

## Pre-checks
1. Confirm `public.users` exists, and `email` unique index present
2. Optional: add unique index on `users.referral_id` for final rollout

## Scripts

### A. Sign Up (no referral)
1. Visit `/participate`
2. Fill: First/Last/Email/Country (select ISO‑2 code values), optional message
3. Submit → receive OTP → verify
4. Expect navigation to dashboard

Verify (DB):
```sql
select name, email, country_code, referral_id, referred_by, otp_verified
from public.users where email = '<email>';
```
- country_code == ISO‑2
- referral_id == 8 digits (numeric)
- referred_by is null
- otp_verified == true

### B. Sign Up (with referral)
1. Visit `/?ref=<8-digit-parent>` then `/participate`
2. Complete Sign Up as above
3. Verify DB:
```sql
select email, referred_by from public.users where email = '<child-email>';
```
- referred_by equals parent code (or mapped parent id if using user linkage)

### C. Log In (existing user)
1. From `/participate` choose Login
2. Enter email → Send code → Verify
3. Expect dashboard hydrated with name/country

Verify (API):
- `/api/me` returns `name,country_code` for same user

### D. Negative: Missing country
1. Attempt to submit without selecting a country → UI blocks
2. Force a bad value (dev tools) like `'— United States'` and submit
3. Expect server rejects; UI shows error; no row inserted

Verify:
```sql
select * from public.users where email = '<email-bad>';
```
- No row created

### E. Negative: Malformed referral
1. Add `?ref=abc123!!` then Sign Up
2. Expect backend ignores/normalizes; row created; no crash

### F. Double submit
1. Mash the submit button rapidly
2. Expect a single row; UI disables during request

DB:
```sql
select count(*) from public.users where email = '<email>';
```
- Count == 1

### G. Referral uniqueness under concurrency (optional)
1. Simulate 10 parallel signups (script) with same random generator
2. Expect backend retry on referral conflict; all rows succeed with unique 8-digit codes

## Post-conditions
- Users appear with normalized country_code
- Referral codes are numeric and unique
- Parent referral correctly attached when present
- `/api/me` hydrates from `public.users` consistently
