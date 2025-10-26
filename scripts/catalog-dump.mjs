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
  const baseDir = path.join(process.cwd(), '..', '.cursor-backend-audit', 'db');
  fs.mkdirSync(baseDir, { recursive: true });

  // Schemas
  const schemasOut = path.join(baseDir, 'schemas.json');
  try {
    const { data, error } = await supabase.from('pg_namespace').select('nspname').not('nspname','like','pg_%').neq('nspname','information_schema');
    if (error) throw new Error(error.message);
    fs.writeFileSync(schemasOut, JSON.stringify((data||[]).map(r=>r.nspname), null, 2));
  } catch (e) {
    fs.writeFileSync(schemasOut, JSON.stringify({ error: e?.message || String(e) }, null, 2));
  }

  // Public inventory
  const publicInv = path.join(baseDir, 'public_inventory.json');
  try {
    const { data: tables } = await supabase.from('information_schema.tables').select('table_name').eq('table_schema','public').eq('table_type','BASE TABLE');
    const { data: views } = await supabase.from('information_schema.views').select('table_name').eq('table_schema','public');
    fs.writeFileSync(publicInv, JSON.stringify({
      tables: (tables||[]).map(r=>r.table_name),
      views: (views||[]).map(r=>r.table_name),
      matviews: []
    }, null, 2));
  } catch (e) {
    fs.writeFileSync(publicInv, JSON.stringify({ error: e?.message || String(e) }, null, 2));
  }

  // auth inventory
  const authInv = path.join(baseDir, 'auth_inventory.json');
  try {
    const { data: tables } = await supabase.from('information_schema.tables').select('table_name').eq('table_schema','auth').eq('table_type','BASE TABLE');
    fs.writeFileSync(authInv, JSON.stringify({ tables: (tables||[]).map(r=>r.table_name), views: [], matviews: [] }, null, 2));
  } catch (e) {
    fs.writeFileSync(authInv, JSON.stringify({ error: e?.message || String(e) }, null, 2));
  }

  // Policies for selected tables (public)
  const rlsDir = path.join(baseDir, 'rls');
  fs.mkdirSync(rlsDir, { recursive: true });
  const targets = ['referral_codes','referral_code_aliases','user_verifications','points_ledger','boats_totals'];
  for (const t of targets) {
    const out = path.join(rlsDir, `public.${t}.json`);
    try {
      const { data } = await supabase.from('pg_policy').select('polname, schemaname, tablename, roles, cmd, qual, with_check').eq('schemaname','public').eq('tablename', t);
      fs.writeFileSync(out, JSON.stringify({ table: t, policies: data || [] }, null, 2));
    } catch (e) {
      fs.writeFileSync(out, JSON.stringify({ table: t, error: e?.message || String(e) }, null, 2));
    }
  }

  // Grants for selected tables
  const grantsDir = path.join(baseDir, 'grants');
  fs.mkdirSync(grantsDir, { recursive: true });
  for (const t of targets) {
    const out = path.join(grantsDir, `public.${t}.json`);
    try {
      const { data } = await supabase
        .from('information_schema.role_table_grants')
        .select('grantee, table_schema, table_name, privilege_type, is_grantable')
        .eq('table_schema','public')
        .eq('table_name', t);
      fs.writeFileSync(out, JSON.stringify({ table: t, grants: data || [] }, null, 2));
    } catch (e) {
      fs.writeFileSync(out, JSON.stringify({ table: t, error: e?.message || String(e) }, null, 2));
    }
  }

  console.log(JSON.stringify({ ok: true, baseDir }, null, 2));
}

main().catch((e)=>{ console.error(e?.message || String(e)); process.exit(99); });



