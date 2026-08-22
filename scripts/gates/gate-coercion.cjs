// Gate: value validation in validateSystemData (the silent-coercion fix).
// Reuses the 7b1pre fixture journal. Aborts if the browser still runs the old module.
const { call } = require('./lib.cjs');
const { ensureTimelineFixture } = require('./fixtures.cjs');
let JID = null;
let EV = null;   // Gate Event Frac
let ERA = null;  // Gate Era A
let QP = null;   // Gate Coerce Quest
const J = (x) => JSON.stringify(x);

const results = [];
function check(n, desc, pass, detail) {
  results.push({ n, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}. ${desc}`);
  if (detail !== undefined) console.log(`        ${detail}`);
}
async function read(pageId, key) {
  const r = await call('list-journals', { journalId: JID, pageId });
  if (!r?.success || !r.page) throw new Error('reader failed: ' + J(r).slice(0, 200));
  return key ? r.page.system?.[key] : r.page.system;
}
const upd = (pageId, system) => call('update-simple-quest-page', { journalId: JID, pageId, system });

(async () => {
  console.log('=== gate: system value validation (silent-coercion fix) ===\n');

  const fx = await ensureTimelineFixture();
  JID = fx.journalId;
  EV = fx.pages['Gate Event Frac'];
  ERA = fx.pages['Gate Era A'];
  QP = fx.pages['Gate Coerce Quest'];
  console.log(`fixture ${JID}\n`);

  // ---- freshness probe. A socket reconnect is not a module reload. -------------------
  const probeBefore = await read(EV, 'year');
  const probe = await upd(EV, { year: 1.5 });
  const probeAfter = await read(EV, 'year');
  if (probe.success === true) {
    console.log('STALE MODULE — the browser is still running the old data-access.js.');
    console.log(`  year 1.5 was accepted and stored ${J(probeAfter)} (was ${J(probeBefore)}).`);
    console.log('  Refresh Foundry (F5) and re-run. Not reporting a gate result on stale code.');
    process.exit(2);
  }
  console.log('module is fresh (year 1.5 was refused)\n');

  // 1. non-integer refused, and provably nothing written
  check(1, 'year 1.5 refused AND the stored value is untouched',
    probe.success === false && J(probeAfter) === J(probeBefore),
    `success=${probe.success} before=${J(probeBefore)} after=${J(probeAfter)}`);

  // 2. the refusal names what would have been stored — the point of the fix
  const c = probe.coercedValues?.[0];
  check(2, 'refusal names the value the model would have stored (2)',
    c?.field === 'year' && c?.sent === 1.5 && c?.wouldStore === 2,
    `coercedValues=${J(probe.coercedValues)}`);

  // 3. distinct reason code, not the pre-existing unknown-key branch
  check(3, "reason is 'value-would-be-altered'",
    probe.reason === 'value-would-be-altered' && probe.refused === true,
    `reason=${J(probe.reason)} refused=${J(probe.refused)}`);

  // 4. the false-success case: unparseable value
  const before4 = await read(EV, 'year');
  const r4 = await upd(EV, { year: 'abc' });
  const after4 = await read(EV, 'year');
  check(4, 'year "abc" refused with a validation reason, nothing written',
    r4.success === false && J(after4) === J(before4) &&
    /number/i.test(String(r4.coercedValues?.[0]?.reason)),
    `success=${r4.success} reason=${J(r4.coercedValues?.[0]?.reason)} stored=${J(after4)}`);

  // 5. BRANCH NOT OTHERWISE TAKEN — a lossless string parse must still be ACCEPTED.
  //    Over-refusing here would be a regression the other checks cannot see.
  const r5 = await upd(EV, { year: '77' });
  const after5 = await read(EV, 'year');
  check(5, 'numeric string "77" still accepted and stored as 77',
    r5.success === true && after5 === 77,
    `success=${r5.success} stored=${J(after5)} msg=${String(r5.message ?? '').slice(0, 100)}`);

  // 6. happy path intact, and moved away then back
  const r6a = await upd(EV, { year: 300 });
  const at300 = await read(EV, 'year');
  const r6b = await upd(EV, { year: 150 });
  const at150 = await read(EV, 'year');
  check(6, 'plain integer write still works, away (300) and back (150)',
    r6a.success === true && at300 === 300 && r6b.success === true && at150 === 150,
    `300 -> ${J(at300)} ; 150 -> ${J(at150)}`);

  // 7. precedence: an unknown key outranks a value problem in the same call
  const r7 = await upd(EV, { bogusKey: 1, year: 1.5 });
  check(7, 'unknown key wins over a value problem in the same call',
    r7.success === false && r7.reason === 'unknown-system-keys' &&
    J(r7.rejected).includes('bogusKey'),
    `reason=${J(r7.reason)} rejected=${J(r7.rejected)}`);

  // 8. colour case-normalisation must NOT be refused
  const r8 = await upd(ERA, { color: '#FF0000' });
  check(8, 'colour "#FF0000" accepted (case normalisation is not a coercion)',
    r8.success === true,
    `success=${r8.success} stored=${J(await read(ERA, 'color'))} msg=${String(r8.message ?? '').slice(0, 120)}`);

  // 9. out-of-choices value on a NumberField with choices
  const r9 = await call('update-simple-quest-page', { journalId: JID, pageId: QP, system: { status: 5 } });
  check(9, 'status 5 refused (not a valid choice), status left alone',
    r9.success === false && (await read(QP, 'status')) === -1,
    `success=${r9.success} reason=${J(r9.coercedValues?.[0]?.reason)} stored=${J(await read(QP, 'status'))}`);

  // 10. BRANCH NOT OTHERWISE TAKEN — a partial SchemaField write must still be accepted.
  //     SchemaField.clean fills in defaults for omitted subkeys; treating that as a
  //     coercion would refuse every partial write to a compound field.
  const r10 = await call('update-simple-quest-page', {
    journalId: JID, pageId: QP, system: { html: { content: '<p>block</p>' } },
  });
  check(10, 'partial SchemaField write (html.content only) still accepted',
    r10.success === true,
    `success=${r10.success} msg=${String(r10.message ?? '').slice(0, 140)}`);

  // 11. the create path refuses too, and creates no page
  const beforePages = (await call('list-journals', { journalId: JID })).pageCount;
  const r11 = await call('create-simple-quest-page', {
    type: 'simple-quest.event', name: 'Gate Coerce ShouldNotExist', journalId: JID,
    system: { year: 2.5 },
  });
  const afterPages = (await call('list-journals', { journalId: JID })).pageCount;
  check(11, 'create refuses a coerced value AND creates no page',
    r11.success === false && r11.reason === 'value-would-be-altered' && afterPages === beforePages,
    `success=${r11.success} reason=${J(r11.reason)} pages ${beforePages} -> ${afterPages}`);

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n=== ${passed}/${results.length} ===`);
  if (passed !== results.length) process.exitCode = 1;
})().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(1); });
