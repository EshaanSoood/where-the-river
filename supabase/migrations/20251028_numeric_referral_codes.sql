-- Update referral code generator to use numeric-only 8-digit codes
-- This ensures new codes are easy to share verbally and read
-- Existing codes are preserved (immutable per user)
-- 2025-10-28

-- Replace the code generator to use numeric alphabet (0-9 only)
create or replace function public.generate_users_referral_code(p_len int default 8)
returns text language plpgsql as $$
declare
  alphabet text := '0123456789';  -- Numeric only: 0-9
  out_code text := '';
  i int;
begin
  -- Force length to 8 for consistency
  p_len := 8;
  for i in 1..p_len loop
    out_code := out_code || substr(alphabet, 1 + (floor(random() * length(alphabet)))::int, 1);
  end loop;
  return out_code;
end;
$$;

-- Test: Generate a few codes to verify format
-- SELECT public.generate_users_referral_code(), public.generate_users_referral_code(), public.generate_users_referral_code();
-- Should output three 8-digit numeric codes like: 45672891, 38102947, 91827456
