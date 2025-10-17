/* eslint-disable no-console */
import { writeFileSync, mkdirSync } from 'fs';
import { ALL_ISO2 } from '@/lib/iso2';
import { getIsoCountries } from '@/lib/countryList';

function ensureTmp() {
  try { mkdirSync('.tmp'); } catch {}
}

function run() {
  ensureTmp();
  const ui = getIsoCountries('en').map(c => c.code.toUpperCase()).sort();
  writeFileSync('.tmp/ui-country-codes.json', JSON.stringify(ui, null, 2));

  const api = ALL_ISO2.slice();
  writeFileSync('.tmp/api-country-codes.json', JSON.stringify(api, null, 2));

  console.log('UI count:', ui.length);
  console.log('API count:', api.length);
}

run();


