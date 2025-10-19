# Build Lint Report

Date: 2025-10-16
Command: `npm run build` (Next.js + Turbopack)

## Blocking Errors (must fix)
- components/RewardsView.tsx:65:49 — Error: Unexpected any. Specify a different type. (@typescript-eslint/no-explicit-any)
- components/RewardsView.tsx:278:118 — Error: `'` can be escaped with `&apos;`, `&lsquo;`, `&#39;`, `&rsquo;`. (react/no-unescaped-entities)
- lib/countryMap.ts:27:40 — Error: Unexpected any. Specify a different type. (@typescript-eslint/no-explicit-any)

## Warnings (non-blocking but recommended to address)
- app/(auth)/participate/page.tsx:14:10 — 'countryName' is assigned a value but never used. (@typescript-eslint/no-unused-vars)
- app/api/my-referral-link/route.ts:2:10 — 'supabaseServer' is defined but never used. (@typescript-eslint/no-unused-vars)
- components/BelowMap.tsx:
  - 19:8 — 'UserRow' is defined but never used. (@typescript-eslint/no-unused-vars)
  - 27:9 — 'router' is assigned a value but never used. (@typescript-eslint/no-unused-vars)
  - 71:9 — 'rewardTiers' is assigned a value but never used. (@typescript-eslint/no-unused-vars)
  - 203:6 — React Hook useEffect has missing dependencies: 'referralUrl' and 'userFullName'. (react-hooks/exhaustive-deps)
  - 236:12 — 'DashboardContent' is defined but never used. (@typescript-eslint/no-unused-vars)
  - 236:37 — 'onAuthenticated' is defined but never used. (@typescript-eslint/no-unused-vars)
  - 652:34 — 'e' is defined but never used. (@typescript-eslint/no-unused-vars)
  - 793/796/799/802: — Use of <img> instead of next/image. (@next/next/no-img-element)
- components/DashboardSheet.tsx:
  - 42:10 — 'sessionEmail' is assigned a value but never used. (@typescript-eslint/no-unused-vars)
  - 189:18, 231:17, 234:21, 380:32 — 'e' is defined but never used. (@typescript-eslint/no-unused-vars)
- components/Globe.tsx:543:25 — Unused eslint-disable directive (no problems were reported from 'no-console').
- components/GlobeRG.tsx:238:46 — React Hook useEffect missing dependency 'ensureBoatsForArcs'. (react-hooks/exhaustive-deps)
- components/ShareTiles.tsx:79:11 — Use of <img> instead of next/image. (@next/next/no-img-element)
- lib/countries.ts:1:15 — 'FeatureCollection' is defined but never used. (@typescript-eslint/no-unused-vars)

## Notes
- Only the three items under "Blocking Errors" prevent build from completing.
- Address warnings as time permits to improve code quality and performance.









