# Country & Referrals

## Country (ISO‑2 canonical)
- Canonical DB field: `public.users.country_code` (ISO‑2 uppercase, e.g., `IN`, `US`).
- Sign-up dropdown: label is friendly country name; value is ISO‑2. Placeholder is disabled.
- API `/api/users/upsert`:
  - Trims input, strips punctuation, accepts ISO‑2; if a label arrives, normalizes to ISO‑2; else returns `400 invalid_country`.
  - Persists ISO‑2 to `public.users.country_code`.
- Dashboard `/api/me`:
  - Returns both `country_code` and derived `country_name` via `lib/countryMap#getCountryNameFromCode`.
- Globe:
  - Uses ISO‑2 to fetch centroids; no change needed.

## Referrals (server authoritative)
- The server generates an 8‑digit numeric `referral_id` on sign-up.
- If insert hits the unique constraint, the server auto‑retries with a new code (up to 5 attempts).
- Client‑supplied `referral_id` is ignored.
- `referred_by` (parent's code) from the client is still accepted and stored.

## Acceptance
- New sign-ups never surface referral collisions; server handles retries.
- Globe continues to plot from ISO‑2.
- Dashboard shows friendly name consistently without storing duplicates.
- Inputs remain strict and normalized.
