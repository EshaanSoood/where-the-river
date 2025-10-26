#!/usr/bin/env node
// Audit referral DB state for a given code and (optionally) a user email.
// Usage: node web/scripts/db-audit-referral.mjs 79434756 [new_user_email]

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
  const code = process.argv[2];
  const probeEmail = process.argv[3] || null;
  if (!code) {
    console.error('Usage: node web/scripts/db-audit-referral.mjs <code> [new_user_email]');
    process.exit(1);
  }

  const envPath = path.join(process.cwd(), '.env.local');
  loadEnvFile(envPath);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    console.error('Missing Supabase env vars');
    process.exit(1);
  }
  const supabase = createClient(url, service);

  const outDir = path.join(process.cwd(), '..', '.cursor-ref-audit', 'db');
  fs.mkdirSync(outDir, { recursive: true });

  // 1) Resolve inviter by code/aliases
  const inv = { code, inviter: null, source: null };
  const { data: row } = await supabase.from('referral_codes').select('user_id, code, created_at').eq('code', code).maybeSingle();
  if (row) {
    inv.inviter = row;
    inv.source = 'referral_codes';
  } else {
    const { data: alias } = await supabase.from('referral_code_aliases').select('user_id, code, created_at').eq('code', code).maybeSingle();
    if (alias) { inv.inviter = alias; inv.source = 'referral_code_aliases'; }
  }
  fs.writeFileSync(path.join(outDir, 'inviter_lookup.json'), JSON.stringify(inv, null, 2));

  let inviterId = inv.inviter?.user_id || null;
  if (inviterId) {
    // 2) Read inviter name from auth.users (user_metadata preferred)
    const { data: authRow } = await supabase
      .from('auth.users')
      .select('id, user_metadata, raw_user_meta_data, created_at')
      .eq('id', inviterId)
      .maybeSingle();
    fs.writeFileSync(path.join(outDir, 'inviter_auth_row.json'), JSON.stringify(authRow || null, null, 2));
  }

  // 3) If a new email is supplied, find that user row
  if (probeEmail) {
    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (!listErr) {
      const found = (usersList?.users || []).find(u => (u.email || '').toLowerCase() === probeEmail.toLowerCase()) || null;
      fs.writeFileSync(path.join(outDir, 'new_user_auth.json'), JSON.stringify(found || null, null, 2));
      if (found) {
        // 4) Read referred_by mirror from metadata, if any
        const md = found.user_metadata || {};
        fs.writeFileSync(path.join(outDir, 'new_user_metadata.json'), JSON.stringify(md, null, 2));
      }
    } else {
      fs.writeFileSync(path.join(outDir, 'new_user_auth.json'), JSON.stringify({ error: listErr.message }, null, 2));
    }
  }

  // 5) Points ledger recent (last 1h)
  const sinceIso = new Date(Date.now() - 60*60*1000).toISOString();
  try {
    const { data: ledger } = await supabase.from('points_ledger').select('*').gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(50);
    fs.writeFileSync(path.join(outDir, 'points_ledger_recent.json'), JSON.stringify(ledger || [], null, 2));
  } catch (e) {
    fs.writeFileSync(path.join(outDir, 'points_ledger_recent.json'), JSON.stringify({ error: e?.message || String(e) }, null, 2));
  }

  console.log(JSON.stringify({ ok: true, outDir }, null, 2));
}

main().catch((e) => { console.error(e?.message || String(e)); process.exit(99); });



