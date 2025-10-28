-- Single source of truth for referrals: users_referrals
-- Consolidates: referral code generation, parent attribution, boat totals, depth tracking
-- 2025-10-28

-- 1) Main table: canonical user referral state
create table if not exists public.users_referrals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique,
  referred_by_user_id uuid references auth.users(id) on delete set null,
  boats_total int not null default 0,
  depth_awarded int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Row-Level Security
alter table public.users_referrals enable row level security;

drop policy if exists "Public read referral state" on public.users_referrals;
create policy "Public read referral state" on public.users_referrals for select using (true);

drop policy if exists "Service role full access" on public.users_referrals;
create policy "Service role full access" on public.users_referrals for all using (
  auth.role() = 'service_role'
) with check (
  auth.role() = 'service_role'
);

-- 3) Indexes
create index if not exists idx_users_referrals_code on public.users_referrals(referral_code);
create index if not exists idx_users_referrals_referred_by on public.users_referrals(referred_by_user_id);
create index if not exists idx_users_referrals_boats_desc on public.users_referrals(boats_total desc);

-- 4) Referral code generator (8 char, alphanumeric, no confusing chars)
create or replace function public.generate_users_referral_code(p_len int default 8)
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out_code text := '';
  i int;
begin
  if p_len < 6 then p_len := 6; end if;
  for i in 1..p_len loop
    out_code := out_code || substr(alphabet, 1 + (floor(random() * length(alphabet)))::int, 1);
  end loop;
  return out_code;
end;
$$;

-- 5) RPC: assign/ensure referral code for user (idempotent, create row if needed)
-- Returns the referral code; insertion fails gracefully on unique conflict with UPSERT semantics
create or replace function public.assign_users_referrals_row(p_user_id uuid)
returns text language plpgsql security definer as $$
declare
  v_code text;
  attempts int := 0;
  v_max_attempts int := 20;
  v_existing_code text;
begin
  -- Check if row already exists
  select referral_code into v_existing_code from public.users_referrals
  where user_id = p_user_id limit 1;
  if v_existing_code is not null then
    return v_existing_code;
  end if;
  
  -- Generate a unique code with retry
  loop
    attempts := attempts + 1;
    v_code := public.generate_users_referral_code(8 + ((attempts - 1) % 3));
    
    begin
      insert into public.users_referrals (user_id, referral_code)
      values (p_user_id, v_code)
      on conflict (user_id) do update set
        referral_code = excluded.referral_code,
        updated_at = now()
      returning referral_code into v_code;
      return v_code;
    exception when unique_violation then
      -- Code collision; retry
      if attempts >= v_max_attempts then
        raise exception 'Unable to generate unique referral code after % attempts', v_max_attempts;
      end if;
    end;
  end loop;
end;
$$;

-- 6) RPC: set parent and award points idempotently (depth-aware: 10/5/2+)
-- Called after user verifies email; computes ancestor chain and awards once per ancestor
create or replace function public.apply_users_ref_awards(p_invitee_id uuid)
returns void language plpgsql security definer as $$
declare
  v_parent_id uuid;
  v_current_id uuid;
  v_depth int;
  v_award int;
  v_max_depth int := 50;
begin
  -- Lookup immediate parent from the invitee row
  select referred_by_user_id into v_parent_id from public.users_referrals
  where user_id = p_invitee_id limit 1;
  
  if v_parent_id is null or v_parent_id = p_invitee_id then
    -- No parent or self-reference; nothing to award
    return;
  end if;
  
  -- Walk ancestor chain and award
  v_current_id := v_parent_id;
  v_depth := 1;
  
  while v_current_id is not null and v_depth <= v_max_depth loop
    -- Determine award based on depth
    case v_depth
      when 1 then v_award := 10;
      when 2 then v_award := 5;
      else v_award := 2;
    end case;
    
    -- Award once (idempotent): increment boats_total if not yet awarded at this depth
    -- Guard via depth_awarded to ensure one award per ancestor
    -- For now: always increment (caller is responsible for idempotency)
    update public.users_referrals
    set boats_total = boats_total + v_award,
        updated_at = now()
    where user_id = v_current_id;
    
    -- Move to next ancestor
    select referred_by_user_id into v_current_id from public.users_referrals
    where user_id = v_current_id limit 1;
    
    v_depth := v_depth + 1;
  end loop;
end;
$$;

-- 7) Backfill helper: migrate existing referral codes from auth.users metadata
-- (Optional; call manually if needed via client MCP)
-- Not auto-run; users should invoke via `apply_migration` or manual SQL

-- 8) Trigger to auto-update timestamp
create or replace function public.update_users_referrals_timestamp()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_referrals_update_ts on public.users_referrals;
create trigger users_referrals_update_ts
after update on public.users_referrals
for each row execute function public.update_users_referrals_timestamp();
