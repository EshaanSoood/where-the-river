# Numeric-Only Referral Codes Update

## Change Made (2025-10-28)

Updated the referral code generator to produce **numeric-only 8-digit codes** instead of alphanumeric.

### Why?
- **Easier to share verbally**: No confusion between I/1, O/0, etc.
- **Simpler UX**: Users can read codes aloud ("five three two one four six seven eight")
- **Better for accessibility**: Numeric-only is clearer
- **Dashboard share button**: Works perfectly with numeric codes

### What Changed

**Migration**: `20251028_numeric_referral_codes.sql`

Updated `generate_users_referral_code()` function:
- **Before**: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (alphanumeric, no confusing chars)
- **After**: `0123456789` (numeric only, 8 digits)

### Format

New codes: `12345678`, `45672891`, `87654321`
- Range: 00000000 to 99999999
- Collision probability: ~1 in 100 million for first few thousand
- Length: Always 8 digits

### Backward Compatibility

✅ Existing codes are **preserved** (immutable per user)
- Old alphanumeric codes continue to work
- Only new codes generated will be numeric

### Dashboard Integration

✅ Already working correctly:
1. User signs up → code generated via RPC → stored in `users_referrals`
2. Dashboard calls `GET /api/me` → retrieves `referral_url` from database
3. Share button shows URL like `https://site.com/?ref=12345678`
4. Recipients can join with the numeric code

### Testing

Generate test codes:
```sql
SELECT public.generate_users_referral_code() FROM generate_series(1, 5);
```

Expected output: 5 random 8-digit numbers like:
- 45672891
- 38102947
- 91827456
- 12340567
- 99887766

### Data Flow

```
1. New user signs up
   ↓
2. POST /api/users/upsert called
   ↓
3. Server calls RPC assign_users_referrals_row(user_id)
   ↓
4. RPC generates 8-digit numeric code via generate_users_referral_code()
   ↓
5. Stores in users_referrals.referral_code (UNIQUE constraint)
   ↓
6. Dashboard calls GET /api/me
   ↓
7. API reads referral_code from users_referrals
   ↓
8. Returns referral_url: "https://site.com/?ref=12345678"
   ↓
9. Share button displays and uses this URL
```

### No Further Action Needed

✅ Code updated in Supabase
✅ Dashboard already configured correctly
✅ New user signups will get numeric codes
✅ Existing signups unaffected

The system is ready to use!
