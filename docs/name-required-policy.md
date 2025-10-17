# Name Required Policy

## Rule
- A human-readable name is required for account creation and profile updates.
- Email must never be used as a visual stand‑in for name.

## Client Validation
- Controlled fields for first and last name.
- Sanitization: trim, collapse whitespace, cap to 80 characters, require at least one letter or digit.
- Submit disabled until combined name length ≥ 2. Inline error prevents requests when invalid.

## Server Validation
- `/api/users/upsert`: hard gate. Rejects with `400 { error: "invalid_name" }` if invalid; logs a temporary warning for QA.
- Persist `name` on first write.

## Dashboard Behavior
- Primary display uses `name`. Email is never shown as a fallback.
- For legacy rows with missing name, `/api/me` includes `needs_name: true` and the UI shows a small, non‑blocking prompt asking the user to add their name.

## No Schema Changes
- Referral and auth flows are unaffected.


