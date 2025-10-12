-- Seed test nodes (public.users expected by app)
INSERT INTO public.users (name, country_code, referred_by, referral_id, created_at)
VALUES
  ('Test IN 1', 'IN', NULL, 'test-IN-1', now()),
  ('Test IN 2', 'IN', NULL, 'test-IN-2', now()),
  ('Test US 1', 'US', NULL, 'test-US-1', now()),
  ('Test US 2', 'US', NULL, 'test-US-2', now()),
  ('Test NL 1', 'NL', NULL, 'test-NL-1', now()),
  ('Test CA 1', 'CA', NULL, 'test-CA-1', now()),
  ('Test BD 1', 'BD', NULL, 'test-BD-1', now()),
  ('Test JP 1', 'JP', NULL, 'test-JP-1', now()),
  ('Test AU 1', 'AU', NULL, 'test-AU-1', now())
ON CONFLICT (referral_id) DO NOTHING;

-- Enable RLS if not already
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop any existing policy with the same name to avoid duplicates
DROP POLICY IF EXISTS "public read nodes" ON public.users;

-- Allow anon role to SELECT
CREATE POLICY "public read nodes"
ON public.users
FOR SELECT
TO anon
USING (true);

-- Helpful grants (idempotent)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.users TO anon;
