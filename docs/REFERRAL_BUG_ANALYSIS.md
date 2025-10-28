# Referral Attribution Bug - Root Cause Analysis

## Issue
When a user signs up with `?ref=79434756`, the referral code is NOT attributed to their account, even though the code is valid.

## Root Cause
The `inviterCode` state in BelowMap component is empty when the user verifies the OTP code, because:

1. User visits: `https://riverflowseshaan.vercel.app/?ref=79434756`
2. SSR resolves inviter and passes `initialInviter.code = "79434756"` to BelowMap
3. Component renders with `inviterCode = ""` (initial state)
4. useEffect on line 89 should set `inviterCode = "79434756"`
5. **BUT** - there's a race condition or timing issue where the state might not be set when user submits form

Additionally, the signup form's `onKeyDown` handler at line 888 uses the current `inviterCode` value:
```typescript
const referredByCode = inviterCode;  // Line 899
```

If `inviterCode` state hasn't been updated yet, it will be empty string.

## Why Manual Fix Worked
When I manually set `referred_by_user_id` in the database and called `apply_users_ref_awards`, the system worked perfectly:
- Parent (79434756 owner) received 10 boats
- Child account was linked to parent
- System is functioning correctly once the edge is set

## Solution Options

### Option 1: Use SSR Context (Recommended)
Instead of relying on state, use the `initialInviter` prop directly during submission:
```typescript
const referredByCode = initialInviter?.code || inviterCode;
```

### Option 2: Read from Cookies
The middleware sets cookies `river_ref` and `river_ref_h` when `?ref` is detected.
Use these cookies as fallback source of truth.

### Option 3: Read from URL Parameters
Don't rely on state at all - read directly from `window.location.search` at submission time:
```typescript
const u = new URL(window.location.href);
const refFromUrl = u.searchParams.get('ref');
const referredByCode = refFromUrl || inviterCode;
```

## Testing
To verify the fix works:
1. Visit: `https://riverflowseshaan.vercel.app/?ref=79434756`
2. Sign up with new email
3. Verify OTP code in form
4. Check database: `referred_by_user_id` should point to owner of 79434756
5. Check parent account: should have +10 boats

## Code Locations
- Client signup form: `/web/components/BelowMap.tsx` (lines 888-935)
- Middleware ref capture: `/web/middleware.ts` (lines 40-70)
- SSR inviter resolution: `/web/server/referral/resolveInviter.ts` (lines 75-98)
- API upsert: `/web/app/api/users/upsert/route.ts` (lines 35-43, 89-95)
