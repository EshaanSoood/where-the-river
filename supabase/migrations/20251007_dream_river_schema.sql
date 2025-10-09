-- Dream River schema migration
-- Safe for re-run: uses IF NOT EXISTS where possible

-- Required for gen_random_uuid()
create extension if not exists pgcrypto with schema public;

-- 1) users
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null unique,
  referral_id text not null unique,
  referred_by text null,
  city text,
  message text,
  photo_url text,
  hidden boolean default false,
  created_at timestamptz default now()
);

-- Add FK for referred_by -> users(referral_id) (unique column reference)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints tc
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name = 'users'
      and tc.constraint_name = 'users_referred_by_fkey'
  ) then
    alter table public.users
      add constraint users_referred_by_fkey
      foreign key (referred_by)
      references public.users(referral_id)
      on update cascade
      on delete set null;
  end if;
end$$;

-- 2) edges
create table if not exists public.edges (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.users(id) on delete cascade,
  child_id uuid references public.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Optional: prevent duplicate edges
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'edges_parent_child_unique'
  ) then
    create unique index edges_parent_child_unique on public.edges(parent_id, child_id);
  end if;
end$$;

-- 3) node_positions
create table if not exists public.node_positions (
  user_id uuid primary key references public.users(id) on delete cascade,
  x double precision not null,
  y double precision not null,
  updated_at timestamptz default now()
);

-- 4) listens
create table if not exists public.listens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  listened_at timestamptz default now()
);


