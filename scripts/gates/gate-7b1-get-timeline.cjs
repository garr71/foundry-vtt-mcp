// 7b.1 gate — get-timeline. Expected values derived by hand from Timeline.js L117,
// so the gate asserts predictions rather than echoing whatever the tool returns.
const { call } = require('./lib.cjs');
const {
  TIMELINE_FIXTURE,
  ensureTimelineFixture,
  ensureNonTimelineJournal,
  ensureSecondTimelineJournal,
} = require('./fixtures.cjs');
const J = (x) => JSON.stringify(x);

// Resolved at run time. These were hardcoded ids until 2026-08-22, which quietly turned the
// gate into a one-off the moment the world was rebuilt.
let JID = null;
let OUTSIDE_JID = null;

const results = [];
function check(n, desc, pass, detail) {
  results.push({ n, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}. ${desc}`);
  if (detail !== undefined) console.log(`        ${detail}`);
}
const byName = (arr, n) => (arr ?? []).find((x) => x.name === n);
// Match within ONE warning. Joining them and running a regex across the lot lets fragments
// from different warnings satisfy the same pattern — that produced a false FAIL first run.
const oneWarning = (list, ...frags) =>
  (list ?? []).some((x) => frags.every((f) => x.includes(f)));

(async () => {
  console.log('=== 7b.1 gate: get-timeline ===\n');

  ({ journalId: JID } = await ensureTimelineFixture());
  OUTSIDE_JID = await ensureNonTimelineJournal();
  await ensureSecondTimelineJournal();
  console.log(`fixture ${JID}\n`);

  const t = await call('get-timeline', { journalId: JID });
  if (t?.__isError || t?.success === undefined) {
    console.log('STALE MODULE — foundry-mcp-bridge.getTimeline is not registered in the browser.');
    console.log('  ' + String(t?.__raw ?? J(t)).slice(0, 300));
    console.log('  Refresh Foundry (F5) and re-run. Not reporting a gate result on stale code.');
    process.exit(2);
  }
  console.log('module is fresh\n');

  // 1. THE HEADLINE: exactly the two uncontained events are orphaned, and the
  //    eraStart-dated one is NOT. Adjacent eras make this able to fail.
  const orphanNames = (t.orphanedEvents ?? []).map((e) => e.name).sort();
  check(
    1,
    'orphanedEvents is exactly [OnEnd, Outside] — OnStart is NOT orphaned',
    J(orphanNames) === J(['Gate Event OnEnd', 'Gate Event Outside']),
    `orphaned=${J(orphanNames)}`
  );

  // 2. exclusive end, named
  const onEnd = byName(t.orphanedEvents, 'Gate Event OnEnd');
  check(
    2,
    'the eraEnd-dated event is explained as an exclusive bound, naming its era',
    /exclusive|belongs to the next era/.test(String(onEnd?.reason)) &&
      String(onEnd?.reason).includes('Gate Era A'),
    `reason=${J(onEnd?.reason)}`
  );

  // 3. eraStart is inclusive: year 100 belongs to Era A (100..200), not Era Mid (0..100)
  const onStart = byName(t.events, 'Gate Event OnStart');
  check(
    3,
    'year 100 lands in "Gate Era A" (eraStart inclusive), not "Gate Era Mid"',
    onStart?.eraName === 'Gate Era A',
    `placed in ${J(onStart?.eraName)}`
  );

  // 4. the derived null >= 0 claim, now OBSERVED: a yearless event is relocated, not orphaned
  const noYear = byName(t.events, 'Gate Event NoYear');
  check(
    4,
    'the yearless event is placed in "Gate Era Mid" (0..100), not orphaned',
    noYear?.eraName === 'Gate Era Mid' && noYear?.year === null,
    `year=${J(noYear?.year)} era=${J(noYear?.eraName)} ; orphaned? ${!!byName(t.orphanedEvents, 'Gate Event NoYear')}`
  );

  // 5. the plain gap case
  const outside = byName(t.orphanedEvents, 'Gate Event Outside');
  check(
    5,
    'the year-250 event reports no era covering it, and lists the eras',
    /no era covers year 250/.test(String(outside?.reason)),
    `reason=${J(outside?.reason).slice(0, 150)}`
  );

  // 6. era order is by eraStart
  check(
    6,
    'eras are ordered by eraStart',
    J((t.eras ?? []).map((e) => e.name)) ===
      J(['Gate Era Zero', 'Gate Era Mid', 'Gate Era A', 'Gate Era NoEnd', 'Gate Era Tail']),
    `${J((t.eras ?? []).map((e) => `${e.name}[${e.eraStart}..${e.eraEnd}]`))}`
  );

  // 7. per-era placed counts
  const counts = Object.fromEntries((t.eras ?? []).map((e) => [e.name, e.eventsPlaced]));
  check(
    7,
    'eventsPlaced per era is Zero 0, Mid 1, A 3, NoEnd 0, Tail 0',
    counts['Gate Era Zero'] === 0 &&
      counts['Gate Era Mid'] === 1 &&
      counts['Gate Era A'] === 3 &&
      counts['Gate Era NoEnd'] === 0 &&
      counts['Gate Era Tail'] === 0,
    J(counts)
  );

  // 8. layout warnings: the null-end era, the L68-vs-L117 gap on Era A — and NO overlap
  //    warning, because adjacency is not overlap.
  const w = (t.layoutWarnings ?? []).join(' || ');
  check(
    8,
    'warns on the null-end era and the 4-vs-3 sizing gap, and does NOT call adjacency an overlap',
    oneWarning(t.layoutWarnings, 'Gate Era NoEnd', 'has no eraEnd') &&
      oneWarning(t.layoutWarnings, 'Gate Era A', 'sized for 4 event(s)', 'only 3') &&
      !/overlap/i.test(w),
    `${(t.layoutWarnings ?? []).length} warning(s):\n        - ` +
      (t.layoutWarnings ?? []).join('\n        - ').slice(0, 1200)
  );

  // 9. axis flags fall back to Simple Quest's own defaults when unset
  const c = t.config ?? {};
  check(
    9,
    'unset axis flags report SQ defaults (10 / false / BC / AC / false / always)',
    c.timeScale === 10 &&
      c.effectiveTimeScale === 10 &&
      c.dynamicTimeScale === false &&
      c.negativeAbb === 'BC' &&
      c.positiveAbb === 'AC' &&
      c.showMinus === false &&
      c.content === 'always',
    J(c)
  );

  // 10. folder membership, positive and negative
  const outsideT = await call('get-timeline', { journalId: OUTSIDE_JID });
  check(
    10,
    'inTimelineFolder true here, false for a journal in Quests (with a renderWarning)',
    t.inTimelineFolder === true &&
      outsideT.inTimelineFolder === false &&
      typeof outsideT.renderWarning === 'string',
    `fixture=${t.inTimelineFolder} control=${outsideT.inTimelineFolder} warn=${String(outsideT.renderWarning).slice(0, 110)}`
  );

  // 11. ANTI-SILENT-DEFAULT: with several timeline journals and no identifier, refuse and list.
  const noArg = await call('get-timeline', {});
  check(
    11,
    'no identifier + several timeline journals => refuses and lists them',
    noArg.success === false &&
      Array.isArray(noArg.timelineJournals) &&
      noArg.timelineJournals.length >= 2,
    `success=${noArg.success} journals=${J((noArg.timelineJournals ?? []).map((x) => x.name))}`
  );

  // 12. exact-name resolution, and a substring that must NOT match
  const byname = await call('get-timeline', { journalName: TIMELINE_FIXTURE });
  const miss = await call('get-timeline', { journalName: TIMELINE_FIXTURE.slice(0, 16) });
  check(
    12,
    'journalName matches exactly and refuses a substring',
    byname.success === true && byname.journalId === JID && miss.success === false,
    `exact=${byname.success} resolvedBy=${J(byname.resolvedBy)} ; substring refused=${miss.success === false}`
  );

  // 13. playerView while everything is hidden
  check(
    13,
    'playerView reports nothing visible while the journal is hidden',
    t.playerView?.visibleEras === 0 && t.playerView?.visibleEvents === 0,
    J({ eras: t.playerView?.visibleEras, events: t.playerView?.visibleEvents })
  );

  // 14. THE PLAYER-SIDE TRAP: make the journal and one event visible, leave its era hidden.
  //     SQ filters eras by permission BEFORE placing events, so the event vanishes for
  //     players while rendering fine for the GM.
  const evA = byName(t.events, 'Gate Event A');
  await call('set-journal-visibility', { journalId: JID, pageId: evA.id, visibleToPlayers: true });
  const t2 = await call('get-timeline', { journalId: JID });
  const only = t2.playerView?.orphanedForPlayersOnly ?? [];
  check(
    14,
    'an event visible to players inside a hidden era is reported as player-only orphaned',
    only.length === 1 && only[0].name === 'Gate Event A' && !!byName(t2.events, 'Gate Event A'),
    `orphanedForPlayersOnly=${J(only.map((x) => x.name))} ; still placed for GM=${!!byName(t2.events, 'Gate Event A')}`
  );

  // restore
  await call('set-journal-visibility', { journalId: JID, pageId: evA.id, visibleToPlayers: false });
  const t3 = await call('get-timeline', { journalId: JID });
  check(
    15,
    'restoring visibility clears the player-only orphan',
    (t3.playerView?.orphanedForPlayersOnly ?? []).length === 0 &&
      t3.playerView?.visibleEvents === 0,
    `visibleEvents=${t3.playerView?.visibleEvents}`
  );

  // 16-17. THE AXIS COLLAPSE. Simple Quest sizes an era with no eraEnd as (0 - eraStart),
  //        so it takes negative height. Shrink the tail era to zero length and the total
  //        drops to 0: the columns collapse, the gradient divides by zero, scrolling dies.
  //        Away and back, because a warning that is always present proves nothing.
  const healthy = await call('get-timeline', { journalId: JID });
  await call('update-simple-quest-page', {
    journalId: JID,
    pageId: byName(healthy.eras, 'Gate Era Tail').id,
    system: { eraEnd: 400 },
  });
  const collapsed = await call('get-timeline', { journalId: JID });
  const cw = (collapsed.layoutWarnings ?? []).join(' || ');
  check(
    16,
    'zero-length tail drops totalHeight to 0 and raises the axis-collapse warning',
    healthy.totalHeight === 6000 &&
      collapsed.totalHeight === 0 &&
      /whole axis collapses/.test(cw) &&
      /Gate Era NoEnd.*-3000px/.test(cw) &&
      /zero-length/.test(cw),
    `healthy=${healthy.totalHeight}px collapsed=${collapsed.totalHeight}px ; warning present=${/whole axis collapses/.test(cw)}`
  );

  await call('update-simple-quest-page', {
    journalId: JID,
    pageId: byName(healthy.eras, 'Gate Era Tail').id,
    system: { eraEnd: 1000 },
  });
  const restored = await call('get-timeline', { journalId: JID });
  check(
    17,
    'restoring the tail era clears the collapse warning and the axis is 6000px again',
    restored.totalHeight === 6000 &&
      !/whole axis collapses/.test((restored.layoutWarnings ?? []).join(' || ')),
    `totalHeight=${restored.totalHeight} ; per-era px=${J(
      (restored.eras ?? []).map((e) => `${e.name}:${e.heightPx}`)
    )}`
  );

  // 18-19. THE TWO THINGS THE UI SHOWED THAT THE API GATE HAD MISSED.
  //        Both are about the timeline lying rather than failing, which is the whole point
  //        of this tool, so both need a check that can fail.
  const live = await call('get-timeline', { journalId: JID });
  const lw = (live.layoutWarnings ?? []).join(' || ');
  const noEnd = byName(live.eras, 'Gate Era NoEnd');
  const tail = byName(live.eras, 'Gate Era Tail');
  const zero = byName(live.eras, 'Gate Era Zero');

  check(
    18,
    'the negative era is reported as inverted, and the cursor regression that puts Gate Era Tail back at 0px is named',
    noEnd?.startPx === 3000 &&
      noEnd?.endPx === 0 &&
      tail?.startPx === 0 &&
      oneWarning(live.layoutWarnings, 'Gate Era NoEnd', 'inverted') &&
      oneWarning(live.layoutWarnings, 'Gate Era Tail" now starts at 0px'),
    `NoEnd ${noEnd?.startPx}px -> ${noEnd?.endPx}px ; Tail starts at ${tail?.startPx}px (Zero occupies ${zero?.startPx}-${zero?.endPx})`
  );

  check(
    19,
    'the era with no eraEnd is reported as DISPLAYING 400 while storing null',
    noEnd?.eraEnd === null &&
      noEnd?.displayedEnd === 400 &&
      oneWarning(
        live.layoutWarnings,
        'Gate Era NoEnd',
        'DISPLAYS as ending at 400',
        'stored eraEnd is null'
      ),
    `stored=${J(noEnd?.eraEnd)} displayed=${J(noEnd?.displayedEnd)}`
  );

  // 20. BRANCH NOT OTHERWISE TAKEN — an era whose stored end already matches what it shows
  //     must NOT be flagged. Gate Era Zero stores 0 and displays 0 (the next era starts at
  //     0), so the `||` fallback lands on the same value and there is nothing to report.
  check(
    20,
    'an era whose displayed end already equals its stored end is not flagged',
    zero?.eraEnd === 0 &&
      zero?.displayedEnd === 0 &&
      !oneWarning(live.layoutWarnings, 'Gate Era Zero', 'DISPLAYS as ending'),
    `Zero stored=${J(zero?.eraEnd)} displayed=${J(zero?.displayedEnd)} ; flagged=${oneWarning(live.layoutWarnings, 'Gate Era Zero', 'DISPLAYS as ending')}`
  );

  console.log('\n--- layout warnings now reported ---');
  for (const x of live.layoutWarnings ?? []) console.log('  - ' + x);

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n=== ${passed}/${results.length} ===`);
  if (passed !== results.length) process.exitCode = 1;
})().catch((e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exit(1);
});
