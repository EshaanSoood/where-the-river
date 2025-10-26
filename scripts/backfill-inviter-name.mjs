#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
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
  const outBase = path.join(process.cwd(), '..', '.cursor-ref-urgent');
  fs.mkdirSync(path.join(outBase, 'db'), { recursive: true });
  fs.mkdirSync(path.join(outBase, 'http'), { recursive: true });

  loadEnvFile(path.join(process.cwd(), '.env.local'));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error('Missing Supabase env');
  const supabase = createClient(url, service);

  // 1) inviter id
  const code = '79434756';
  const { data: rc } = await supabase.from('referral_codes').select('user_id').eq('code', code).maybeSingle();
  const inviter = rc?.user_id || null;
  fs.writeFileSync(path.join(outBase, 'db', 'inviter_user_id.json'), JSON.stringify({ code, inviter }, null, 2));
  if (!inviter) throw new Error('No inviter found');

  // 2) profiles/auth before
  const { data: prof } = await supabase.from('profiles').select('user_id, full_name, first_name, last_name').eq('user_id', inviter).maybeSingle();
  fs.writeFileSync(path.join(outBase, 'db', 'inviter_profile_before.json'), JSON.stringify(prof || null, null, 2));
  const { data: auth } = await supabase.from('auth.users').select('id, user_metadata').eq('id', inviter).maybeSingle();
  fs.writeFileSync(path.join(outBase, 'db', 'inviter_auth_before.json'), JSON.stringify(auth || null, null, 2));

  // 3) backfill if empty
  const full = (prof?.full_name || '').trim();
  let resolved = '';
  if (!full) {
    const fn = (prof?.first_name || '').trim();
    const ln = (prof?.last_name || '').trim();
    const fromProf = (fn || ln) ? `${fn}${fn && ln ? ' ' : ''}${ln}`.trim() : '';
    const um = (auth?.user_metadata || {})
    const fromUMFull = (typeof um.full_name === 'string' ? um.full_name.trim() : '') || '';
    const fromUMName = (typeof um.name === 'string' ? um.name.trim() : '') || '';
    resolved = [fromProf, fromUMFull, fromUMName].find(s => s && s.length > 0) || '';
    if (resolved) {
      await supabase.from('profiles').update({ full_name: resolved }).eq('user_id', inviter);
      fs.writeFileSync(path.join(outBase, 'db', 'backfill_outcome.txt'), `profiles.full_name updated to "${resolved}" for ${inviter}`);
    } else {
      fs.writeFileSync(path.join(outBase, 'db', 'backfill_outcome.txt'), `no update performed (no source name found) for ${inviter}`);
    }
  } else {
    fs.writeFileSync(path.join(outBase, 'db', 'backfill_outcome.txt'), `no update needed (full_name already set) for ${inviter}`);
  }

  // 4) resolver after
  const res = await fetch('https://riverflowseshaan.vercel.app/api/referral/resolve?code=79434756');
  const body = await res.text();
  fs.writeFileSync(path.join(outBase, 'http', 'resolve_after_backfill.json'), body);
  console.log(JSON.stringify({ ok: true, inviter, resolved }, null, 2));
}

main().catch(e => { console.error(e?.message || String(e)); process.exit(1); });



