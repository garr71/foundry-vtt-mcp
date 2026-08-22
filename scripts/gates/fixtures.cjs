// Shared gate fixtures.
//
// Every gate builds what it needs and reuses it if it is already there, so the suite runs
// on a freshly imported world. Two gates used to hardcode a journal id, which meant they
// silently stopped being regression checks the moment the world was rebuilt — a gate that
// cannot be re-run is a one-off verification wearing a gate's clothes.
const { call } = require('./lib.cjs');

const TIMELINE_FIXTURE = 'MCP Gate Timeline (safe to delete)';

/**
 * The timeline fixture used by the get-timeline, coercion and timeline-config gates.
 *
 * Deliberately ugly. Every value in it exists to make some check able to fail:
 *
 * - eras `-100..0`, `0..100` and `100..200` are **adjacent**, which is the only arrangement
 *   that distinguishes an inclusive era start from an exclusive era end. A fixture with gaps
 *   between eras passes either way and proves nothing.
 * - `Gate Era NoEnd` (`300..null`) has no end, so it is sized `(0 - 300)` and takes negative
 *   height — it drags the layout cursor backwards and, on its own, drops the axis to zero.
 * - `Gate Era Tail` (`400..1000`) exists solely to keep the total height positive so the
 *   timeline still scrolls. Shrinking it to zero length is how the axis-collapse check is
 *   provoked.
 * - events at 100 (on an eraStart, contained), 150 twice, 200 (on an exclusive eraEnd,
 *   orphaned), 250 (outside every era, orphaned) and one with no year at all (relocated to
 *   the era spanning zero rather than excluded).
 *
 * Returns `{ journalId, pages }` where `pages` maps page name to id.
 */
async function ensureTimelineFixture() {
  const journals = (await call('list-journals', {})).journals ?? [];
  let journalId = journals.find(j => j.name === TIMELINE_FIXTURE)?.id;

  const wanted = [
    ['simple-quest.era', 'Gate Era Zero', { eraStart: -100, eraEnd: 0 }],
    ['simple-quest.era', 'Gate Era Mid', { eraStart: 0, eraEnd: 100 }],
    ['simple-quest.era', 'Gate Era A', { eraStart: 100, eraEnd: 200 }],
    ['simple-quest.era', 'Gate Era NoEnd', { eraStart: 300 }],
    ['simple-quest.era', 'Gate Era Tail', { eraStart: 400, eraEnd: 1000 }],
    ['simple-quest.event', 'Gate Event OnStart', { year: 100 }],
    ['simple-quest.event', 'Gate Event A', { year: 150 }],
    ['simple-quest.event', 'Gate Event Frac', { year: 150 }],
    ['simple-quest.event', 'Gate Event OnEnd', { year: 200 }],
    ['simple-quest.event', 'Gate Event Outside', { year: 250 }],
    ['simple-quest.event', 'Gate Event NoYear', {}],
  ];

  if (!journalId) {
    const [type, name, system] = wanted[0];
    const first = await call('create-simple-quest-page', {
      type,
      name,
      system,
      folder: 'Timeline',
      journalName: TIMELINE_FIXTURE,
    });
    if (!first?.success) {
      throw new Error('could not build the timeline fixture: ' + JSON.stringify(first).slice(0, 400));
    }
    journalId = first.journalId;
  }

  let present = (await call('list-journals', { journalId })).allPages ?? [];
  for (const [type, name, system] of wanted) {
    if (present.some(p => p.name === name)) continue;
    const r = await call('create-simple-quest-page', { type, name, system, journalId });
    if (!r?.success) {
      throw new Error(`could not create "${name}": ` + JSON.stringify(r).slice(0, 300));
    }
  }

  // A quest page, for the checks that need objectives, a status field and an html block.
  if (!present.some(p => p.name === 'Gate Coerce Quest')) {
    await call('create-simple-quest-page', {
      type: 'simple-quest.quest',
      name: 'Gate Coerce Quest',
      journalId,
      text: '<p>body</p><ul><li>Obj one</li></ul>',
    });
  }

  present = (await call('list-journals', { journalId })).allPages ?? [];
  const pages = Object.fromEntries(present.map(p => [p.name, p.id]));

  // Reset the values the gates move around, so each run starts from a known state. Without
  // this the suite is first-run-only: several checks assert a `from` value.
  await call('update-simple-quest-page', {
    journalId,
    pageId: pages['Gate Event Frac'],
    system: { year: 150 },
  });
  await call('update-simple-quest-page', {
    journalId,
    pageId: pages['Gate Era A'],
    system: { eraStart: 100, eraEnd: 200, color: '#ff0000' },
  });
  await call('update-simple-quest-page', {
    journalId,
    pageId: pages['Gate Era Tail'],
    system: { eraStart: 400, eraEnd: 1000 },
  });
  await call('set-timeline-config', {
    journalId,
    timeScale: 10,
    dynamicTimeScale: false,
    negativeAbb: 'BC',
    positiveAbb: 'AC',
    showMinus: false,
    content: 'always',
  });

  return { journalId, pages, name: TIMELINE_FIXTURE };
}

/**
 * A journal that is NOT in the Timeline folder, used as the negative control for
 * `inTimelineFolder`. Built rather than borrowed: pointing this at a real Simple Quest
 * content journal would mean the gate depends on the campaign.
 */
async function ensureNonTimelineJournal() {
  const NAME = 'MCP Gate NotATimeline (safe to delete)';
  const journals = (await call('list-journals', {})).journals ?? [];
  const found = journals.find(j => j.name === NAME);
  if (found) return found.id;

  const r = await call('create-simple-quest-page', {
    type: 'simple-quest.lore',
    name: 'NotATimeline Lore',
    folder: 'Quests',
    journalName: NAME,
    text: '<p>Control: this journal is deliberately outside the Timeline folder.</p>',
  });
  if (!r?.success) {
    throw new Error('could not build the non-timeline control: ' + JSON.stringify(r).slice(0, 300));
  }
  return r.journalId;
}

/**
 * A second timeline journal, so the "refuse to guess between several" checks have something
 * to be ambiguous about. Returns nothing useful; its existence is the point.
 */
async function ensureSecondTimelineJournal() {
  const NAME = 'MCP Gate 7b2 (safe to delete)';
  const journals = (await call('list-journals', {})).journals ?? [];
  if (journals.some(j => j.name === NAME)) return;
  await call('create-simple-quest-page', {
    type: 'simple-quest.era',
    name: 'Gate2 Era Early',
    folder: 'Timeline',
    journalName: NAME,
    system: { eraStart: 0, eraEnd: 100 },
  });
}

module.exports = {
  TIMELINE_FIXTURE,
  ensureTimelineFixture,
  ensureNonTimelineJournal,
  ensureSecondTimelineJournal,
};
