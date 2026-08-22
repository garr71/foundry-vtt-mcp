// @time enforcement gate — the prohibition made real rather than documented.
// Builds its own journal so it survives a world wipe.
const { call } = require('./lib.cjs');
const J = (x) => JSON.stringify(x);

const GATE_JOURNAL = 'MCP Gate time (safe to delete)';
const results = [];
function check(n, desc, pass, detail) {
  results.push({ n, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}. ${desc}`);
  if (detail !== undefined) console.log(`        ${detail}`);
}

let JID = null;
let PAGE = null;
const CLEAN = '<p>Ordinary prose.</p><ul><li>Objective one</li></ul>';

(async () => {
  console.log('=== @time enforcement gate ===\n');

  const existing = (await call('list-journals', {})).journals.find((j) => j.name === GATE_JOURNAL);
  if (existing) {
    JID = existing.id;
    PAGE = (await call('list-journals', { journalId: JID })).allPages.find(
      (p) => p.name === 'TimeGuard Quest'
    )?.id;
    await call('update-simple-quest-page', { journalId: JID, pageId: PAGE, text: CLEAN });
    console.log(`reusing fixture ${JID}`);
  } else {
    const r = await call('create-simple-quest-page', {
      type: 'simple-quest.quest',
      name: 'TimeGuard Quest',
      folder: 'Quests',
      journalName: GATE_JOURNAL,
      text: CLEAN,
    });
    if (!r?.success) {
      console.log('FIXTURE FAILED: ' + J(r).slice(0, 400));
      process.exit(1);
    }
    JID = r.journalId;
    PAGE = r.pageId;
    console.log(`built fixture ${JID}`);
  }

  const body = async () =>
    (await call('list-journals', { journalId: JID, pageId: PAGE })).page.content;
  const pageCount = async () => (await call('list-journals', { journalId: JID })).pageCount;

  // freshness probe
  const probe = await call('update-simple-quest-page', {
    journalId: JID,
    pageId: PAGE,
    text: '<p>@time[100/1/1]</p>',
  });
  if (probe?.success !== false || probe?.reason !== 'forbidden-enricher') {
    console.log('STALE MODULE — the @time guard is not running in the browser.');
    console.log('  got: ' + J(probe).slice(0, 250));
    console.log('  Refresh Foundry (F5) and re-run. Not reporting a gate result on stale code.');
    process.exit(2);
  }
  console.log('module is fresh\n');

  // 1. update refused AND the body is untouched
  check(
    1,
    'update-simple-quest-page refuses @time and leaves the body untouched',
    probe.success === false &&
      probe.reason === 'forbidden-enricher' &&
      J(probe.rejected).includes('@time[100/1/1]') &&
      (await body()) === CLEAN,
    `rejected=${J(probe.rejected)} body unchanged=${(await body()) === CLEAN}`
  );

  // 2. the refusal separates the DECISION from the module's detected state — the mistake
  //    Simple Timekeeping's own config makes (config.js L202 hardcodes the system id).
  check(
    2,
    'the message states the decision AND reports the module state separately',
    /by project decision/.test(String(probe.message)) &&
      /(module is not active|module is currently ACTIVE)/.test(String(probe.message)),
    `msg=${String(probe.message).slice(0, 210)}`
  );

  // 3. create refused, and no page is created
  const before3 = await pageCount();
  const c3 = await call('create-simple-quest-page', {
    type: 'simple-quest.lore',
    name: 'TimeGuard ShouldNotExist',
    journalId: JID,
    text: '<p>On @time[250/6/2, 14:00] the gate opened.</p>',
  });
  check(
    3,
    'create-simple-quest-page refuses @time AND creates no page',
    c3.success === false && c3.reason === 'forbidden-enricher' && (await pageCount()) === before3,
    `success=${c3.success} pages ${before3} -> ${await pageCount()}`
  );

  // 4. set-quest-progress appendObjectives is a body write too, and is guarded
  const p4 = await call('set-quest-progress', {
    journalId: JID,
    pageId: PAGE,
    appendObjectives: ['Meet the envoy on @time[300/1/1]'],
  });
  check(
    4,
    'set-quest-progress refuses @time in appendObjectives, appending nothing',
    p4.success === false && p4.reason === 'forbidden-enricher' && (await body()) === CLEAN,
    `success=${p4.success} rejected=${J(p4.rejected)} body unchanged=${(await body()) === CLEAN}`
  );

  // 5. the generic journal writers are guarded as well
  const journalsBefore = (await call('list-journals', {})).journals.length;
  const c5 = await call('create-quest-journal', {
    questTitle: 'TimeGuard ShouldNotExist Journal',
    questDescription: 'Signed @time[400/2/2].',
  });
  const journalsAfter = (await call('list-journals', {})).journals.length;
  // update-quest-journal needs a plain TEXT page: pointed at the Simple Quest fixture it
  // hits the pre-existing unreadable-page-type guard first and never reaches this one.
  const TEXTJ = 'MCP Gate time text (safe to delete)';
  let textJid = (await call('list-journals', {})).journals.find((x) => x.name === TEXTJ)?.id;
  if (!textJid) {
    const mk = await call('create-quest-journal', {
      questTitle: TEXTJ,
      questDescription: 'Clean body, no forbidden enrichers.',
    });
    textJid = mk.journalId;
  }
  const textBefore = (await call('list-journals', { journalId: textJid })).content;
  const u5 = await call('update-quest-journal', {
    journalId: textJid,
    newContent: '<p>@time[500/3/3]</p>',
    updateType: 'progress',
  });
  const textAfter = (await call('list-journals', { journalId: textJid })).content;
  check(
    5,
    'create-quest-journal and update-quest-journal both refuse @time',
    c5.success === false &&
      c5.reason === 'forbidden-enricher' &&
      journalsAfter === journalsBefore &&
      u5.success === false &&
      u5.reason === 'forbidden-enricher' &&
      textAfter === textBefore,
    `create=${c5.success}/${J(c5.reason)} journals ${journalsBefore}->${journalsAfter} ; update=${u5.success}/${J(u5.reason)}`
  );

  // 6. BRANCH NOT OTHERWISE TAKEN — other enrichers must still be ACCEPTED. A guard that
  //    refused every write would pass checks 1-5 and fail only here.
  const ok6 = '<p>Paid @COUNT[gold]{10}, see @UUID[JournalEntry.abc]{Notes}.</p><ul><li>Objective one</li></ul>';
  const c6 = await call('update-simple-quest-page', { journalId: JID, pageId: PAGE, text: ok6 });
  check(
    6,
    'other enrichers (@COUNT, @UUID) are still accepted',
    c6.success === true && (await body()) === ok6,
    `success=${c6.success} msg=${String(c6.message ?? '').slice(0, 90)}`
  );

  // 7. words that merely start with "time" must not be caught by the pattern
  const ok7 = '<p>The @timeline[x] tag and the word sometimes.</p><ul><li>Objective one</li></ul>';
  const c7 = await call('update-simple-quest-page', { journalId: JID, pageId: PAGE, text: ok7 });
  check(
    7,
    '"@timeline[x]" and the word "sometimes" are not mistaken for @time',
    c7.success === true && (await body()) === ok7,
    `success=${c7.success} rejected=${J(c7.rejected)}`
  );

  // 8. a MALFORMED @time is refused too — it never matches the module's own pattern, so it
  //    renders as raw text, which is just as visible to players.
  const c8 = await call('update-simple-quest-page', {
    journalId: JID,
    pageId: PAGE,
    text: '<p>Broken @time[not-a-date and unclosed</p>',
  });
  check(
    8,
    'a malformed @time is refused as well (it would render as raw text)',
    c8.success === false && c8.reason === 'forbidden-enricher',
    `success=${c8.success} rejected=${J(c8.rejected)}`
  );

  await call('update-simple-quest-page', { journalId: JID, pageId: PAGE, text: CLEAN });

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n=== ${passed}/${results.length} ===`);
  if (passed !== results.length) process.exitCode = 1;
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(1);
});
