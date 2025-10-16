# Country Handling

- Canonical format: ISO‑2 uppercase (e.g., `IN`, `US`).
- Dropdown (sign-up): label shows the friendly name; option value is ISO‑2. Placeholder is disabled.
- Submit payload: includes `country_code` (ISO‑2). `country_name` is optional and derived server-side if not stored.
- API `/api/users/upsert`: trims input, strips punctuation, accepts ISO‑2 directly, or normalizes known labels to ISO‑2. Rejects unknown values (`400 invalid_country`).
- DB: `public.users.country_code` remains the single source of truth.
- Globe: consumes `country_code` directly to compute coordinates.
- Dashboard (`/api/me`): returns both `country_code` and a friendly `country_name` (stored or derived from mapping).
- Safeguards: DB trigger remains as a backstop; API performs first-line validation/normalization.
