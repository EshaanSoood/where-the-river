/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function loadIso2() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'iso2.ts'), 'utf8');
  const start = src.indexOf('[');
  const end = src.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('ALL_ISO2 not found');
  const arrText = src.slice(start, end + 1);
  const codes = Function(`return ${arrText}`)();
  return codes.map(String).map(s => s.toUpperCase()).sort();
}

(function run() {
  const ui = loadIso2();
  const api = loadIso2();
  fs.mkdirSync(path.join(process.cwd(), '.tmp'), { recursive: true });
  fs.writeFileSync('.tmp/ui-country-codes.json', JSON.stringify(ui, null, 2));
  fs.writeFileSync('.tmp/api-country-codes.json', JSON.stringify(api, null, 2));
  console.log('UI count:', ui.length);
  console.log('API count:', api.length);
})();


