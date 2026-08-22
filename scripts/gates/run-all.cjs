#!/usr/bin/env node
// Run every gate against the live world and summarise.
//
//   node scripts/gates/run-all.cjs
//
// Exit 0 if all pass, 1 if any check fails, 2 if the browser is running stale module code.
// Requires the backend on 31414 and Foundry connected. Run it after any Simple Quest or
// Foundry update, and after re-porting onto an upstream sync.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const gates = fs
  .readdirSync(dir)
  .filter(f => f.startsWith('gate-') && f.endsWith('.cjs'))
  .sort();

const rows = [];
let worst = 0;

for (const g of gates) {
  let out = '';
  let code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(dir, g)], { encoding: 'utf8' });
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    code = e.status ?? 1;
  }
  worst = Math.max(worst, code);

  const score = (out.match(/^=== (\d+)\/(\d+) ===$/m) ?? [])[0] ?? null;
  const stale = /STALE MODULE/.test(out);
  const fails = out.split('\n').filter(l => l.startsWith('FAIL'));

  rows.push({ gate: g.replace(/^gate-|\.cjs$/g, ''), score, stale, code, fails, out });
}

console.log('');
for (const r of rows) {
  const status = r.stale ? 'STALE (refresh Foundry)' : (r.score ?? 'no result');
  console.log(`${r.code === 0 ? 'ok  ' : 'FAIL'}  ${r.gate.padEnd(28)} ${status}`);
  for (const f of r.fails) console.log(`        ${f}`);
}

const anyStale = rows.some(r => r.stale);
if (anyStale) {
  console.log(
    '\nAt least one gate saw stale module code. A Foundry socket reconnect is NOT a module\n' +
      'reload: press F5 in Foundry after deploying packages/foundry-module/dist, then re-run.'
  );
}
console.log(
  `\n${rows.filter(r => r.code === 0).length}/${rows.length} gates passed.` +
    (worst === 0 ? '' : '  (re-run an individual gate for its full output)')
);
process.exit(worst === 0 ? 0 : anyStale ? 2 : 1);
