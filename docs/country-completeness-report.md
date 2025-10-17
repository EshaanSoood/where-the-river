# Country Completeness Report

## Sources
- UI list: `.tmp/ui-country-codes.json`
- API list: `.tmp/api-country-codes.json`
- DB list: `.tmp/db-country-codes.json`

## Counts
- UI: 250
- API: 250
- DB: 250 (seeded)

## Diffs
- UI minus DB: empty
- DB minus UI: empty
- API minus DB: empty

## Notes
- Server/API supports uppercase ISO‑2 and includes `XK` (Kosovo).
- DB `country_map` seeded with English names via upsert; existing rows preserved.

## Next Actions (Heal)
1. Seed `public.country_map` with the missing ISO‑2 codes and English labels (keep existing rows intact).
2. Re-run generation to ensure counts match and all diffs are empty.


