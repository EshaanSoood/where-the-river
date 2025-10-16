# Globe Hover Verification (ISO‑2 → Friendly Name)

- Component path: `components/Globe.tsx`
- Data source: `lib/globeData.ts` returns nodes with `countryCode` (ISO‑2)
- Mapping helper: `lib/countryMap.ts#getCountryNameFromCode`

## Check performed
- Added a temporary console log in `Globe.tsx` on node hover when `?debug=1` is present:
  - Logs `{ code: n.countryCode, name: getCountryNameFromCode(n.countryCode) }`

## Evidence
- Hovering a node representing India with `?debug=1` produced a console entry like:
```
{ code: "IN", name: "India" }
```
- Tooltips continue to show friendly country names; no visual/layout changes were made.

## Notes
- Remove the debug log after validation.
