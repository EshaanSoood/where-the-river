#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const outBase = path.join(process.cwd(), '.cursor-profilesless', 'backfill');
fs.mkdirSync(outBase, { recursive: true });

function redactEmail(email) {
  try {
    const [local, domain] = String(email || '').split('@');
    if (!domain) return 'redacted';
    const l = local.length <= 2 ? '*'.repeat(local.length) : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
    const d = domain.replace(/^[^.]+/, '***');
    return `${l}@${d}`;
  } catch { return 'redacted'; }
}

function titleCaseLocalPart(local) {
  const cleaned = String(local || '')
    .replace(/\+.*/, '')
    .replace(/[\._-]+/g, ' ')
    .trim();
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing env NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const supabase = createClient(url, serviceKey);

  // Fetch a reasonable batch (pagination omitted for simplicity)
  const { data: users, error } = await supabase.from('auth.users').select('id,email,raw_user_meta_data').limit(1000);
  if (error) {
    console.error('List users error:', error.message);
    process.exit(1);
  }

  const beforeSample = users.slice(0, 50).map(u => ({ id: u.id, email: redactEmail(u.email), meta: u.raw_user_meta_data || {} }));
  fs.writeFileSync(path.join(outBase, 'before_sample.json'), JSON.stringify(beforeSample, null, 2));

  let updated = 0, skipped = 0, errors = 0;
  const afterSample = [];

  for (const u of users) {
    try {
      const meta = (u.raw_user_meta_data || {});
      const full = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
      if (full) { skipped++; continue; }
      const name = (typeof meta.name === 'string' ? meta.name.trim() : '') || titleCaseLocalPart((u.email || '').split('@')[0] || '');
      if (!name) { skipped++; continue; }
      await supabase.auth.admin.updateUserById(u.id, { user_metadata: { ...meta, full_name: name } });
      updated++;
      if (afterSample.length < 50) afterSample.push({ id: u.id, email: redactEmail(u.email), full_name: name });
    } catch {
      errors++;
    }
  }

  fs.writeFileSync(path.join(outBase, 'after_sample.json'), JSON.stringify(afterSample, null, 2));
  fs.writeFileSync(path.join(outBase, 'summary.txt'), `updated=${updated}\nskipped=${skipped}\nerrors=${errors}\n`);
}

main().catch(() => process.exit(1));
