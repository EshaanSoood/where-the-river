# Country Handling Test Results (ISO‑2 End‑to‑End)

Date: 2025‑10‑16
Environment: Production — `https://riverflowseshaan.vercel.app`

## Scope
Verify that sign‑up writes ISO‑2 `country_code`, referral flow remains intact, globe consumers can rely on ISO‑2, and dashboard can derive friendly names.

## Test Users (auto‑generated emails)
- NoRef: `noref-20251016012037@example.com`
- Parent: `parent-20251016012053@example.com`
- Child: `child-20251016012101@example.com`

## Requests & Responses

1) Sign Up — NoRef (India)
```
POST /api/users/upsert
{ name: "NoRef Test", email: "noref-20251016012037@example.com", country_code: "IN", referral_id: "51739264" }
→ 200 OK
{ user: { email: "…12037@example.com", country_code: "IN", referral_id: "51739264", otp_verified: true, … } }
```

2) Sign Up — Parent (United States)
- Attempt 1: referral conflict (expected with fixed code)
```
{ name: "Parent Test", email: "parent-<ts>@example.com", country_code: "US", referral_id: "82347653" }
→ 400 { error: "duplicate key value violates unique constraint \"users_referral_id_key\"" }
```
- Attempt 2: retry with random 8‑digit
```
{ name: "Parent Test", email: "parent-20251016012053@example.com", country_code: "US", referral_id: "48672875" }
→ 200 OK
{ user: { email: "…12053@example.com", country_code: "US", referral_id: "48672875", otp_verified: true, … } }
```

3) Sign Up — Child (United Kingdom), referring parent
```
{ name: "Child Test", email: "child-20251016012101@example.com", country_code: "GB", referral_id: "73949517", referred_by: "48672875" }
→ 200 OK
{ user: { email: "…12101@example.com", country_code: "GB", referral_id: "73949517", referred_by: "48672875", otp_verified: true, … } }
```

## Findings
- ISO‑2 writes succeed (`IN`, `US`, `GB`).
- Referral uniqueness enforced; retry with a new 8‑digit code works.
- Parent/child linkage via `referred_by` is intact.

## Quick DB Verification
```sql
-- NoRef
select email, country_code from public.users where email='noref-20251016012037@example.com';
-- Parent
select email, country_code, referral_id from public.users where email='parent-20251016012053@example.com';
-- Child
select email, country_code, referral_id, referred_by from public.users where email='child-20251016012101@example.com';
```

## Notes
- The globe already consumes ISO‑2; with these results, nodes will map correctly.
- Dashboard can derive friendly names from ISO‑2 using the shared mapping.
