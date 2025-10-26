import fs from 'fs/promises';
import crypto from 'crypto';
import { chromium, webkit } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'https://riverflowseshaan.vercel.app';
const PROBE_CODE = process.env.PROBE_CODE || '79434756';
const outUiDir = new URL('../../.cursor-ref-health/ui/', import.meta.url);
const verdictPath = new URL('../../.cursor-ref-health/signup_verdict.txt', import.meta.url);

async function saveHtml(page, name) {
  const html = await page.content();
  await fs.writeFile(new URL(name, outUiDir), html);
}

async function main() {
  await fs.mkdir(new URL('.', outUiDir), { recursive: true });
  const emailLocal = `probe+${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const email = `${emailLocal}@example.com`;

  const ctx = await webkit.launchPersistentContext('', { headless: true });
  const page = await ctx.newPage();
  let pass = true;
  let reason = [];

  try {
    await page.goto(`${BASE_URL}/?ref=${encodeURIComponent(PROBE_CODE)}`, { waitUntil: 'domcontentloaded' });
    await saveHtml(page, 'overlay_initial.html');

    // Click Participate if present
    try { await page.click('text=Participate', { timeout: 3000 }); } catch {}

    // Fill email and country and submit (form selectors may vary; best-effort)
    try {
      await page.fill('input[type="email"]', email);
    } catch {}
    // Country may be a select; skip if not present
    try { await page.selectOption('select[name="country"]', 'US'); } catch {}
    // Click submit or continue
    try { await page.click('button:has-text("Send")'); } catch {}

    // Capture first-paint of signup screen
    await saveHtml(page, 'signup_initial.html');
  } catch (e) {
    pass = false;
    reason.push('navigation or form interaction failed');
  } finally {
    await ctx.close();
  }

  // DB truth via MCP is performed by separate scripts; this probe focuses on HTML captures only.
  const verdict = pass ? 'PASS signup HTML captured' : `FAIL ${reason.join('; ')}`;
  await fs.writeFile(verdictPath, verdict + '\n');
  if (!pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});


