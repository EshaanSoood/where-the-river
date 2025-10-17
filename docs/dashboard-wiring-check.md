# Dashboard Wiring Check — Countries, Name, Boat Color

## Country dropdown (sign-up)
- Source: `lib/countryList.ts` via `getIsoCountries('en')` returning all ISO‑2 codes from `countryCentroids` with friendly names (Intl.DisplayNames fallback safe).
- UI: `app/(auth)/participate/page.tsx` renders `<option value=ISO2>{name}</option>`; placeholder `Select your country` is disabled and not submittable.
- Quick check list includes US, IN, GB, DE, BR, JP, AU, ZA, CA, MX.

## API and fields used by dashboard
- Endpoint: `app/api/me/route.ts` returns `{ name, country_code, country_name, message, boat_color, ref_code_8, boats_total }`.
- Country name is derived server‑side via `lib/countryMap.getCountryNameFromCode(country_code)`; inputs sanitized with `normalizeInput` in upsert.

## UI bindings
- Display name: `components/BelowMap.tsx` uses `userProfile.name` (falls back to email only if name is truly missing).
- Country: `resolvedCountryName` prefers `userProfile.country_name`; falls back to `getCountryNameFromCode(country_code)`; if invalid/missing → "Country not set".
- Boat color: `userProfile.boat_color` applied to the boat glyph; default `#135E66` only if null.

## Persistence paths
- Sign‑up `participate/page.tsx` includes `{ name, email, country_code, message, boat_color }` in POST `/api/users/upsert`.
- Server `app/api/users/upsert/route.ts` normalizes ISO‑2, strips Unicode punctuation, and writes `boat_color` alongside canonical fields.

## Evidence
- Console capture recommended: verify request body contains `country_code: "IN"`, `name: "Test User"`, `boat_color: "#xxxxxx"`.
- Dashboard response contains `country_name: "India"` and `boat_color`.


