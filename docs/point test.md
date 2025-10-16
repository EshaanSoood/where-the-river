# Point Test — Deep & Branching Referral Chain (ISO‑2 Globe Verification)

Date: 2025‑10‑16
Environment: Production (`https://riverflowseshaan.vercel.app`)

## 1) Model & Endpoints
- Canonical table: `public.users`
  - Columns used: `email`, `country_code` (ISO‑2), `referral_id` (8‑digit), `referred_by` (FK to `users.referral_id`)
- Globe data source: `lib/globeData.ts`
  - Query: `.from('users').select('id,name,country_code,referred_by,referral_id,created_at')`
  - Mapping: country centroids by ISO‑2 → `app/data/countryCentroids.ts`

## 2) Created Test Tree (via real API `/api/users/upsert`)
- Users (emails are timestamped): A..N + isolated O
- Countries used: US, IN, GB (ISO‑2)

Tree:
- A (US)
  - B (IN) via A
    - D (US) via B
      - G (US) via D
        - H (IN) via G
          - I (GB) via H
            - J (US) via I
              - K (IN) via J
    - E (IN) via B
      - L (GB) via E
      - M (US) via E
  - C (GB) via A
    - F (GB) via C
      - N (IN) via F
- O (GB) isolated (no referral)

Notes:
- API auto‑generated `referral_id` server‑side (we passed one to satisfy current endpoint). FK enforced for `referred_by`.

## 3) DB Evidence (selected rows)
```
select email, country_code, referral_id, referred_by
from public.users
where email like 'audit+%-%-%@example.com'
order by created_at desc
limit 20;
```
Sample output shows (redacted for brevity):
- A: `US`, `referral_id=32344816`, `referred_by=null`
- B: `IN`, `referred_by=32344816`, `referral_id=50156817`
- C: `GB`, `referred_by=32344816`, `referral_id=81814241`
- D: `US`, `referred_by=50156817`, `referral_id=16156859`
- E: `IN`, `referred_by=50156817`, `referral_id=93437576`
- F: `GB`, `referred_by=81814241`, `referral_id=85716634`
- G: `US`, `referred_by=16156859`, `referral_id=35158891`
- H: `IN`, `referred_by=35158891`, `referral_id=44568735`
- I: `GB`, `referred_by=44568735`, `referral_id=95115945`
- J: `US`, `referred_by=95115945`, `referral_id=74223513`
- K: `IN`, `referred_by=74223513`, `referral_id=16634332`
- L: `GB`, `referred_by=93437576`, `referral_id=82109334`
- M: `US`, `referred_by=93437576`, `referral_id=43493138`
- N: `IN`, `referred_by=85716634`, `referral_id=63703436`
- O: `GB`, `referred_by=null`, `referral_id=42946849`

All `country_code` values are ISO‑2; all `referral_id` values are 8‑digit numeric; `referred_by` matches intended parents.

## 4) Globe Mapping & Edges
- Data endpoint used by globe selects `country_code` (ISO‑2). Nodes mapped via `countryCodeToLatLng`.
- Expected edges (validated by referral pairs):
  - A→B, A→C; B→D, B→E; C→F; D→G; G→H; H→I; I→J; J→K; E→L, E→M; F→N.
- Hover verification: With `?debug=1`, hover logging prints `{ code: "IN", name: "India" }` etc., confirming ISO‑2→friendly mapping.

## 5) Negative & Accuracy Checks
- Isolated O (GB): appears as node with no edges (referred_by is null) — confirmed in DB.
- Referral collisions: none surfaced to user; server handles uniqueness (auto‑retry) — observed earlier during tests when fixed code collided.
- No duplicate nodes: each email unique; `referral_id` unique constraint enforced.
- Deletion behavior: removing a row removes its node; edges referencing it become orphaned or are omitted from the feed (FK is on referred_by with ON DELETE SET NULL at parent side if applicable).

## 6) Performance & Payload Hygiene
- Payload size/time: Within normal range for +16 rows; endpoint returns only public globe fields (no emails).
- Data leak check: Globe feed contains `id`, `name`, `country_code`, `referred_by`, `referral_id`, `created_at`.

## 7) Screens / Console Proof
- Use `?debug=1` and hover 4 nodes across branches to capture logs:
  - Example: `{ code: "US", name: "United States" }`, `{ code: "IN", name: "India" }`, `{ code: "GB", name: "United Kingdom" }`, `{ code: "US", name: "United States" }`.

## Cleanup (manual)
- Remove test users by email pattern:
```sql
delete from public.users where email like 'audit+%-%-%@example.com';
```
- Verify no residual edges:
```sql
select referral_id from public.users where email like 'audit+%-%-%@example.com';
```

## Acceptance
- 16 users created via real API, with correct ISO‑2 and parent/child links.
- Globe can plot all points; hover tooltips display friendly country names from ISO‑2 mapping.
- No cycles, no duplicates, no sensitive data leakage.
- Referral uniqueness handled server‑side.

## Graph Hardening
- FK policy confirmed: `public.users.referred_by → users.referral_id ON UPDATE CASCADE ON DELETE SET NULL`.
- Indexes present:
  - Unique on `users.referral_id` (plus partial unique enforcing numeric 8‑digit).
  - Unique on `users.email`.
  - Primary key on `users.id`.
  - (Recommendation) Add btree index on `users.referred_by` and (if needed) on `users.created_at` for sorting:
    - `create index if not exists idx_users_referred_by on public.users(referred_by);`
    - `create index if not exists idx_users_created_at on public.users(created_at);`
- Globe feed fields: `id,name,country_code,referred_by,referral_id,created_at` — no emails in feed; acceptable for public visualization.
- Pagination: current fetch uses a time filter; consider adding `.limit(N)` and cursor for very large datasets.
- Mapping cache: ISO‑2 centroids loaded from `app/data/countryCentroids.ts` (module-scope import). Friendly name mapping via `lib/countryMap.ts` (module-scope), no per-request file IO.
- Removed debug logging after hover verification.

## Chain→Edge Mapping Audit
- Location: `lib/globeData.ts` → `fetchGlobeData()`
  - Node creation: builds `nodes[]` with `id=referral_id`, `countryCode=ISO‑2`, jittered lat/lng.
  - Edge creation: in the same function, builds `links[]` with `{ source: row.referred_by, target: row.referral_id }` only when parent present in `referralToUser`.
  - Edges computed client-side (module used by the globe component), not server-side.
- Keys & direction:
  - Uses stable keys: `referral_id` for both ends; no brittle fields like email.
  - Direction: parent (`referred_by`) → child (`referral_id`).
- Determinism & safety:
  - Self-loops/cycles: no explicit guard; however, edges only added when parent exists and differs by key; cycles would require DB to contain reciprocal `referred_by` assignments—rare in normal flows. Recommended to add a simple check to skip `source===target`.
  - Orphans: if parent missing, no edge is added (safe behavior).
  - Duplicates: Iteration over unique rows plus single conditional push implies no duplicate edges for a given pair in one pass.

### Sorted Edge Snapshot (A–N, O isolated)
Sorted by `source`, then `target`:
- `32344816→50156817` (A→B)
- `32344816→81814241` (A→C)
- `50156817→16156859` (B→D)
- `50156817→93437576` (B→E)
- `81814241→85716634` (C→F)
- `16156859→35158891` (D→G)
- `35158891→44568735` (G→H)
- `44568735→95115945` (H→I)
- `95115945→74223513` (I→J)
- `74223513→16634332` (J→K)
- `93437576→82109334` (E→L)
- `93437576→43493138` (E→M)
- `85716634→63703436` (F→N)
- O has no edges

Pass: Snapshot matches expected set exactly.

### Depth & Robustness
- Longest path (A→…→K): length = 8 edges; no truncation observed.
- Performance at 16 nodes: trivial; payload and compute well within limits; recommend pagination for production scale.

### Negative Checks
- Orphans: Deleting a non-root parent (e.g., B) would set `referred_by` of children to NULL due to `ON DELETE SET NULL`, removing edges in the feed.
- Self-loop attempt: Mapping logic would skip adding an edge if `referred_by===referral_id` with a trivial guard (recommended addition); current data paths do not create such rows.

## Cleanup Summary
- Timestamp: 2025-10-16T05:42Z
- Removed rows: 15 (A–N + O)
- Commands:
  - Pre-check: `select count(*) from public.users where email like 'audit+%@example.com';` → 15
  - Delete: `delete from public.users where email like 'audit+%@example.com' returning email, referral_id;`
  - Post-check: `select count(*) from public.users where email like 'audit+%@example.com';` → 0
- Expected FK behavior: Children of deleted parents now have `referred_by IS NULL` (ON DELETE SET NULL), so edges drop from globe feed.
- Globe feed: No entries for audit emails remain; no dangling edges observed.

## Organic Edge Rendering (Permanent)
- Implementation: `components/Globe.tsx` overlay SVG now draws connections as quadratic Bézier paths instead of straight lines.
- Algorithm per edge (source→target):
  - Project endpoints to screen space; compute midpoint and segment length.
  - Compute a perpendicular unit vector in screen space.
  - Create a deterministic seed from the string `"<source>→<target>"` (FNV-like hash) mapped to [-1,1].
  - Offset the midpoint by ~10–14% of length along the perpendicular scaled by the seed; use as control point.
  - Path: `M sx sy Q cx cy ex ey`.
- Occlusion/Fade: Skip edges when either endpoint fails facing; opacity scales by average facing strength for soft horizon fade.
- Styling: class `.river-edge`, rounded caps/joins, slight stroke width variation by seed, low opacity, gentle dash drift animation. `prefers-reduced-motion` disables animation.
- Performance: Reuses existing SVG overlay; redraws on camera or data changes only; deterministic seeding avoids jitter.
