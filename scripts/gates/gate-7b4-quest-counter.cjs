// 7b.4 gate — set-quest-counter, and the era/event split brain.
//
// Builds its own journal: it needs an era containing an event, with @COUNT declared in the
// EVENT body, so the timeline reads the era's flag while the event's sheet reads the event's.
const { call } = require('./lib.cjs');
const J = (x) => JSON.stringify(x);

const GATE_JOURNAL = 'MCP Gate 7b4 (safe to delete)';
const results = [];
function check(n, desc, pass, detail) {
  results.push({ n, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}. ${desc}`);
  if (detail !== undefined) console.log(`        ${detail}`);
}
const oneWarning = (list, ...frags) => (list ?? []).some((x) => frags.every((f) => x.includes(f)));

let JID = null;
let ERA = null;
let EVENT = null;
let LORE = null;

(async () => {
  console.log('=== 7b.4 gate: set-quest-counter ===\n');

  // ---- fixture -----------------------------------------------------------------------
  const all = (await call('list-journals', {})).journals.find((j) => j.name === GATE_JOURNAL);
  if (all) {
    JID = all.id;
    const pages = (await call('list-journals', { journalId: JID })).allPages;
    ERA = pages.find((p) => p.name === 'Gate4 Era')?.id;
    EVENT = pages.find((p) => p.name === 'Gate4 Event')?.id;
    LORE = pages.find((p) => p.name === 'Gate4 Lore')?.id;
    console.log(`reusing fixture ${JID}`);
  } else {
    const era = await call('create-simple-quest-page', {
      type: 'simple-quest.era',
      name: 'Gate4 Era',
      folder: 'Timeline',
      journalName: GATE_JOURNAL,
      system: { eraStart: 0, eraEnd: 100 },
      text: '<p>Era body, no counters of its own.</p>',
    });
    if (!era?.success) {
      console.log('FIXTURE FAILED: ' + J(era).slice(0, 400));
      process.exit(1);
    }
    JID = era.journalId;
    ERA = era.pageId;
    // The counter is declared in the EVENT body — the whole point of the cycle.
    const ev = await call('create-simple-quest-page', {
      type: 'simple-quest.event',
      name: 'Gate4 Event',
      journalId: JID,
      system: { year: 50 },
      text: '<p>Bribes paid: @COUNT[gold]{10} and standing @REPUTATION[guild]{0,5}</p>',
    });
    EVENT = ev.pageId;
    const lore = await call('create-simple-quest-page', {
      type: 'simple-quest.lore',
      name: 'Gate4 Lore',
      journalId: JID,
      text: '<p>Single-view page: @COUNT[relics]{3}</p>',
    });
    LORE = lore.pageId;
    console.log(`built fixture ${JID}`);
  }

  const freshness = await call('set-quest-counter', {
    journalId: JID,
    pageId: LORE,
    counterId: 'relics',
  });
  if (freshness?.__isError || freshness?.success === undefined) {
    console.log('STALE MODULE — setQuestCounter is not registered in the browser.');
    console.log('  ' + String(freshness?.__raw ?? J(freshness)).slice(0, 250));
    console.log('  Refresh Foundry (F5) and re-run. Not reporting a gate result on stale code.');
    process.exit(2);
  }
  console.log('module is fresh');

  // Baseline. Without this the gate is first-run-only: several checks assert a `from` value
  // or an absent counter, and a previous run (or the split-brain UI demo) leaves values
  // behind. A gate that cannot be re-run cannot serve as a regression check, which is what
  // the other three in this phase are for.
  for (const [pageId, id] of [
    [LORE, 'relics'],
    [EVENT, 'gold'],
    [EVENT, 'guild'],
    [ERA, 'gold'],
    [ERA, 'relics'],
  ]) {
    await call('set-quest-counter', { journalId: JID, pageId, counterId: id, value: 0 });
  }
  console.log('counters reset to 0\n');

  const probe = await call('set-quest-counter', {
    journalId: JID,
    pageId: LORE,
    counterId: 'relics',
  });

  // 1. read-only mode writes nothing
  check(
    1,
    'omitting "value" reports the state and writes nothing',
    probe.success === true &&
      probe.wrote === false &&
      probe.currentValue === 0 &&
      J(probe.declaredHere) === J([{ kind: 'COUNT', min: 0, max: 3 }]),
    `wrote=${probe.wrote} current=${probe.currentValue} declaredHere=${J(probe.declaredHere)}`
  );

  // 2. a plain write on a single-view page: no warnings at all
  const w2 = await call('set-quest-counter', {
    journalId: JID,
    pageId: LORE,
    counterId: 'relics',
    value: 2,
  });
  const r2 = await call('set-quest-counter', { journalId: JID, pageId: LORE, counterId: 'relics' });
  check(
    2,
    'a counter on a lore page writes, reads back, and warns about nothing',
    w2.success === true &&
      w2.changedFlags?.['counters.relics']?.to === 2 &&
      r2.currentValue === 2 &&
      w2.warnings === undefined,
    `changed=${J(w2.changedFlags)} readback=${r2.currentValue} warnings=${J(w2.warnings)}`
  );

  // 3. away and back — a writer that ignored the value would pass neither half
  const away = await call('set-quest-counter', { journalId: JID, pageId: LORE, counterId: 'relics', value: 3 });
  const backw = await call('set-quest-counter', { journalId: JID, pageId: LORE, counterId: 'relics', value: 2 });
  check(
    3,
    'value moves away (2 to 3) and back (3 to 2)',
    away.changedFlags?.['counters.relics']?.from === 2 &&
      away.changedFlags?.['counters.relics']?.to === 3 &&
      backw.changedFlags?.['counters.relics']?.from === 3 &&
      backw.changedFlags?.['counters.relics']?.to === 2,
    `away=${J(away.changedFlags?.['counters.relics'])} back=${J(backw.changedFlags?.['counters.relics'])}`
  );

  // 4. THE SPLIT BRAIN: writing to an event page must SUCCEED and warn that the timeline
  //    reads the era instead, naming the era.
  const w4 = await call('set-quest-counter', {
    journalId: JID,
    pageId: EVENT,
    counterId: 'gold',
    value: 4,
  });
  check(
    4,
    'writing a counter on an EVENT page succeeds and warns that the timeline reads its ERA',
    w4.success === true &&
      w4.changedFlags?.['counters.gold']?.to === 4 &&
      oneWarning(w4.warnings, 'timeline does NOT read counters from event pages') &&
      oneWarning(w4.warnings, 'Gate4 Era'),
    `success=${w4.success} warned=${oneWarning(w4.warnings, 'timeline does NOT read counters from event pages')} namesEra=${oneWarning(w4.warnings, 'Gate4 Era')}`
  );

  // 5. and the era-scoped collision is called out too
  check(
    5,
    'the shared-counters-per-era collision is stated, not just the redirect',
    oneWarning(w4.warnings, 'shares that era', 'single counters object'),
    `warnings=${(w4.warnings ?? []).length}`
  );

  // 6. BRANCH NOT OTHERWISE TAKEN — writing the SAME id to the era must not warn about the
  //    split, and must not disturb the event's own value. Two documents, two counters.
  const w6 = await call('set-quest-counter', {
    journalId: JID,
    pageId: ERA,
    counterId: 'gold',
    value: 9,
  });
  const evAfter = await call('set-quest-counter', { journalId: JID, pageId: EVENT, counterId: 'gold' });
  check(
    6,
    'the same id on the era is a DIFFERENT counter: era=9, event still 4, no split warning',
    w6.success === true &&
      w6.changedFlags?.['counters.gold']?.to === 9 &&
      evAfter.currentValue === 4 &&
      !oneWarning(w6.warnings, 'timeline does NOT read counters from event pages'),
    `era ${J(w6.changedFlags?.['counters.gold'])} event=${evAfter.currentValue} splitWarned=${oneWarning(w6.warnings, 'timeline does NOT read counters from event pages')}`
  );

  // 7. an id declared nowhere on the page: stored, but warned that nothing displays it,
  //    and told where it IS declared.
  const w7 = await call('set-quest-counter', {
    journalId: JID,
    pageId: ERA,
    counterId: 'relics',
    value: 1,
  });
  check(
    7,
    'an id not declared in this page body is stored AND warned about, naming where it is declared',
    w7.success === true &&
      oneWarning(w7.warnings, 'is not declared in this page') &&
      oneWarning(w7.warnings, 'Gate4 Lore'),
    `warned=${oneWarning(w7.warnings, 'is not declared in this page')} pointsAtLore=${oneWarning(w7.warnings, 'Gate4 Lore')}`
  );

  // 8. above the declared maximum: stored, warned, and the wrap explained
  const w8 = await call('set-quest-counter', {
    journalId: JID,
    pageId: LORE,
    counterId: 'relics',
    value: 15,
  });
  check(
    8,
    'a value above the declared max is stored and warned, with the wrap-to-zero explained',
    w8.success === true && oneWarning(w8.warnings, 'above the maximum 3', 'wraps to 0'),
    `warnings=${J(w8.warnings).slice(0, 190)}`
  );
  await call('set-quest-counter', { journalId: JID, pageId: LORE, counterId: 'relics', value: 2 });

  // 9. @REPUTATION shares the counters namespace, and its {min,max} is parsed
  const w9 = await call('set-quest-counter', {
    journalId: JID,
    pageId: EVENT,
    counterId: 'guild',
    value: 7,
  });
  check(
    9,
    '@REPUTATION is parsed for its own min/max and shares the counters object with @COUNT',
    w9.success === true &&
      J(w9.declaredHere) === J([{ kind: 'REPUTATION', min: 0, max: 5 }]) &&
      oneWarning(w9.warnings, 'above the maximum 5') &&
      w9.allCountersOnPage?.gold === 4,
    `declaredHere=${J(w9.declaredHere)} allCounters=${J(w9.allCountersOnPage)}`
  );

  // 10. two ids on one page do not disturb each other (the 7a.5 merge trap)
  const w10 = await call('set-quest-counter', {
    journalId: JID,
    pageId: EVENT,
    counterId: 'gold',
    value: 6,
  });
  check(
    10,
    'writing one counter leaves the other intact (object flags merge per leaf)',
    w10.allCountersOnPage?.gold === 6 && w10.allCountersOnPage?.guild === 7,
    `allCounters=${J(w10.allCountersOnPage)}`
  );

  // 11. refusals: a dotted id, and a non-numeric value
  const bad1 = await call('set-quest-counter', { journalId: JID, pageId: LORE, counterId: 'a.b', value: 1 });
  const bad2 = await call('set-quest-counter', { journalId: JID, pageId: LORE, counterId: 'relics', value: 'five' });
  const still = await call('set-quest-counter', { journalId: JID, pageId: LORE, counterId: 'relics' });
  check(
    11,
    'a dotted id and a non-numeric value are both refused, and nothing is written',
    bad1.success === false &&
      bad1.reason === 'invalid-counter-id' &&
      bad2.success === false &&
      bad2.reason === 'invalid-value' &&
      still.currentValue === 2,
    `dotted=${J(bad1.reason)} nonNumeric=${J(bad2.reason)} relics still ${still.currentValue}`
  );

  // 12. a bad pageId names the real pages rather than failing blankly
  const bad3 = await call('set-quest-counter', { journalId: JID, pageId: 'nope', counterId: 'x', value: 1 });
  check(
    12,
    'an unknown pageId is refused and the real page ids are listed',
    bad3.success === false && String(bad3.message).includes('Gate4 Era'),
    `msg=${String(bad3.message).slice(0, 150)}`
  );

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n=== ${passed}/${results.length} ===`);
  console.log(`fixture: "${GATE_JOURNAL}" (Timeline folder) — era 0..100, event at year 50`);
  if (passed !== results.length) process.exitCode = 1;
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(1);
});
