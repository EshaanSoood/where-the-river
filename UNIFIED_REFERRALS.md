# Unified Referrals System

## Overview

The **unified referrals system** consolidates all referral state into a single source of truth: the `public.users_referrals` table. This replaces the previous multi-table approach and removes dependency on cookies for referral attribution.

## Architecture

### Single Source of Truth: `users_referrals` Table

```sql
CREATE TABLE public.users_referrals (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL UNIQUE,  -- Canonical 8-char code
  referred_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- Parent edge
  boats_total int NOT NULL DEFAULT 0,  -- Total points earned
  depth_awarded int NOT NULL DEFAULT 0,  -- Unused (reserved for idempotency tracking)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Key Features

1. **One Row Per User**: Every user has exactly one row, created on first access.
2. **Canonical Referral Code**: Stored once per user, never changed.
3. **Parent Edge**: References the inviter (`referred_by_user_id`), creation-only.
4. **Boats Total**: Server-authoritative points accumulation.
5. **No Cookies**: Referral attribution is payload-first (passed in signup request body), URL-first (captured by middleware).

## Signup Flow

### 1. **Capture Referral Code** (Middleware → Client)
- Middleware captures `?ref=<CODE>` or `/r/<CODE>` and sets httpOnly cookie `river_ref_h`.
- Middleware redirects to clean URL (e.g., `/?ref=...` → `/`).
- Client reads SSR-injected `initialInviter` (resolved from cookie).
- **Result**: Visible, read-only `<input ref={inviterCode}>` in signup form.

### 2. **Send Signup OTP**
- User fills form (name, email, country, etc.).
- Form includes visible referral code field (read-only).
- Client calls `auth.signInWithOtp()` with:
  - Email
  - `shouldCreateUser: true`
  - Metadata (name, country_code, boat_color, etc.)
  - `emailRedirectTo: /auth/callback?ref=<CODE>` (preserves code through email link)

### 3. **Verify OTP**
- User clicks email link (or enters code manually).
- On verification, client calls `POST /api/users/upsert` with:
  - `email`
  - `name` (fullName)
  - `country_code`
  - `boat_color`
  - **`referred_by: <CODE>`** (payload-first attribution)

### 4. **Upsert Flow** (Server)
- `POST /api/users/upsert` executes:
  1. **Ensure referral row**: Calls `assign_users_referrals_row(user_id)`
     - Creates new row with generated code if needed
     - Returns canonical code
  2. **Validate referral code**: If `referred_by` provided, calls `getInviterByCode(code)` to resolve inviter user_id
  3. **Set parent edge**: Updates row's `referred_by_user_id` (creation-only, never overwrites)
  4. **Award points**: Calls `apply_users_ref_awards(invitee_id)`
     - Walks ancestor chain
     - Awards: 10 (direct), 5 (1° separation), 2 (2°+)
     - Updates `boats_total` for each ancestor
  5. **Mirror metadata**: Writes `referred_by: <inviter_user_id>` to auth.users.user_metadata for display
  6. **Update auth**: Calls admin.updateUserById() with all metadata

## RPCs (Remote Procedure Calls)

### `assign_users_referrals_row(p_user_id)`
- **Idempotent**: If row exists, returns existing code; otherwise creates new row.
- **Returns**: Canonical 8-character referral code.
- **Used by**: `/api/users/upsert`, `/api/me` (ensure-on-read).

### `apply_users_ref_awards(p_invitee_id)`
- **Idempotent**: Safe to call multiple times (increments boats_total).
- **Walks ancestor chain**: Starts at `referred_by_user_id`, follows parents up to 50 levels.
- **Awards by depth**:
  - Depth 1 (direct referral): +10 boats
  - Depth 2 (friend of friend): +5 boats
  - Depth 3+: +2 boats each
- **Returns**: void (no response body).

## API Endpoints

### `/api/users/upsert` (POST)
- **Body**: `{ email, name, country_code, message, boat_color, referred_by, ... }`
- **Response**: `{ user: { email, name, country_code, referral_id, ... } }`
- **Behavior**: Creation-only for parent edge; idempotent for awards.

### `/api/me` (GET)
- **Auth**: Bearer token or session cookie.
- **Returns**: `{ me: { email, name, country_code, boats_total, referral_url, ... } }`
- **Boats**: Reads from `users_referrals.boats_total`.
- **Referral URL**: Ensures code via `assign_users_referrals_row`, builds `/?ref=<CODE>`.

### `/api/referral` (POST)
- **Body**: `{ inviterId: <user_id> }`
- **Returns**: `{ referral: "https://.../?ref=<CODE>" }` or `{ pending: true }`
- **Source**: Reads from `users_referrals.referral_code`.

### `/api/globe` (GET)
- **Returns**: `{ nodes: [...], links: [...] }`
- **Nodes**: User IDs with name, country, boats total.
- **Links**: Parent → child edges from `referred_by_user_id`.
- **Source**: Reads auth.users for names, `users_referrals` for edges and boats.

### `/api/leaderboard` (GET)
- **Returns**: `{ totalBoats, top: [...] }`
- **Top 5**: Users sorted by `boats_total` (descending).
- **Source**: `users_referrals.boats_total`.

## Helpers

### `server/db/referrals.ts`
- `getReferralCodeByUserId(userId)`: Fetch code from `users_referrals`.
- `getInviterByCode(code)`: Resolve `user_id` by canonical code.
- `getParent(userId)`: Fetch `referred_by_user_id` and inviter's code.
- `ensureUserHasReferralCode(userId)`: Idempotent ensure via RPC.
- `getAncestorChain(userId, maxDepth)`: Build chain of parents.

## No-Cookie Design

### Why Avoid Cookies?
- Private browsing windows cannot store cookies.
- Safari ITP (Intelligent Tracking Prevention) caps cookie lifetime.
- Cookies are unnecessary when referral code is passed explicitly.

### Attribution Flow (No Cookies)
1. **Middleware**: Captures `?ref=` → sets HttpOnly cookie (backup only).
2. **Client**: Passes `referred_by: <CODE>` in signup payload (authoritative).
3. **Server**: Attribution is payload-first, never relies on cookie alone.
4. **Email Link**: Preserves `?ref=` in `emailRedirectTo` so code survives email hops.

### Verified Working
- ✅ Initial signup: `/?ref=CODE` → form shows code → upsert includes code.
- ✅ Email flow: User clicks link → cookie set again by middleware → code available.
- ✅ Private browsing: No cookies, but `referred_by` in payload works.
- ✅ Multi-device: User can start on phone with `?ref=`, finish on desktop (different cookie context).

## Testing

### Test Script
```bash
# Quick health check
bash .test-unified-referrals.sh
```

### Manual Live Test
1. **Create inviter**: Sign up user A (no referral code).
2. **Get code**: Call `GET /api/me` → note `referral_code`.
3. **Share link**: Create link `https://site/?ref=<CODE>`.
4. **Sign up invitee**: Visit link as user B → form shows code → verify signup.
5. **Check attribution**: Query `users_referrals` → user B has `referred_by_user_id = user A's ID`.
6. **Check points**: User A's `boats_total` should be 10.
7. **Check globe**: `GET /api/globe` → nodes include both users, link shows A→B.

### SQL Queries for Verification
```sql
-- Check all users and their parents
SELECT user_id, referral_code, referred_by_user_id, boats_total
FROM public.users_referrals
ORDER BY created_at DESC
LIMIT 10;

-- Check ancestor chains
WITH RECURSIVE ancestors AS (
  SELECT user_id, referred_by_user_id, 1 as depth
  FROM public.users_referrals
  WHERE user_id = '<INVITEE_UUID>'
  UNION ALL
  SELECT ur.user_id, ur.referred_by_user_id, ancestors.depth + 1
  FROM public.users_referrals ur
  JOIN ancestors ON ur.user_id = ancestors.referred_by_user_id
  WHERE ancestors.depth < 50
)
SELECT * FROM ancestors;
```

## Migration from Legacy

If upgrading from a legacy schema:
1. Migration `20251028_users_referrals_unified.sql` creates the new table.
2. Backfill existing users (optional; handled on first access).
3. APIs automatically read from `users_referrals`.
4. No code changes required for clients.

## Debugging

### Enable Debug Logging
```bash
DEBUG_REFERRALS=1 npm run dev
```

### Common Issues
- **"No code"**: Ensure `assign_users_referrals_row` is called before reading.
- **"No parent"**: Check `referred_by` code is valid; `getInviterByCode` must return a user.
- **"No points"**: Verify `apply_users_ref_awards` is called; check ancestor chain is not circular.

## Future Improvements
- Idempotency guard: Use `depth_awarded` to track which ancestors have already been awarded.
- Rate limiting: Add middleware to prevent rapid signup spam.
- Analytics: Track attribution sources (payload vs. cookie vs. URL).
