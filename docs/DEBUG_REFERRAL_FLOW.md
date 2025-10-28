# Debug: Referral Code Flow Tracking

## Question
"Since you saw the code in the data it is being fetched right? Like the code was present in the payload?"

## Answer
**No, the code was NOT in the payload that was sent to /api/users/upsert**

### Evidence:
1. **Database shows**: `referred_by_user_id = NULL`
   - If code was in payload → API would set this
   - It's null, so code wasn't in payload

2. **Database shows**: `boats_total = 0`
   - If referral was attributed → RPC would award points
   - It's 0, so no points awarded
   - Therefore no referral attribution happened

3. **Auth metadata shows**: NO `referred_by` field
   - If code was in payload → would be mirrored to metadata
   - It's not there, so code definitely wasn't in payload

## The Confusion
You see the code in SSR's `initialInviter.code`, but the question is:
- **Did this value make it to the form submission?**
- **Was it included in the fetch payload to /api/users/upsert?**

The answer is: **No, the code didn't make it to the payload**

## Why
React state race condition:
1. Component receives `initialInviter.code = "79434756"` from SSR ✓
2. Component state `inviterCode = ""` (empty) on initial render ✓
3. useEffect sets `inviterCode` from `initialInviter.code` (but async)
4. User fills form and submits quickly
5. BEFORE useEffect completes, code uses: `const referredByCode = inviterCode;` 
6. At this point, `inviterCode` is STILL EMPTY `""`
7. Payload sent with `referred_by: ""` (or omitted)
8. API validates and skips because empty ❌

## The Fix Applied
Changed to:
```typescript
let referredByCode = initialInviter?.code || inviterCode;
```

Now it uses the SSR value directly, no state needed.

## Testing the Fix
Create a new test account to verify:
1. Visit: `https://riverflowseshaan.vercel.app/?ref=79434756`
2. Sign up with `test@example.com`
3. In database, should see:
   - New user has `referred_by_user_id` pointing to 79434756 owner ✓
   - 79434756 owner gains +10 boats ✓

