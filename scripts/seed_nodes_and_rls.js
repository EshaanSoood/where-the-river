(async () => {
  const { Client } = require('pg');
  const client = new Client({
    connectionString: 'postgresql://postgres:miqvem-hivtu7-Jimmov@db.odqdiswjxulimqiupydc.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country_code char(2)");
    await client.query("DELETE FROM public.users WHERE referral_id LIKE 'test-%'");
    await client.query(`INSERT INTO public.users (name, email, country_code, referral_id, created_at) VALUES
      ('Test IN 1','test-IN-1@example.com','IN','test-IN-1',now()),
      ('Test IN 2','test-IN-2@example.com','IN','test-IN-2',now()),
      ('Test US 1','test-US-1@example.com','US','test-US-1',now()),
      ('Test US 2','test-US-2@example.com','US','test-US-2',now()),
      ('Test NL 1','test-NL-1@example.com','NL','test-NL-1',now()),
      ('Test CA 1','test-CA-1@example.com','CA','test-CA-1',now()),
      ('Test BD 1','test-BD-1@example.com','BD','test-BD-1',now()),
      ('Test JP 1','test-JP-1@example.com','JP','test-JP-1',now()),
      ('Test AU 1','test-AU-1@example.com','AU','test-AU-1',now())`);
    await client.query("ALTER TABLE public.users ENABLE ROW LEVEL SECURITY");
    await client.query("DROP POLICY IF EXISTS \"public read nodes\" ON public.users");
    await client.query("CREATE POLICY \"public read nodes\" ON public.users FOR SELECT TO anon USING (true)");
    await client.query("GRANT USAGE ON SCHEMA public TO anon");
    await client.query("GRANT SELECT ON TABLE public.users TO anon");
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  const pol = await client.query("SELECT polname AS policy_name, schemaname, tablename, cmd FROM pg_policies WHERE schemaname='public' AND tablename='users' AND polname='public read nodes'");
  const counts = await client.query("SELECT country_code, count(*) FROM public.users WHERE referral_id LIKE 'test-%' GROUP BY 1 ORDER BY 1");
  console.log(JSON.stringify({ policy: pol.rows, counts: counts.rows }, null, 2));
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
