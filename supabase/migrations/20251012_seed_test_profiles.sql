-- Seed 5 pre-authenticated test profiles in 5 countries
-- Note: This script inserts into auth.users and public.profiles. Run with service permissions (SQL editor) in Supabase.

create extension if not exists pgcrypto with schema public;

with new_users as (
  insert into auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    confirmed_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at,
    aud,
    role
  )
  values
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'ava.river+1@example.com', null, now(), null, null, null, null, null, null, null, null, now(), '{"provider":"email"}', '{}', false, now(), now(), null, null, null, null, null, now(), null, 0, null, null, false, null, 'authenticated', 'authenticated'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'ben.river+2@example.com', null, now(), null, null, null, null, null, null, null, null, now(), '{"provider":"email"}', '{}', false, now(), now(), null, null, null, null, null, now(), null, 0, null, null, false, null, 'authenticated', 'authenticated'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'cara.river+3@example.com', null, now(), null, null, null, null, null, null, null, null, now(), '{"provider":"email"}', '{}', false, now(), now(), null, null, null, null, null, now(), null, 0, null, null, false, null, 'authenticated', 'authenticated'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'dan.river+4@example.com', null, now(), null, null, null, null, null, null, null, null, now(), '{"provider":"email"}', '{}', false, now(), now(), null, null, null, null, null, now(), null, 0, null, null, false, null, 'authenticated', 'authenticated'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'ella.river+5@example.com', null, now(), null, null, null, null, null, null, null, null, now(), '{"provider":"email"}', '{}', false, now(), now(), null, null, null, null, null, now(), null, 0, null, null, false, null, 'authenticated', 'authenticated')
  returning id, email
)
insert into public.profiles (
  user_id,
  email,
  first_name,
  last_name,
  country_code,
  favorite_song,
  referral_code,
  parent_user_id,
  joined_at
)
select u.id,
       u.email,
       x.first_name,
       x.last_name,
       x.country_code,
       x.favorite_song,
       null,
       null,
       now()
from new_users u
join (values
  ('Ava','River','US','Mountain Muse'),
  ('Ben','Harbor','IN','Glass Blown Acquaintances'),
  ('Cara','Cove','GB','Miss Lightning'),
  ('Dan','Bay','DE','If Our Hearts Could Talk'),
  ('Ella','Stream','BR','Sailing Through Dream River')
) as x(first_name,last_name,country_code,favorite_song)
on true
limit 5;


