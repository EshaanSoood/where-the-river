#!/usr/bin/env node
// Delete a user by email using Supabase service role. Usage:
//   node web/scripts/admin-delete-user.mjs user@example.com

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
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node web/scripts/admin-delete-user.mjs <email>');
    process.exit(1);
  }

  // Load env from .env.local in web root if not already defined
  const envPath = path.join(process.cwd(), '.env.local');
  loadEnvFile(envPath);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    console.error('Missing Supabase env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
    process.exit(1);
  }

  const supabase = createClient(url, service);

  // Lookup user in auth.users by email
  const { data: userList, error: userErr } = await supabase.auth.admin.listUsers();
  if (userErr) {
    console.error('Error listing auth users:', userErr.message);
    process.exit(2);
  }
  const userRow = (userList?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
  if (userErr) {
    console.error('Error reading auth.users:', userErr.message);
    process.exit(2);
  }
  if (!userRow) {
    console.log(JSON.stringify({ ok: true, message: 'User not found; nothing to delete', email }, null, 2));
    return;
  }

  const userId = userRow.id;

  // Best-effort cleanup in public schema using a separate client (default schema)
  const supabasePublic = createClient(url, service);
  const cleanupOps = [];
  const tryDel = async (table, col = 'user_id') => {
    try {
      await supabasePublic.from(table).delete().eq(col, userId);
    } catch {}
  };
  cleanupOps.push(tryDel('referral_codes'));
  cleanupOps.push(tryDel('referral_code_aliases'));
  cleanupOps.push(tryDel('user_verifications'));
  cleanupOps.push(tryDel('points_ledger'));
  await Promise.allSettled(cleanupOps);

  // Delete auth user via Admin API
  const { error: delErr } = await supabasePublic.auth.admin.deleteUser(userId);
  if (delErr) {
    console.error('Delete user failed:', delErr.message);
    process.exit(3);
  }

  console.log(JSON.stringify({ ok: true, deleted_user_id: userId, email }, null, 2));
}

main().catch((e) => { console.error(e?.message || String(e)); process.exit(99); });


