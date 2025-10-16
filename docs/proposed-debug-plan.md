# Proposed Debug Plan (DB‑only, no app code changes)

Goal: Unblock production sign‑ups immediately and make `country_code` writes reliable, without modifying application code.

## A) Unblock Sign‑Ups (missing column)

Problem: `/api/users/upsert` writes `boat_color`; production `public.users` lacks this column → HTTP 400.

Action (run in Supabase SQL editor):
```sql
alter table public.users
add column if not exists boat_color text null;
-- optional nudge for schema cache
select 1;
```
Result: Upsert route stays unchanged; requests succeed again.

## B) Country Reliability (two DB‑only options)

### Option 1 — Normalize with mapping table (recommended)
1) Create mapping table once (ISO‑2 → label):
```sql
create table if not exists public.country_map (
  iso2 char(2) primary key,
  label text not null
);
-- seed examples; paste your full list later
insert into public.country_map(iso2, label) values
('US','United States'),
('IN','India'),
('GB','United Kingdom')
on conflict (iso2) do nothing;
create index if not exists idx_country_map_label on public.country_map (lower(label));
```
2) Normalizer function + trigger on `public.users`:
```sql
create or replace function public.normalize_country_code(p_in text)
returns char(2) language plpgsql immutable as $$
declare p text := coalesce(p_in, '');
declare cleaned text;
declare out_iso char(2);
begin
  cleaned := trim(replace(p, E'\u2014',''));
  if length(cleaned) = 2 then
    return upper(cleaned)::char(2);
  end if;
  select iso2 into out_iso
  from public.country_map
  where lower(label) = lower(cleaned)
  limit 1;
  if out_iso is not null then return out_iso; end if;
  return null; -- on unknown inputs, don’t write bad values
end;
$$;

create or replace function public.users_before_ins_upd_norm()
returns trigger language plpgsql as $$
begin
  new.country_code := public.normalize_country_code(new.country_code);
  return new;
end;
$$;

drop trigger if exists trg_users_norm_country on public.users;
create trigger trg_users_norm_country
before insert or update on public.users
for each row execute function public.users_before_ins_upd_norm();
```

### Option 2 — Quick guard (no mapping table)
```sql
create or replace function public.users_before_ins_upd_norm()
returns trigger language plpgsql as $$
declare cleaned text := trim(replace(coalesce(new.country_code,''), E'\u2014',''));
begin
  if length(cleaned) = 2 then
    new.country_code := upper(cleaned);
  else
    new.country_code := null; -- keeps data honest; UI will show "—"
  end if;
  return new;
end;
$$;

drop trigger if exists trg_users_norm_country on public.users;
create trigger trg_users_norm_country
before insert or update on public.users
for each row execute function public.users_before_ins_upd_norm();
```

## C) (Optional) Referral Uniqueness Hardening
- If current traffic risks collisions, add a unique index on numeric 8‑digit codes only:
```sql
create unique index if not exists users_referral_id_num_uq
on public.users(referral_id)
where referral_id ~ '^[0-9]{8}$';
```

## D) Re‑Test Steps (prod)
1) Retry Sign‑Up (no referral): ensure `/api/users/upsert` returns 200; row appears in `public.users`.
2) Set country with a label (e.g., “India”) and verify it normalizes to ISO‑2 (‘IN’):
```sql
select email, country_code from public.users where email = '<test-email>';
```
3) Sign‑Up with referral (`?ref=<8-digit>`): verify child’s `referred_by` (or equivalent linkage) is present.
4) Login: confirm `/api/me` returns `name,country_code` for that email.

## Notes
- These steps require no application code changes and can be rolled back easily (drop trigger/index).
- After stabilization, consider implementing the server‑side numeric 8‑digit referral generation with retry in the API route (already drafted in `docs/proposed-diffs.patch`).
