// 7b.3 gate — set-timeline-config, and the 7b.0 debt.
//
// The debt: until this cycle the flag writer had NEVER been given a JournalEntry (only
// pages), and had NEVER taken its scalar branch (the only key that existed, `counters`, is
// an object map). Checks 1-3 exist to run those two branches for the first time.
const { call } = require('./lib.cjs');
const J = (x) => JSON.stringify(x);

const { ensureTimelineFixture, ensureSecondTimelineJournal } = require('./fixtures.cjs');
let JID = null; // resolved at run time; was a hardcoded id until 2026-08-22
const results = [];
function check(n, desc, pass, detail) {
  results.push({ n, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}. ${desc}`);
  if (detail !== undefined) console.log(`        ${detail}`);
}
const cfg = (extra) => call('set-timeline-config', { journalId: JID, ...extra });

(async () => {
  console.log('=== 7b.3 gate: set-timeline-config + the 7b.0 JournalEntry/scalar debt ===\n');

  ({ journalId: JID } = await ensureTimelineFixture());
  await ensureSecondTimelineJournal();
  console.log(`fixture ${JID}\n`);

  const probe = await cfg({});
  if (probe?.__isError || probe?.success === undefined) {
    console.log('STALE MODULE — setTimelineConfig is not registered in the browser.');
    console.log('  ' + String(probe?.__raw ?? J(probe)).slice(0, 250));
    console.log('  Refresh Foundry (F5) and re-run. Not reporting a gate result on stale code.');
    process.exit(2);
  }
  console.log('module is fresh\n');

  // ---- 1. THE DEBT, PART ONE: a flag written to a JournalEntry --------------------------
  //     Away and back, so a writer that silently did nothing cannot pass both halves.
  const away = await cfg({ timeScale: 25 });
  const readAway = await call('get-timeline', { journalId: JID });
  const back = await cfg({ timeScale: 10 });
  const readBack = await call('get-timeline', { journalId: JID });
  check(
    1,
    'THE DEBT: a scalar flag writes to a JournalEntry and reads back, away (25) and back (10)',
    away.success === true &&
      away.changedFlags?.timeScale?.to === 25 &&
      readAway.config.timeScale === 25 &&
      back.success === true &&
      back.changedFlags?.timeScale?.from === 25 &&
      readBack.config.timeScale === 10,
    `away=${J(away.changedFlags?.timeScale)} get-timeline saw ${readAway.config?.timeScale} ; back=${J(back.changedFlags?.timeScale)} get-timeline saw ${readBack.config?.timeScale}`
  );

  // ---- 2. THE DEBT, PART TWO: the scalar branch must write a FLAT path -----------------
  //     The object branch descends per sub-key. If the scalar branch had taken that fork it
  //     would have written a nested object, and Simple Quest reads the flag directly.
  const s2 = await cfg({ negativeAbb: 'BCE', showMinus: true });
  const r2 = await call('get-timeline', { journalId: JID });
  check(
    2,
    'THE DEBT: scalar flags land as scalars, not nested objects (string and boolean)',
    s2.success === true &&
      r2.config.negativeAbb === 'BCE' &&
      typeof r2.config.negativeAbb === 'string' &&
      r2.config.showMinus === true &&
      typeof r2.config.showMinus === 'boolean',
    `negativeAbb=${J(r2.config?.negativeAbb)} (${typeof r2.config?.negativeAbb}) showMinus=${J(r2.config?.showMinus)} (${typeof r2.config?.showMinus})`
  );
  await cfg({ negativeAbb: 'BC', showMinus: false });

  // ---- 3. THE DEBT, PART THREE: one write, several scalar leaves, none clobbered -------
  const s3 = await cfg({ timeScale: 12, content: 'toggleOff', positiveAbb: 'CE' });
  const r3 = await call('get-timeline', { journalId: JID });
  check(
    3,
    'THE DEBT: three scalar flags in one call all land, and the untouched ones survive',
    s3.success === true &&
      Object.keys(s3.changedFlags ?? {}).length === 3 &&
      r3.config.timeScale === 12 &&
      r3.config.content === 'toggleOff' &&
      r3.config.positiveAbb === 'CE' &&
      r3.config.negativeAbb === 'BC' &&
      r3.config.showMinus === false,
    `changed=${J(Object.keys(s3.changedFlags ?? {}))} config=${J(r3.config)}`
  );

  // ---- 4. ANTI-SILENT-DEFAULT: naming nothing must not reset anything -------------------
  const s4 = await cfg({});
  const r4 = await call('get-timeline', { journalId: JID });
  check(
    4,
    'called with no settings: writes nothing and leaves the tuned values alone',
    s4.success === true &&
      Object.keys(s4.changedFlags ?? {}).length === 0 &&
      r4.config.timeScale === 12 &&
      r4.config.content === 'toggleOff' &&
      r4.config.positiveAbb === 'CE',
    `changedFlags=${J(s4.changedFlags)} still={timeScale:${r4.config?.timeScale}, content:${J(r4.config?.content)}, positiveAbb:${J(r4.config?.positiveAbb)}}`
  );

  // ---- 5-8. value validation. Flags have no data model, so nothing else catches these. --
  const bad = {
    'timeScale as a string': { timeScale: 'ten' },
    'timeScale below the 0.1 render floor': { timeScale: 0.05 },
    'content not one of the three choices': { content: 'sometimes' },
    'showMinus as a truthy string': { showMinus: 'yes' },
  };
  let n = 5;
  for (const [label, payload] of Object.entries(bad)) {
    const r = await cfg(payload);
    const after = await call('get-timeline', { journalId: JID });
    const key = Object.keys(payload)[0];
    check(
      n,
      `${label} is refused, and nothing is written`,
      r.success === false &&
        r.reason === 'invalid-flag-value' &&
        (r.rejected ?? []).includes(key) &&
        after.config.timeScale === 12 &&
        after.config.content === 'toggleOff' &&
        after.config.showMinus === false,
      `rejected=${J(r.rejected)} msg=${String(r.message).slice(0, 150)}`
    );
    n++;
  }

  // ---- 9. BRANCH NOT OTHERWISE TAKEN — legitimate edge values must be ACCEPTED ---------
  //     A validator that refused everything would pass checks 5-8 and fail here.
  const s9a = await cfg({ timeScale: 0.1, negativeAbb: '' });
  const r9 = await call('get-timeline', { journalId: JID });
  check(
    9,
    'the exact render floor (0.1) and an empty abbreviation are accepted, not refused',
    s9a.success === true && r9.config.timeScale === 0.1 && r9.config.negativeAbb === '',
    `timeScale=${J(r9.config?.timeScale)} negativeAbb=${J(r9.config?.negativeAbb)} msg=${String(s9a.message ?? '').slice(0, 90)}`
  );

  // ---- 10. the effect on the axis is reported, not just the storage --------------------
  const s10 = await cfg({ timeScale: 20 });
  const r10 = await call('get-timeline', { journalId: JID });
  check(
    10,
    'the response reports the resulting axis height, and get-timeline agrees',
    s10.success === true &&
      s10.axis?.totalHeight === r10.totalHeight &&
      s10.axis?.effectiveTimeScale === 20 &&
      r10.totalHeight === 12000,
    `set said ${s10.axis?.totalHeight}px, get-timeline says ${r10.totalHeight}px (was 6000 at timeScale 10)`
  );

  // ---- 11. refuse to guess between several timeline journals --------------------------
  const s11 = await call('set-timeline-config', { timeScale: 99 });
  check(
    11,
    'no identifier + several timeline journals => refuses and lists them, writing nothing',
    s11.success === false && Array.isArray(s11.timelineJournals) && s11.timelineJournals.length >= 2,
    `journals=${J((s11.timelineJournals ?? []).map((x) => x.name))}`
  );

  // ---- restore the fixture to its documented state -------------------------------------
  await cfg({ timeScale: 10, negativeAbb: 'BC', positiveAbb: 'AC', content: 'always' });
  const fin = await call('get-timeline', { journalId: JID });
  check(
    12,
    'fixture restored to its documented defaults (10 / BC / AC / always, axis back to 6000px)',
    fin.config.timeScale === 10 &&
      fin.config.negativeAbb === 'BC' &&
      fin.config.positiveAbb === 'AC' &&
      fin.config.content === 'always' &&
      fin.totalHeight === 6000,
    J(fin.config) + ` totalHeight=${fin.totalHeight}`
  );

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n=== ${passed}/${results.length} ===`);
  if (passed !== results.length) process.exitCode = 1;
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(1);
});
