// 7b.2 gate — containment guard on create/update. Warns, never refuses.
//
// Builds its OWN journal. The 7b.1 fixture asserts an exact orphan set, and there is no
// page-delete tool, so creating events there would permanently break that gate.
const { call } = require('./lib.cjs');
const J = (x) => JSON.stringify(x);

const GATE_JOURNAL = 'MCP Gate 7b2 (safe to delete)';
const OUTSIDE_JOURNAL = 'MCP Gate 7b2 NotATimeline (safe to delete)';
const { ensureTimelineFixture } = require('./fixtures.cjs');
let NOEND_JID = null; // 7b1pre, borrowed read-mostly for its endless era; was a hardcoded id

const results = [];
function check(n, desc, pass, detail) {
  results.push({ n, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}. ${desc}`);
  if (detail !== undefined) console.log(`        ${detail}`);
}
const oneWarning = (list, ...frags) => (list ?? []).some((x) => frags.every((f) => x.includes(f)));

let JID = null;
const mk = (type, name, system, extra = {}) =>
  call('create-simple-quest-page', { type, name, journalId: JID, system, ...extra });

(async () => {
  console.log('=== 7b.2 gate: containment guard on create/update ===\n');

  ({ journalId: NOEND_JID } = await ensureTimelineFixture());

  // ---- fixture: eras 0..100, 100..200, 300..400 (adjacent pair + a gap) --------------
  const existing = (await call('list-journals', {})).journals.find((j) => j.name === GATE_JOURNAL);
  if (existing) {
    JID = existing.id;
    console.log(`reusing fixture ${JID}`);
  } else {
    const first = await call('create-simple-quest-page', {
      type: 'simple-quest.era',
      name: 'Gate2 Era Early',
      folder: 'Timeline',
      journalName: GATE_JOURNAL,
      system: { eraStart: 0, eraEnd: 100 },
    });
    if (!first?.success) {
      console.log('FIXTURE FAILED: ' + J(first).slice(0, 400));
      process.exit(1);
    }
    JID = first.journalId;
    await mk('simple-quest.era', 'Gate2 Era Main', { eraStart: 100, eraEnd: 200 });
    await mk('simple-quest.era', 'Gate2 Era Late', { eraStart: 300, eraEnd: 400 });
    console.log(`built fixture ${JID}`);
  }

  // ---- freshness probe ---------------------------------------------------------------
  const probe = await mk('simple-quest.event', `Gate2 Contained ${Date.now()}`, { year: 150 });
  if (probe?.success !== true) {
    console.log('HARNESS: probe create failed: ' + J(probe).slice(0, 300));
    process.exit(1);
  }
  if (probe.timeline === undefined) {
    console.log('STALE MODULE — create returned no "timeline" block.');
    console.log('  Refresh Foundry (F5) and re-run. Not reporting a gate result on stale code.');
    process.exit(2);
  }
  console.log('module is fresh\n');

  // 1. happy path: contained, named, and silent
  check(
    1,
    'an event created inside an era reports contained + the era, with no warnings',
    probe.timeline.contained === true &&
      probe.timeline.era === 'Gate2 Era Main' &&
      probe.timeline.warnings === undefined,
    `contained=${probe.timeline.contained} era=${J(probe.timeline.era)} warnings=${J(probe.timeline.warnings)}`
  );

  // 2. THE POINT OF THE CYCLE — uncontained must SUCCEED and WARN. A refusal here would
  //    fail the workflow, so the check is that it wrote AND reported, not that it blocked.
  const orphan = await mk('simple-quest.event', `Gate2 Orphan ${Date.now()}`, { year: 250 });
  check(
    2,
    'an event dated in no era is created successfully AND warned about',
    orphan.success === true &&
      !!orphan.pageId &&
      orphan.timeline.contained === false &&
      oneWarning(orphan.timeline.warnings, 'will NOT appear on the timeline'),
    `success=${orphan.success} pageCreated=${!!orphan.pageId} contained=${orphan.timeline?.contained} reason=${J(orphan.timeline?.reason).slice(0, 120)}`
  );

  // 3. the exclusive-end boundary, now on the write path. Adjacent eras 0..100 / 100..200
  //    make this able to fail: year 100 must land in Main, not Early.
  const onEnd = await mk('simple-quest.event', `Gate2 OnEnd ${Date.now()}`, { year: 200 });
  const onStart = await mk('simple-quest.event', `Gate2 OnStart ${Date.now()}`, { year: 100 });
  check(
    3,
    'year 200 (an exclusive eraEnd) warns; year 100 (an eraStart) lands in the LATER era, silently',
    onEnd.timeline.contained === false &&
      onStart.timeline.contained === true &&
      onStart.timeline.era === 'Gate2 Era Main' &&
      onStart.timeline.warnings === undefined,
    `200 -> contained=${onEnd.timeline.contained} ; 100 -> contained=${onStart.timeline.contained} era=${J(onStart.timeline.era)}`
  );

  // 4. a yearless event is CONTAINED and still warned — not excluded, silently dated to 0.
  const noYear = await mk('simple-quest.event', `Gate2 NoYear ${Date.now()}`, {});
  check(
    4,
    'a yearless event is reported contained AND warned that null is being read as year 0',
    noYear.success === true &&
      noYear.timeline.contained === true &&
      noYear.timeline.era === 'Gate2 Era Early' &&
      noYear.timeline.year === null &&
      oneWarning(noYear.timeline.warnings, 'compares null as 0'),
    `contained=${noYear.timeline.contained} era=${J(noYear.timeline.era)} warned=${oneWarning(noYear.timeline.warnings, 'compares null as 0')}`
  );

  // 5. UPDATE path, away and back. A guard that always warns proves nothing.
  const moved = await call('update-simple-quest-page', {
    journalId: JID,
    pageId: probe.pageId,
    system: { year: 250 },
  });
  const back = await call('update-simple-quest-page', {
    journalId: JID,
    pageId: probe.pageId,
    system: { year: 150 },
  });
  check(
    5,
    'moving an event out of every era warns; moving it back clears the warning',
    moved.success === true &&
      moved.timeline.contained === false &&
      oneWarning(moved.timeline.warnings, 'will NOT appear on the timeline') &&
      back.success === true &&
      back.timeline.contained === true &&
      back.timeline.warnings === undefined,
    `out: contained=${moved.timeline?.contained} warned=${!!moved.timeline?.warnings} ; back: contained=${back.timeline?.contained} warned=${!!back.timeline?.warnings}`
  );

  // 6. writing an ERA reports its own layout problem and the journal's stranded events.
  //    Uses the 7b1pre endless era; only its colour is touched, and it is put back.
  const noEndEra = (await call('get-timeline', { journalId: NOEND_JID })).eras.find(
    (e) => e.name === 'Gate Era NoEnd'
  );
  const eraW = await call('update-simple-quest-page', {
    journalId: NOEND_JID,
    pageId: noEndEra.id,
    system: { color: '#ff0001' },
  });
  await call('update-simple-quest-page', {
    journalId: NOEND_JID,
    pageId: noEndEra.id,
    system: { color: '#ff0000' },
  });
  check(
    6,
    'writing the endless era surfaces its own null-end problem and lists the stranded events',
    eraW.success === true &&
      eraW.timeline.eraEnd === null &&
      eraW.timeline.displayedEnd === 400 &&
      oneWarning(eraW.timeline.warnings, 'Gate Era NoEnd', 'has no eraEnd') &&
      oneWarning(eraW.timeline.warnings, 'still land in no era'),
    `eraEnd=${J(eraW.timeline?.eraEnd)} displayedEnd=${J(eraW.timeline?.displayedEnd)} warnings=${(eraW.timeline?.warnings ?? []).length}`
  );

  // 7. BRANCH NOT OTHERWISE TAKEN — a non-timeline page type gets no timeline block at all.
  const quest = await mk('simple-quest.quest', `Gate2 Quest ${Date.now()}`, undefined, {
    text: '<p>body</p>',
  });
  check(
    7,
    'a quest page gets no timeline block (the guard is scoped to era/event)',
    quest.success === true && quest.timeline === undefined,
    `timeline=${J(quest.timeline)}`
  );

  // 8. an event written into a journal outside the Timeline folder. Its own throwaway
  //    journal in Quests — never a real Simple Quest content journal.
  const outside = await call('create-simple-quest-page', {
    type: 'simple-quest.event',
    name: `Gate2 OutsideFolder ${Date.now()}`,
    folder: 'Quests',
    journalName: OUTSIDE_JOURNAL,
    system: { year: 150 },
  });
  check(
    8,
    'an event written outside the Timeline folder warns that nothing there renders',
    outside.success === true &&
      outside.timeline.journalIsTimeline === false &&
      oneWarning(outside.timeline.warnings, 'not in the Simple Quest timeline folder'),
    `journalIsTimeline=${outside.timeline?.journalIsTimeline} warned=${oneWarning(outside.timeline?.warnings, 'not in the Simple Quest timeline folder')}`
  );

  // 9. THE REASON THE GUARD CALLS analyseTimeline INSTEAD OF RESTATING CONTAINMENT:
  //    the write path and the read path must never disagree about the same page.
  const t = await call('get-timeline', { journalId: JID });
  const readOrphans = new Set((t.orphanedEvents ?? []).map((e) => e.name));
  const saidOrphan = [orphan, onEnd].map((r) => r.pageName);
  const saidPlaced = [probe, onStart, noYear].map((r) => r.pageName);
  check(
    9,
    'every page the write path called orphaned is orphaned in get-timeline, and vice versa',
    saidOrphan.every((n) => readOrphans.has(n)) && saidPlaced.every((n) => !readOrphans.has(n)),
    `writeOrphan=${J(saidOrphan)} writePlaced=${J(saidPlaced)} readOrphans=${J([...readOrphans])}`
  );

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n=== ${passed}/${results.length} ===`);
  console.log(`fixtures: "${GATE_JOURNAL}" (Timeline folder) and "${OUTSIDE_JOURNAL}" (Quests)`);
  if (passed !== results.length) process.exitCode = 1;
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(1);
});
