(async () => {
  const { Client } = require('pg');
  const client = new Client({
    connectionString: 'postgresql://postgres:miqvem-hivtu7-Jimmov@db.odqdiswjxulimqiupydc.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const tablesRes = await client.query(
    "SELECT schemaname, tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
  );
  const out = [];
  for (const row of tablesRes.rows) {
    const colsRes = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
      [row.tablename]
    );
    out.push({ table: row.tablename, columns: colsRes.rows });
  }
  const candidates = out.map(t => ({
    table: t.table,
    hasCountry: t.columns.some(c => /country/.test(c.column_name)),
    hasLat: t.columns.some(c => /lat/.test(c.column_name)),
    hasLng: t.columns.some(c => /(lng|lon|long)/.test(c.column_name)),
    hasCreated: t.columns.some(c => /created_at/.test(c.column_name)),
    hasReferral: t.columns.some(c => /referr/.test(c.column_name))
  }));
  console.log(JSON.stringify({ tables: out, candidates }, null, 2));
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
