-- Profiles, referral awards, RLS, RPC finalize_join, and trigger
-- Safe to run multiple times where possible (IF NOT EXISTS guards)

create extension if not exists pgcrypto with schema public;

-- DEPRECATED: public.profiles (removed)

create index if not exists idx_profiles_parent on public.profiles(parent_user_id);
create index if not exists idx_profiles_country on public.profiles(country_code);
create index if not exists idx_profiles_boats_total_desc on public.profiles(boats_total desc);

-- Referral code generator (8-10 char, human-safe)
create or replace function public.generate_referral_code(p_len int default 8)
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no easily-confused chars
  out_code text := '';
  i int;
begin
  if p_len < 6 then p_len := 6; end if;
  for i in 1..p_len loop
    out_code := out_code || substr(alphabet, 1 + (floor(random()*length(alphabet)))::int, 1);
  end loop;
  return out_code;
end;
$$;

create or replace function public.set_referral_code_if_null() returns trigger as $$
declare
  attempts int := 0;
  code text;
  exists_code int;
begin
  if coalesce(new.referral_code, '') <> '' then
    return new;
  end if;
  loop
    attempts := attempts + 1;
    code := public.generate_referral_code(8 + (attempts % 3));
    select 1 into exists_code from public.profiles where referral_code = code limit 1;
    if not found then
      new.referral_code := code;
      return new;
    end if;
    if attempts > 20 then
      raise exception 'Unable to generate unique referral code';
    end if;
  end loop;
end; $$ language plpgsql;

-- DEPRECATED triggers for profiles (removed)

create or replace function public.prevent_referral_code_change() returns trigger as $$
begin
  if old.referral_code is not null and new.referral_code is distinct from old.referral_code then
    raise exception 'referral_code cannot be changed once set';
  end if;
  return new;
end; $$ language plpgsql;

-- DEPRECATED trigger (removed)

-- Backfill missing referral codes
-- DEPRECATED backfill block (removed)

-- Prevent re-parenting once joined
create or replace function public.prevent_reparent_after_join() returns trigger as $$
begin
  if (old.joined_at is not null) and (new.parent_user_id is distinct from old.parent_user_id) then
    raise exception 'Cannot change parent after join is finalized';
  end if;
  return new;
end; $$ language plpgsql;

-- DEPRECATED trigger (removed)

-- 3) Referral awards audit
create table if not exists public.referral_awards (
  id uuid primary key default gen_random_uuid(),
  ancestor_user_id uuid not null references public.profiles(user_id) on delete cascade,
  joiner_user_id uuid not null references public.profiles(user_id) on delete cascade,
  depth int not null check (depth >= 1),
  boats_awarded int not null,
  created_at timestamptz not null default now(),
  constraint unique_award_per_pair unique (ancestor_user_id, joiner_user_id)
);

-- 4) Row-Level Security
-- Keep referral_awards for now; profiles removed
alter table public.referral_awards enable row level security;

-- Helper claim for service role
create or replace function public.is_service_role() returns boolean as $$
begin
  return current_setting('request.jwt.claims', true)::jsonb ? 'role' and
         (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
exception when others then
  return false;
end; $$ language plpgsql stable;

-- Profiles policies
-- Remove any overly-permissive public select; rely on self-select and public views
-- DEPRECATED profiles policies (removed)

-- Restrict columns for public selection via a view; direct table still protected by column usage in app

-- (removed)

-- (removed)

-- (removed)

-- Service role unrestricted changes
-- (removed)

-- referral_awards policies
drop policy if exists awards_public_read on public.referral_awards;
create policy awards_public_read on public.referral_awards for select using (true);

drop policy if exists awards_service_all on public.referral_awards;
create policy awards_service_all on public.referral_awards for all using (public.is_service_role()) with check (public.is_service_role());

-- Public safe view for leaderboard
-- DEPRECATED view leaderboard_public (removed)
drop view if exists public.leaderboard_public;

-- 5) RPC finalize_join
create or replace function public.finalize_join(p_joiner uuid)
returns void
language plpgsql
security definer
as $$
declare
  -- v_joiner type updated if finalize_join is kept; consider removal if unused
  v_current uuid;
  v_depth int := 0;
  v_award int := 0;
  v_ancestor public.profiles%rowtype;
  v_max_depth int := 50;
begin
  -- only service role
  if not public.is_service_role() then
    raise exception 'service role required';
  end if;

  raise exception 'finalize_join deprecated: profiles removed';
  if not found then
    raise exception 'joiner profile not found';
  end if;

  -- deprecated body

  -- deprecated traversal
  while v_current is not null and v_depth < v_max_depth loop
    v_depth := v_depth + 1;

    if v_depth = 1 then v_award := 10;
    elsif v_depth = 2 then v_award := 5;
    else v_award := 1;
    end if;

    -- Lock ancestor row for update
    select * into v_ancestor from public.profiles where user_id = v_current for update;
    if not found then exit; end if;

    -- Insert audit, skip if already exists
    begin
      insert into public.referral_awards(ancestor_user_id, joiner_user_id, depth, boats_awarded)
      values (v_ancestor.user_id, v_joiner.user_id, v_depth, v_award);
    exception when unique_violation then
      -- already awarded for this pair; do nothing
    end;

    -- Update ancestor boat counts (idempotent by checking audit existence)
    if exists (select 1 from public.referral_awards where ancestor_user_id = v_ancestor.user_id and joiner_user_id = v_joiner.user_id) then
      if v_depth = 1 then
        update public.profiles set boats_direct = boats_direct + v_award, boats_total = boats_total + v_award where user_id = v_ancestor.user_id;
      elsif v_depth = 2 then
        update public.profiles set boats_grand = boats_grand + v_award, boats_total = boats_total + v_award where user_id = v_ancestor.user_id;
      else
        update public.profiles set boats_deep = boats_deep + v_award, boats_total = boats_total + v_award where user_id = v_ancestor.user_id;
      end if;
    end if;

    -- Next ancestor
    select parent_user_id into v_current from public.profiles where user_id = v_current;
  end loop;
end;
$$;

-- 5b) Trigger to auto-finalize on joined_at set
create or replace function public.call_finalize_join() returns trigger as $$
begin
  if (old.joined_at is null and new.joined_at is not null) then
    perform public.finalize_join(new.user_id);
  end if;
  return new;
end; $$ language plpgsql;

-- DEPRECATED trigger (removed)



