-- Supabase SQL for initial tables
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique not null,
  otp_verified boolean default false,
  -- Deprecated: city no longer collected; retained for transitional backfill only
  city text,
  -- Required: ISO 3166-1 alpha-2 country code
  country_code char(2) not null,
  message text,
  photo_url text,
  referral_id text unique not null,
  referred_by text,
  boats integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null,
  invitee_id uuid not null,
  created_at timestamp with time zone default now()
);

-- Recommended indices
create index if not exists idx_users_referral_id on public.users(referral_id);
create index if not exists idx_users_referred_by on public.users(referred_by);
create index if not exists idx_users_country_code on public.users(country_code);

create table if not exists public.leaderboard (
  user_id uuid primary key,
  largest_river integer default 0,
  longest_river integer default 0,
  fastest_river integer default 0,
  rank_type text check (rank_type in ('largest','longest','fastest')),
  updated_at timestamp with time zone default now()
);


