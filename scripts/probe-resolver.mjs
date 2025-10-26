import fs from 'fs/promises';
import https from 'https';
import { URL as NodeURL } from 'url';

const BASE_URL = process.env.BASE_URL || 'https://riverflowseshaan.vercel.app';
const PROBE_CODE = process.env.PROBE_CODE || '79434756';
const outDir = new URL('../../.cursor-ref-health/http/', import.meta.url);
const verdictPath = new URL('../../.cursor-ref-health/resolve_verdict.txt', import.meta.url);

function getJson(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new NodeURL(urlStr);
    const opts = { method: 'GET', headers: { 'Cache-Control': 'no-store' } };
    https
      .request(u, opts, (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf || '{}'));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject)
      .end();
  });
}

async function main() {
  await fs.mkdir(new URL('.', outDir), { recursive: true });
  const url = `${BASE_URL}/api/referral/resolve?code=${encodeURIComponent(PROBE_CODE)}`;
  const body = await getJson(url);
  await fs.writeFile(new URL('resolve.json', outDir), JSON.stringify(body, null, 2));
  const hasName = !!(body && (body.full_name || body.first_name));
  const verdict = hasName ? 'PASS resolver has name' : 'FAIL resolver missing name';
  await fs.writeFile(verdictPath, verdict + '\n');
  if (!hasName) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});


