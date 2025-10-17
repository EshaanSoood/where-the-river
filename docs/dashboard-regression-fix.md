# Dashboard Regression Fix — Name Banner, Bindings, Color, Layout

## What broke
- Banner “Please add your name” appeared even when `name` existed.
- Display bindings for name/country felt off; boat color sometimes didn’t render.
- Minor layout misalignments.

## API verification
- `/api/me` returns: `name`, `country_code`, derived `country_name`, `boat_color`, `ref_code_8`, `boats_total`.
- Removed legacy `needs_name` flag from the response.

## Fixes
- Banner condition: render only when `profileLoaded && (!userProfile?.name || userProfile.name.trim().length === 0)`.
- Display name: bind to `userProfile.name` only; no email fallback.
- Country: render `resolvedCountryName` (server `country_name` → fallback mapping via `getCountryNameFromCode`), never “—”.
- Boat color: SVG uses `fill={userProfile?.boat_color || '#135E66'}`; default applied when null.
- Data flow: fetch `/api/me` after auth ready; added `profileLoaded` guard to avoid flash-before-data.
- Layout: header title pill vertical rhythm fixed; side panels top-aligned with globe.

## Safari note
- Tested in Safari (private): no storage or mixed module errors observed. If stale assets appear, clear cache and bypass service worker.

## Expected result
- Banner never shows when `name` is present.
- Dashboard shows `name`, friendly `country_name`, and chosen `boat_color`.
- Layout spacing and stacking as designed.

