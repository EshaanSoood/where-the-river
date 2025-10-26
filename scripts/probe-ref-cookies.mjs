#!/usr/bin/env node
import fetch from 'node-fetch';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function probe(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { redirect: 'manual' });
  const setCookies = res.headers.raw()['set-cookie'] || [];
  return { status: res.status, setCookies };
}

(async () => {
  const a = await probe('/?ref=TEST12345');
  const b = await probe('/r/TEST12345');
  const out = {
    base: BASE,
    query: { status: a.status, setCookieCount: a.setCookies.length, setCookies: a.setCookies.map(s => s.split(';')[0]) },
    path: { status: b.status, setCookieCount: b.setCookies.length, setCookies: b.setCookies.map(s => s.split(';')[0]) },
  };
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });


