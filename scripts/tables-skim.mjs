#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(envPath) {
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const k = m[1];
      let v = m[2];
      v = v.replace(/^['"]|['"]$/g, '');
      if (!(k in process.env) && v) process.env[k] = v.trim();
    }
  } catch {}
}

async function main() {
  const envPath = path.join(process.cwd(), '.env.local');
  loadEnvFile(envPath);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    console.error('Missing Supabase env vars');
    process.exit(1);
  }
  const supabase = createClient(url, service);
  const outDir = path.join(process.cwd(), '..', '.cursor-backend-audit', 'db', 'tables');
  fs.mkdirSync(outDir, { recursive: true });

  const tables = ['referral_codes', 'referral_code_aliases', 'user_verifications', 'points_ledger', 'boats_totals'];
  for (const t of tables) {
    try {
      const { data, error } = await supabase.from(t).select('*').limit(1);
      const file = path.join(outDir, `public.${t}.json`);
      fs.writeFileSync(file, JSON.stringify({ table: t, sample: data || [], error: error ? error.message : null }, null, 2));
    } catch (e) {
      const file = path.join(outDir, `public.${t}.json`);
      fs.writeFileSync(file, JSON.stringify({ table: t, error: e?.message || String(e) }, null, 2));
    }
  }
  console.log(JSON.stringify({ ok: true, outDir }, null, 2));
}

main().catch((e) => { console.error(e?.message || String(e)); process.exit(99); });



