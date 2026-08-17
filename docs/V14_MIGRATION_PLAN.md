# Foundry v14 Migration + Upstream Re-Sync Plan

> **Purpose:** Re-fork cleanly onto current upstream (Foundry **v14** + native **pf2e** adapter),
> then re-port our system-agnostic custom tools on top, one phase at a time.
> Pivoting from sf2e → **pf2e**, so the sf2e-specific code is deferred.
>
> This file is the source of truth for resuming after breaks. Update the **Status** column
> as we complete each phase.
>
> _Revision 7, 2026-08-15. Port inventory rebuilt by method-level audit
> ([`scripts/port-audit/`](../scripts/port-audit/)), not by reading commit messages._
>
> **What changed in revision 7 (2026-08-15):** Phase 4 **gate PASSED**, with **zero fix cycles on
> the ported code** against a Med-High budget of one to two. The only thing that blocked the gate
> was an unrelated pre-existing crash: the backend's control channel never attached an `error`
> listener to its connection sockets, so an abruptly-killed Claude Desktop wrapper took the whole
> process down. Fixed, and **verified by reproducing the RST rather than by assuming**. That also
> falsified a Phase R note and showed the Phase R mitigation does not prevent it. The gate itself
> produced the best fixture in the project so far — a diagonal distance where three candidate
> algorithms give three different numbers — and resolved its own "cannot determine" on `level`
> via `??` semantics.
>
> **What changed in revision 6:** Phase 4 is deployed and awaiting its gate. The phase was budgeted
> **Med-High almost entirely on `grid.measurePath`**, and reading the v14 source first showed the API
> is intact — the risk was retired before a line was written, which is the whole point of the Phase 2
> rule. What the same check _did_ find was the recurring failure mode a fourth time:
> `Actor#statuses` is a `Set`, which JSON-serialises to `{}`, so the ported `conditions` field would
> have been empty on every token forever. That one was broken on `master` too, not v14 drift.
> All three surfaces shipped in one deploy, setting aside the one-tool cadence deliberately.
>
> **What changed in revision 5:** Phase 2 is done and gate-passed. It is the first phase where a
> **faithful** re-port would have shipped broken code: `getRecentChat` reads the `ChatMessage`
> document directly, and v14 removed `ChatMessage#user` with no deprecation shim. Caught by reading
> the installed v14 client source, whose location is now recorded in Phase 2. The standing "verify
> against the installed module" rule is generalised to core Foundry. The gate also produced a
> second rule the hard way — the designed fixture could not discriminate, because the server-side
> formatter re-merged the two fields it was built to separate; **check the whole path from source
> field to printed output before trusting a fixture.** Stale Phase 2 → Phase 7a cross-references
> cleaned up after the 2026-08-13 rescope.
>
> **What changed in revision 4:** Phase R is done. The shared-file inventory went from 3 entries
> to 8; four were missing, one of which (`buildRollFormula`) had already shipped as a live
> correctness bug and another (`extractTokenActorStats`) would have broken Phase 4. Phase 1.5 is
> new. `2eb4d39` is confirmed redundant. The audit tooling is now in the repo so this is
> repeatable on the next re-sync.

---

## Context Snapshot

|         | Old `master` (sf2e era) | `v14-port` (reference)    | **`v14-port-v083` (new work)** | Upstream `master` |
| ------- | ----------------------- | ------------------------- | ------------------------------ | ----------------- |
| Version | 0.7.0                   | 0.8.2                     | **0.8.3**                      | 0.8.3 + 3 PRs     |
| Foundry | v13                     | v14                       | v14                            | v14               |
| Base    | fork @ `62cd3fb`        | tag `v0.8.2` (`dba53ec`)  | `8270992` (upstream tip)       | `8270992`         |
| Role    | port source (our tools) | port source (Phase 1 ref) | **the branch we build on**     | base              |

- **Old Foundry v13 data:** `D:\FoundryVTTdata` (legacy `foundry-mcp-bridge` lives here)
- **New Foundry v14 data:** `D:\FoundryData-Paizo` (pf2e/sf2e; the module goes here)
- **Installed MCP server:** `C:\Users\Franklin Figueroa\AppData\Local\FoundryMCPServer\`
- **Simple Quest:** v13 world has **3.0.20**, v14 world has **5.1.4** (breaking, see Phase 7a)

### Strategy decisions

1. **Always re-port onto upstream. Never merge upstream into our line.** _(Unified in revision 3.)_
   Our fork is a thin layer of ~10 tools over a large upstream codebase that reformats aggressively
   and rewrites shared files. Re-porting keeps history linear and every conflict hand-resolved with
   full understanding, instead of asking git to reconcile our additions against thousand-line
   upstream rewrites. Revision 2 briefly carved out an exception for merging into `v14-port`;
   that exception is withdrawn.
2. **Keep all our tools, defer the sf2e adapter.** Upstream's pf2e adapter covers pf2e play.
3. **Carry upstream's unused systems, do not delete them.** mgt2e / wfrp4e / dnd5e code costs
   nothing at runtime. Deleting it buys a permanent conflict on every future re-sync.
4. **Nothing is re-derived.** Every port has an exact reference diff on `master` or `v14-port`.
   "Re-port" means copying known-good code onto a new base, not rewriting from memory.

### Matched-pair rule (critical)

The Foundry **module** and the MCP **server** share a WebSocket protocol. They must be the same
lineage, stock+stock or ours+ours. Never mix our server with a stock module or vice versa.
**Any phase that changes either side requires a full rebuild + redeploy of both.**

---

## What is sf2e-specific vs. agnostic (why the pivot is cheap)

- **Genuinely sf2e-only (~870 lines, DEFERRED):**
  - `packages/mcp-server/src/systems/sf2e/` (adapter 271 + filters 139 + index-builder 189)
  - `buildSF2eIndex`, `extractSF2eCreatureData`, `extractSF2eDataFromPack`, `sf2eCreatureTraits`,
    `SF2eCreatureIndex` in `data-access.ts`
  - Made redundant for pf2e by upstream's pf2e adapter + pf2e creature index.
- **System-agnostic (PORT THESE):** combat read, chat read/send, token distances, hidden-token
  visibility, playlist control, journal/handout display, Simple Quest integration,
  **roll modifiers**.
  Roll-modifier and stat-block code mentions sf2e only inside shared `pf2e || sf2e` branches,
  and pf2e is the primary path, so **neither needs an sf2e-specific rewrite**.

  > **⚠️ Correction (revision 4, 2026-08-12).** Revision 3 ended that sentence with "so it works
  > as-is", which was read as _"needs no action"_. Wrong on both counts. "Works as-is" only meant
  > the code needs no sf2e-specific rewrite — it still has to be **ported**, because we re-forked
  > onto stock upstream in Phase R and stock upstream never had our fix.
  > The stat-block half was scheduled anyway (Phase 4, 42 ln); the **roll-modifier half was
  > scheduled nowhere** and fell out of the plan entirely. Proven live on 2026-08-12: a pf2e
  > Perception check rolled `1d20 + 0`. Now scheduled as **Phase 1.5**.

### The "4-file pattern" (every ported tool touches these)

1. `packages/mcp-server/src/tools/<tool>.ts` — server-side tool definition (Zod schema + description)
2. `packages/mcp-server/src/backend.ts` — register + `switch` case (server forwards query over WS)
3. `packages/foundry-module/src/queries.ts` — module-side handler on `CONFIG.queries`
4. `packages/foundry-module/src/data-access.ts` — module-side Foundry API call

Module guard for optional-module tools: `game.modules.get('<id>')?.active` (in `data-access.ts`).

---

## Port inventory (rebuilt by method-level audit, revision 4)

Ten tools, ten `data-access` methods, ten `queries.ts` handlers, ten `backend.ts` cases.
**Re-verified by audit 2026-08-12** — this half of the inventory was accurate. `backend.ts` adds
exactly the ten `switch` cases plus four tool-class registrations; `queries.ts` adds exactly the
ten matching handlers and modifies nothing upstream. **Zero tool-name collisions** with upstream's
43 tools (confirmed live against the deployed v0.8.3 backend).

The **shared-file** half was not accurate. See the next section.

| Tool (MCP name)            | Server file                          | `data-access` method    | Phase | Reference diff |
| -------------------------- | ------------------------------------ | ----------------------- | ----- | -------------- |
| `get-combat-tracker`       | `combat.ts` (new)                    | `getActiveCombat`       | 1     | `9f9cfcd` ★    |
| `read-chat`                | `chat.ts` (new)                      | `getRecentChat`         | 2     | `master`       |
| `send-chat-message`        | `journal.ts` (new)                   | `sendChatMessage`       | 2     | `master`       |
| `show-journal-to-players`  | `journal.ts` (new)                   | `showJournalToPlayers`  | 2     | `master`       |
| `set-quest-visibility`     | `journal.ts` (new)                   | `setQuestVisibility`    | 7a    | none ⚠️        |
| `set-quest-checklist-item` | `journal.ts` (new)                   | `setQuestChecklistItem` | 7a    | none ⚠️        |
| `list-playlists`           | `playlist.ts` (new)                  | `getPlaylists`          | 3     | `master`       |
| `play-playlist`            | `playlist.ts` (new)                  | `playPlaylist`          | 3     | `master`       |
| `stop-playlist`            | `playlist.ts` (new)                  | `stopPlaylist`          | 3     | `master`       |
| `get-token-distances`      | `token-manipulation.ts` (**shared**) | `getTokenDistances`     | 4     | `master`       |

★ already written and **proven on Foundry v14**; re-port onto the new base, do not re-derive.
⚠️ **not a re-port.** Simple Quest moved its state out of flags between 3.0.20 and 5.1.4, so the
`master` code is a reference for _intent_ only, not for code. Rebuilt in Phase 7a.

### Shared-file in-place edits — rebuilt from the diff, revision 4

Revisions 1-3 listed **three** of these from a reading of the commit messages. A method-level
audit of `62cd3fb..master` found **eight edits across seven upstream methods**. Four were missing
from the plan entirely. Every row below is verified absent from stock v0.8.3.

| #   | Change                                | File · upstream method                                                  | Size      | Phase   | Rev 3?          |
| --- | ------------------------------------- | ----------------------------------------------------------------------- | --------- | ------- | --------------- |
| 1   | Hidden tokens in scene read (schema)  | `scene.ts` · `handleGetCurrentScene`                                    | 2 ln      | 4       | ✅              |
| 2   | Hidden tokens default + description   | `scene.ts` · `getToolDefinitions`                                       | 4 ln      | 4       | ⚠️ undercounted |
| 3   | Full stat block (server formatter)    | `token-manipulation.ts` · `formatTokenDetails`                          | 42 ln     | 4       | ✅              |
| 4   | Full stat block (module extractor)    | `data-access.ts` · `getTokenDetails` + **new** `extractTokenActorStats` | 5 + 54 ln | 4       | ❌ **MISSING**  |
| 5   | `update-quest-journal replaceContent` | `quest-creation.ts` · `handleUpdateQuestJournal`                        | 33 ln     | 5       | ✅              |
| 6   | pf2e/sf2e roll modifiers              | `data-access.ts` · `buildRollFormula`                                   | 98 ln     | **1.5** | ❌ **MISSING**  |
| 7   | Roll-request speaker (BUG-4)          | `data-access.ts` · `requestPlayerRolls`                                 | 7 ln      | **1.5** | ❌ **MISSING**  |
| 8   | Roll-result speaker fallback          | `data-access.ts` · `attachRollButtonHandlers`                           | 1 ln      | **1.5** | ❌ **MISSING**  |

> **⚠️ Row 4 would have broken Phase 4.** Revision 3 scheduled only the _server-side_ formatter
> (row 3). Without the module-side extractor, `data-access.ts` never sends the stat data and
> `formatTokenDetails` formats a payload that does not exist. The phase would have shipped,
> tested as broken, and cost a debugging cycle to rediscover a piece we already had.

**Rows 7 and 8 explained** (both found by the audit, both real bugs we had already fixed):

```ts
// 7 — requestPlayerRolls: game.user is a User, not an Actor, so the request had no real speaker
-  speaker: ChatMessage.getSpeaker({ actor: game.user }),
+  const gmActor = (game.actors as any)?.getName('GM');   // 1) "GM" world actor
+  const requestSpeaker = gmActor ? ChatMessage.getSpeaker({ actor: gmActor })
+                                 : ChatMessage.getSpeaker(); // 2) selected token 3) Gamemaster
// 8 — attachRollButtonHandlers: getSpeaker({actor: null}) misbehaves when no character resolved
-  speaker: ChatMessage.getSpeaker({ actor: character }),
+  speaker: character ? ChatMessage.getSpeaker({ actor: character }) : { alias: rollLabel },
```

### How this inventory was rebuilt (repeat this on every future re-sync)

Git cannot show TypeScript method names in hunk headers, so `git diff` hunks appear under bare
`export class FoundryDataAccess {` and in-place edits hide inside 978 lines of additions. That is
exactly how rows 4, 6, 7 and 8 were lost. Two scripts in [`scripts/port-audit/`](../scripts/port-audit/)
solve it:

```bash
python scripts/port-audit/audit.py 62cd3fb master packages/foundry-module/src/data-access.ts
python scripts/port-audit/mdiff.py 62cd3fb master <file> <method> [<method>...]
```

`audit.py` maps every hunk to its enclosing method in the **old** file and splits the result into
_new methods_ (safe, portable as a block) versus _modified upstream methods_ (the ones that hide).
`mdiff.py` then prints a single method's before/after by brace matching.

**Rule: an inventory built from commit messages is not an inventory.** Run `audit.py` over every
shared file and reconcile before trusting a phase list.

### Verified redundant — do NOT port

| Item                                       | Evidence                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `2eb4d39` preserve `effects[]` / `flags{}` | Both sides already in stock v0.8.3: `data-access.ts` L4994-4995 and `character.ts` L633-634 |

### Confirmed sf2e-only — stays deferred

`systems/sf2e/{adapter,filters,index-builder}.ts` (599 ln) · `data-access.ts` `buildSF2eIndex`,
`extractSF2eDataFromPack`, `extractSF2eCreatureData`, the `buildEnhancedIndex` sf2e dispatch ·
`types.ts` `SystemId` union + `SF2eCreatureIndex` · the `SF2eAdapter` registration in `backend.ts`.
The audit confirms `types.ts::extractDataFromPack` is **identical** to upstream, so nothing else
in that file is ours.

> **Correction (revision 2, still current):** `journal.ts` is a single 221-line `JournalTools`
> class holding four tools. Revision 1 split those across three phases, which was not portable.
> They were re-scoped to land together in Phase 2. `quest-creation.ts` never contained
> `set-quest-visibility` or the checklist tool, so revision 1's Phase 6 was mis-scoped.
>
> **Superseded 2026-08-13:** the class splits after all, but along a different seam than revision 1
> drew — the two Simple Quest tools went to Phase 7a (module dependency), and the two core-Foundry
> tools shipped in Phase 2. The lesson holds in a sharper form: split a class by _what its tools
> depend on_, not by tool count or by which phase looks conveniently sized.

---

## Module dependency sweep (2026-08-13)

Franklin's call: **make the fork whole first, then recheck the module-dependent tools fresh.** This
sweep decides what that means concretely. It was built by grepping the port source for
`game.modules.get(...)` guards, **not** by reading the plan — the plan's prose about modules has
now been wrong three times running.

| Class                       | What it means                                                    | Items                                                                                                                                         | Where      |
| --------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Hard module dep**         | Guarded; refuses to run without the module                       | `set-quest-visibility`, `set-quest-checklist-item` (Simple Quest)                                                                             | **→ 7a**   |
| **Soft module interaction** | Core-Foundry code that misbehaves on module-managed documents    | `update-quest-journal replaceContent` on SQ quest pages                                                                                       | 5 + **7a** |
| **System-dependent**        | Depends on the _game system_ (pf2e/sf2e), not an optional module | roll modifiers (done), `extractTokenActorStats` stat block                                                                                    | 1.5, 4     |
| **No external dep**         | Core Foundry only                                                | `get-combat-tracker`, `read-chat`, `send-chat-message`, `show-journal-to-players`, all 3 playlist tools, `get-token-distances`, hidden tokens | 1-4        |

**Result: exactly two of the ten ported tools have a hard module dependency**, and both are Simple
Quest. Everything else in Phases 1-6 runs on core Foundry or on the game system, so the migration is
_almost entirely_ insulated from module churn — once those two are lifted out.

Three findings drove where the line is drawn:

1. **Only two guards exist.** `git show master:…/data-access.ts | grep 'game.modules.*get('` returns
   two hits, both `simple-quest`. No playlist, chat, journal-display or token tool touches a module.
2. **A missing guard does not mean no dependency.** `replaceContent` has no guard and still corrupts
   Simple Quest state, because the coupling runs through _document shape_, not an API call. Guards
   find hard dependencies; only reading the module finds soft ones.
3. **The game system is not a module.** pf2e work (roll modifiers, stat blocks) stays in the main
   line — the system is a hard prerequisite for playing at all, not an optional add-on that might be
   absent or four versions ahead.

**Standing rule, earned the hard way:** before porting anything that touches a third-party module,
re-verify the behaviour against the **installed** module. Not release notes, not this plan, not a
grep hit — the call site. _"The symbol still exists" is not "the behaviour still exists."_

---

## Phases

Legend: ⬜ not started · 🔄 in progress · ✅ done · ⏭️ deferred

| Phase | Goal                                                  | Files         | Risk         | Status       |
| ----- | ----------------------------------------------------- | ------------- | ------------ | ------------ |
| **R** | **Re-fork onto upstream v0.8.3 + stock baseline**     | —             | Low          | ✅ **done**  |
| 1     | Combat tracker read (re-port)                         | new           | Low          | ✅ **done**  |
| 1.5   | `request-player-rolls` repairs (rows 6-8, **missed**) | **shared**    | Low          | ✅ **done**  |
| 2     | Chat read/send + journal display                      | new ×2        | Low          | ✅ **done**  |
| 3     | Playlist control                                      | new           | Low          | ✅ **done**  |
| 4     | Token distances + hidden tokens + stat block          | **shared ×3** | **Med-High** | ✅ **done**  |
| 5     | Quest journal `replaceContent` + SQ refusal guard     | **shared**    | Med          | ✅ **done**  |
| 6     | Promote → `master` + docs                             | —             | Low          | ✅ **done**  |
| 7     | **Module-dependent** re-integration + enhancements    | new           | Med          | ⬜ _after 6_ |
| —     | sf2e adapter + sf2e index                             | sf2e          | —            | ⏭️ deferred  |

Each phase ends at a working, testable state.
**Me** = code + build + deploy. **You** = test in Foundry, report.

> **Ordering rationale:** cheap new-file phases (1, 2, 3) run before the risky shared-file phase (4).
> Phase R is the de-risking event; banking easy wins right after confirms the new base is healthy
> before we attack the phase budgeted for iteration.
>
> **Phase 1.5 breaks that ordering deliberately.** It is a shared-file phase jumped ahead of the
> new-file ones because `request-player-rolls` is the only tool that is _present and silently
> wrong_ rather than absent — it posts a confident, correctly-labelled check that rolls a bare
> `1d20`. Everything else merely does not exist yet, which is safe. This one costs you at the
> table. Its risk is low despite the shared file: three self-contained methods, exact references,
> no upstream call sites change.

### Superseded phases (revision 1 and 2)

Phase 0 (stock baseline on v0.8.2) and Phase 1 (combat tracker on v0.8.2) were **completed and
verified on Foundry v14**. Revision 2's Phase 1.5 (merge upstream into `v14-port`) was **never run**
and is withdrawn. Their work is not lost: it is the reference material for Phases R and 1 below.

---

### Phase R — Re-fork onto upstream v0.8.3 🔱 ✅ DONE (gate passed 2026-08-12)

**Goal:** Start from a clean upstream tip so every tool is ported onto one final base, exactly once.

**Why re-fork instead of merging upstream in**

- Our divergence is 4 commits, and one (`2eb4d39`) is a redundant cherry-pick of upstream's own
  `eef5e60`. The real work on `v14-port` is a single tool.
- Merging would reconcile Phase 1 against upstream's ~2,476-line `data-access.ts` rewrite, then
  Phases 2-5 would port onto the result. Re-forking ports everything onto v0.8.3 once.
- Testing cost is identical either way (both gate on the stock baseline + combat tracker).
- It restores a single strategy rule instead of two contradictory ones.

**What we get from v0.8.3**

- `getIndex()` no longer trusts `pack.indexed` (v12→v13 semantics change). **Directly on our v14 path.**
- `8546b0f`: scene token IDs resolve to their synthetic token actors. Feeds Phase 4.
- `manage-actors`: generic actor CRUD (`create`/`update`/`delete`/`update-items`/`delete-items`),
  works on pf2e with no adapter work (`normalizePayload` / `describeActorSchema` are optional hooks).
- The Prettier sweep, ending the formatting divergence permanently.
- `wss://` auto-detect + `serverPort` honouring (irrelevant on localhost, free to take).

**Also inherited, carried not used** (per strategy decision 3): mgt2e system (~1,500 ln),
`wfrp4e-add-items`, `wfrp4e-update-actor`, `manage-world-items describe`.

**Steps**

- [x] `git checkout -b v14-port-v083 upstream/master` — branch cut at `8270992` (upstream tip
      re-verified unchanged 2026-08-12). Upstream tracking unset so pushes can't reach upstream.
- [x] Carry fork context from `v14-port`: `docs/V14_MIGRATION_PLAN.md` + `.claude/settings.local.json`
      (commit `d10aa83`). `CLAUDE.md` is gitignored, so it survived the checkout on disk untouched.
      **Case-fold note is stale:** upstream tracks no `Claude.md` at this tip, so there was nothing
      to remove and no collision.
- [x] `npm install` (up to date) && typecheck && `npm run build` && `npm run bundle:server` — all clean
- [x] Version lockstep confirmed: `npm run version:check` → all 5 manifests at 0.8.3
- [x] Deploy **stock** module → `D:\FoundryData-Paizo\Data\modules\foundry-mcp-bridge`
      (67 files, hash-verified against the build; no orphaned files left in the destination)
- [x] Deploy **stock** server bundles — backed up to `dist/_backup_fork_pre_v083/`
      (`backend.bundle.cjs`, `index.bundle.cjs`, `index.cjs`)
- [x] **You:** restart Claude Desktop, then verify `get-current-scene` (**read path**) and
      `request-player-rolls` (**write path**)
- **Gate:** stock v0.8.3 connects and works on Foundry v14. New known-good reference established.

> **Gate wording corrected 2026-08-12.** Revision 3 said "verify `get-current-scene` + a dice roll",
> which is not runnable: **v0.8.3 has no tool that evaluates a roll and returns a number.**
> The only dice tool is `request-player-rolls`, which posts a clickable button into Foundry chat
> and returns `Roll request sent successfully!` without a result
> ([`dice-roll.ts` `handleRequestPlayerRolls`](../packages/mcp-server/src/tools/dice-roll.ts)).
> That still makes it the right write-path check — it proves the module can create documents in
> Foundry — but the confirmation is **visual, in the Foundry chat log**, never the tool's response.
> Same failure mode as the Simple Quest checklist in Phase 7a: a success string that means "sent",
> not "worked".

**Phase R gate results (2026-08-12)**

| Check                               | Result                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Tool list freshness                 | ✅ 43 tools, `manage-actors` in, `get-combat-tracker` out              |
| `get-current-scene` (read path)     | ✅ scene "Landing", 5 tokens, dispositions correct, `withoutActors: 0` |
| `request-player-rolls` (write path) | ✅ button posted, click handled, roll evaluated, message created       |
| Roll **modifier** correctness       | ❌ rolled `1d20 + 0` — see below                                       |

**Gate verdict: PASS.** Both paths work on Foundry v14. The modifier defect below is a
pre-existing upstream bug, not a Phase R regression, and does not block the baseline.

#### ❌ `request-player-rolls` applies no modifier on pf2e — "moot after the pivot" was WRONG

Observed 2026-08-12: a Perception skill check for Ezren (level 1) rolled **`1d20 + 0`**.

`CLAUDE.md` lists this under _Moot after the pf2e pivot_, reasoning that "upstream's pf2e adapter
handles this correctly." **That reasoning does not hold.** The roll formula is built
**module-side** in `data-access.ts`, which never consults the server-side pf2e adapter in
`packages/mcp-server/src/systems/pf2e/`. The adapter is not in this code path at all.

`buildRollFormula` (`data-access.ts` ~L5782) is hardcoded to **D&D 5e**:

```ts
case 'skill':
  const skillCode = this.getSkillCode(rollTarget); // 'perception' -> 'prc' (5e 3-letter code)
  const skillMod = rollData.skills?.[skillCode]?.total ?? 0; // pf2e has no skills.prc -> undefined
  baseFormula = `1d20+${skillMod}`; // -> 1d20+0
```

`getSkillCode` (~L5848) maps only the 18 D&D 5e skills to 5e three-letter codes. On pf2e the
lookup cannot hit: pf2e keys skills by full slug, and **Perception is not a skill in pf2e at all**
— it is a top-level statistic. The `?? 0` then swallows the miss silently. Every `ability`,
`skill`, `save`, and `initiative` roll is affected; only `custom` (raw formula passthrough) escapes.

**Not a GM-override artifact.** The formula is baked into the button's `data-roll-formula`
attribute when the request is created (~L5527), before anyone clicks. GM and player clicks both
replay that same precomputed string, so `(GM Override)` in the flavor text is irrelevant here.

- **One check still discriminates two causes.** Either the character resolved and the 5e skill
  lookup missed (expected), or the character never resolved and the `else` branch at ~L5829 kept
  the bare `1d20`. That branch logs
  `[foundry-mcp-bridge] No character provided for roll formula, using base 1d20`.
  Its **absence** from the browser console confirms the skill-map cause.
- Weak evidence for the skill-map cause already: the chat message carried Ezren's portrait,
  speaker, and level, so `playerInfo.character` was populated.
- **This is a re-port, not new work — scheduled as Phase 1.5.** We already fixed this on old
  `master` (`0fdbfcf` + `fad49c3`), including the pf2e Perception case. It regressed only because
  Phase R re-forked onto stock upstream, and the port inventory never listed it. See Phase 1.5.

#### ⚠️ v14 deprecation: `Roll#toMessage` `rollMode` → `messageMode`

Foundry v14 logs on every roll: _"The rollMode option of Roll#toMessage is deprecated in favor of
messageMode… Deprecated since Version 14, backwards-compatible support will be removed in
Version 16."_ Source is `data-access.ts` ~L6046 (`await roll.toMessage(messageData, { create: true,
rollMode })`). Upstream code, harmless today, breaks on v16. Console noise until fixed.

#### ✅ Resolved: `get-character` name lookup is exact-match, and PC actors carry a name suffix

`get-character { identifier: 'Ezren' }` fails, but `{ identifier: 'Amiri (Level 1)' }` succeeds.
**The actors in this world are literally named `"<Name> (Level 1)"`** — the suffix is part of
`actor.name`, not something the bridge computes. `get-character` matches exactly;
`request-player-rolls` matches loosely, which is why the same short name worked there. Not a bug,
but callers must use the full actor name. Worth remembering for Phase 2 speaker resolution.

#### The pf2e adapter already computes correct modifiers — on the wrong side of the wire

Same probe, `get-character { identifier: 'Amiri (Level 1)' }`, returns exactly what the roll
formula needs, keyed by **full pf2e slug**:

```json
"skills": {
  "acrobatics":   { "modifier": 5, "rank": 1, "proficient": true },
  "athletics":    { "modifier": 7, "rank": 1, "proficient": true },
  "intimidation": { "modifier": 4, "rank": 1, "proficient": true },
  "arcana":       { "modifier": 0, "rank": 0, "proficient": false }
}
```

Two things follow. First, it confirms the diagnosis: pf2e keys skills by full slug, so the 5e
three-letter codes (`prc`, `acr`, `ath`) cannot match. Second, **`perception` is absent from that
map** — the alphabetical run goes `performance` → `religion` with no `perception` between them,
confirming pf2e models Perception as a separate statistic rather than a skill. A slug fix alone
would still miss Perception.

So the correct modifier is already available server-side through the pf2e adapter, while the
formula is built module-side from a 5e table. The fix is a routing problem, not a data problem.

**Zero-code workaround, usable today:** `rollType: 'custom'` passes `rollTarget` through as a raw
formula untouched (~L5822), so `{ rollType: 'custom', rollTarget: '1d20+7' }` rolls correctly.
Every other roll type is wrong on pf2e.

- **Heads-up:** the tool list grows (`manage-actors`, `wfrp4e-*`, mgt2e paths). Claude Desktop caches
  the tool list once per session, so kill the backend **before** copying (see Deploy reminder).
- **Revert:** nothing destructive. `v14-port` and `master` are untouched; restore the installed
  server from `dist/_backup_fork_pre_v083/` and restart Claude Desktop.

**Findings worth carrying forward**

1. **`npx tsc --noEmit` at the repo root does not work on stock upstream.**
   `packages/foundry-module/tsconfig.json` has no `"composite": true`, so the root config's
   project references fail with `TS6306`. This is an upstream config defect, not ours.
   **Use `npm run typecheck`** (per-workspace `tsc --noEmit`) instead — that is clean.
   `CLAUDE.md` still documents the root command; treat this as the correction.
2. **Clean `dist/` when switching between branches.** Stale output from the previous branch
   produces a wall of `TS6305` ("output file has not been built from source file"). Delete
   `packages/*/dist`, `shared/dist`, and `*.tsbuildinfo` before type-checking on a fresh branch.
3. **`shared/dist` must exist before `packages/mcp-server` type-checks** — mcp-server resolves
   `@foundry-mcp/shared` to the built output, not to source. Run `npm run build` before `typecheck`.
4. **The install was a matched-pair violation before this phase.** The v14 world already had the
   _stock 0.8.3 module_ deployed, while the installed server still ran the _fork_ bundle (it
   contained `get-combat-tracker`). Phase R resolves it: both sides are now stock 0.8.3.
5. **`index.cjs` is a byte copy of `index.bundle.cjs`**, not a launcher. Any server deploy must
   overwrite all three files — `backend.bundle.cjs`, `index.bundle.cjs`, **and** `index.cjs` —
   since Claude Desktop's config points at `index.cjs`.

**Deploy verification without Claude Desktop** (use this every phase from now on)

The backend's control port speaks newline-delimited JSON, so the deployed tool list can be read
directly instead of inferred from the Claude Desktop UI:

```js
// node probe.cjs — connect 127.0.0.1:31414, write one line, read one line
{ id: 'probe', method: 'list_tools', params: {} }
```

Phase R result: **43 tools**, `manage-actors` present, `get-combat-tracker` absent,
`wfrp4e-add-items` present. That matches stock upstream v0.8.3 exactly (the 0.8.2 fork reported
41: 40 stock + our combat tool). This is the authoritative freshness check — the Claude Desktop
badge is not.

#### ⚠️ Claude Desktop shows `failed` even when the deploy is healthy (pre-existing)

Claude Desktop sometimes launches the stdio wrapper **twice, milliseconds apart**. With no backend
listening, both wrappers race to spawn one. The loser's backend exits 0 on the lock check, and
`index.ts` treats that as fatal for itself:

```ts
// packages/mcp-server/src/index.ts ~L170
child.on('exit', code => {
  if (code === 0) process.exit(0); // "likely lock failure", exits the wrapper too
});
```

The surviving wrapper serves tools normally, but Claude Desktop reports the dead one as
**"Server disconnected / failed"**. Not a Phase R regression — the same
`backend exited cleanly (likely lock failure)` line appears in `wrapper.log` on 2026-08-11
against the old fork build.

- **Avoid it:** make sure a backend is already listening on 31414 _before_ starting Claude Desktop.
  Both wrappers then just connect, neither spawns, and there is no race. This inverts the usual
  advice — kill the backend before _copying_ files, but have one up before _launching_ the client.
- **Diagnose it:** `%TEMP%\foundry-mcp-server\wrapper.log` (wrapper) and `mcp-server.log` (backend).
- **Blind spot:** the wrapper spawns the backend with `stdio: ['ignore','ignore','pipe']` and then
  never reads that pipe, so a backend crash writes its stack to a pipe nobody drains and leaves
  **no trace in either log** — only `backend exited unexpectedly {"exitCode":1}`. To capture a
  crash, start the backend by hand with stderr redirected to a file.
- ~~Verified separately: the backend survives both graceful and abrupt (RST) control-client
  disconnects, so probing it is safe.~~ **FALSIFIED 2026-08-15 — see "Backend dies on an abrupt
  control-client disconnect" in Phase 4.** A _graceful_ disconnect is survivable; an **abrupt one
  crashes the process**. Probing remains safe because the probe script closes cleanly with
  `socket.end()`, but the general claim was too broad.

### Phase 1 — Combat tracker read 🎯 ✅ DONE (gate passed 2026-08-12)

**Goal:** Re-land the one tool already proven on v14, and re-validate the 4-file pattern on v0.8.3.

- [x] ~~Try `git cherry-pick 9f9cfcd` first.~~ **Hand-ported instead — see below.**
- [x] Drop the doc-only hunks from that commit (the plan file is already carried in Phase R)
- [x] Confirm all four pieces landed: `combat.ts`, the `backend.ts` case, the `queries.ts` handler,
      and `getActiveCombat` in `data-access.ts`
- [x] Fold in the known follow-up: `getActiveCombat` returns `scene: null` when the combat is not
      bound to a scene. Add a `game.scenes.active?.name` fallback.
- [x] Built, typechecked, bundled, deployed (both packages, matched pair). Control-port probe:
      **44 tools** = 43 stock + `get-combat-tracker`.
- [x] **You:** read initiative order / current turn / round in a combat
- **Gate:** round, current turn, init sorted highest-first, defeated/hidden/disposition all correct
  (this exact behaviour was confirmed on v0.8.2, so any difference is a v0.8.3 regression worth chasing).

**Phase 1 gate results (2026-08-12)** — live pf2e combat on scene "Landing", 4 combatants
(2× "Chelaxian Recruit", Ezren, Amiri), round 1.

| Check                  | Result                                                            |
| ---------------------- | ----------------------------------------------------------------- |
| Round                  | ✅ 1                                                              |
| Current turn           | ✅ Chelaxian Recruit @ 23, matches `combat.combatant`             |
| Initiative sorted desc | ✅ 23, 20, 19, 19                                                 |
| `defeated`             | ✅ exactly one flagged                                            |
| `hidden`               | ✅ flipped `false`→`true` on the hidden token, nothing else moved |
| `disposition`          | ✅ hostile/friendly correct per token                             |
| Summary counts         | ✅ 4 / 1 / 3 / 0, internally consistent                           |
| Tool freshness         | ✅ control-port probe: 44 tools                                   |

**Gate verdict: PASS.** No v0.8.3 regression against the v0.8.2 behaviour.

`hidden` was verified by a **second call with one token toggled between them** — it was the only
field that changed across two otherwise identical responses. That isolation is worth repeating:
a single call showing `hidden: true` proves far less than a diff of two calls.

#### ⚠️ Carried limitation: tied initiative is ordered by collection order, not tracker order

Surfaced by the gate test (Chelaxian Recruit and Amiri both at 19). **Not a Phase 1 regression** —
v0.8.2 had it too and passed its gate, because that test happened to have no tie.

`getActiveCombat` reads `combat.combatants.contents` (the raw collection) and sorts it itself.
Foundry's authoritative order is **`combat.turns`**, built by `Combat#setupTurns`, which applies a
tie-break beyond initiative and which game systems may override. JS `sort` is stable, so on a tie
our order falls back to collection order — roughly document creation order.

- **Not affected:** `isCurrentTurn`, which comes from `combat.combatant.id` and is authoritative.
  "Whose turn is it" is always right.
- **Affected:** `position` and neighbouring order on ties — i.e. answering _"who goes next"_.
  On pf2e, where ties are common and the tie-break is a real rule, that matters.
- **Fix** (contained, one line plus skipping the manual sort):

  ```ts
  const source = combat.turns?.length ? combat.turns : combat.combatants?.contents || [];
  ```

- **Scheduled into Phase 1.5**, which already rebuilds and redeploys both packages — the fix rides
  along for free instead of costing its own test cycle.

#### Scene fallback is landed but unproven

`scene` returned `"Landing"`, which is correct — but Landing was also the **active scene**, so
`combat.scene?.name` and the fallback return the same string and the test cannot distinguish them.
Benign: worst case the fallback is dead code. To actually exercise it, read a combat that is not
bound to a scene.

#### Why the cherry-pick was abandoned (do the same on every future re-port)

`9f9cfcd` touches `data-access.ts` with **1073 changed lines**, but the tool itself is one method.
The rest is a Prettier reformat of unrelated dnd5e helpers that rode along in that commit — onto a
base upstream has **since reformatted differently**. Cherry-picking would have asked git to
reconcile two independent reformats of the same thousand lines: the exact false-conflict scenario
strategy decision 1 exists to avoid.

`audit.py` settled it in one run, and this is the reusable test:

```
old methods: 120   new-only methods: 1
--- MODIFIED upstream methods ---   addAttackToActor, addAuraToActor, createNpcActor, … (9, all formatting)
--- NEW methods added by us ---     getActiveCombat
```

**Rule: audit the reference commit before cherry-picking it, not just the base.** If the audit shows
new-only methods, hand-port those and ignore the diff's size. Result here: **90 insertions, 0
deletions, no upstream line touched** — versus 1073 changed lines and a hand-resolved conflict.

#### Scene fallback, as landed

```ts
scene: combat.scene?.name ?? (game.scenes as any)?.active?.name ?? null,
```

`combat.scene` is null for a combat not bound to a scene; the active scene is the sensible answer
in that case, and `null` survives as the last resort.

#### Notes for the gate

- The tool is **GM-gated** in `queries.ts` (`validateGMAccess`), same as every other write-ish
  query. Read it from a GM session.
- **No combat active** is a legitimate result, not a failure: the tool returns
  `{ active: false, message: 'No combat encounter is currently active.' }`.
- A combat that exists but has not been **started** returns `active: false` with a
  `"Combat is set up but not yet started"` message and the queued combatants. To exercise the
  real gate criteria (round, current turn) the encounter must actually be started in Foundry.
- Combatants with no initiative sort **last** and report `initiative: 'not rolled'`.

### Phase 1.5 — `request-player-rolls` repairs 🎲 ✅ DONE (gate passed 2026-08-12)

**Goal:** Restore the three `request-player-rolls` fixes the port inventory forgot — rows 6, 7
and 8. Not new work: all three have exact references on `master`.

| Row | Method                     | Symptom on stock v0.8.3                                      |
| --- | -------------------------- | ------------------------------------------------------------ |
| 6   | `buildRollFormula`         | pf2e rolls have no modifier (`1d20 + 0`) — **observed live** |
| 7   | `requestPlayerRolls`       | roll request speaker is a `User`, not an actor               |
| 8   | `attachRollButtonHandlers` | no speaker at all when the character does not resolve        |

They land together because they are one tool, one file, and one test cycle.

**Why this is urgent despite being "just" a port:** every other missing tool is _absent_.
This one is **present and silently wrong** — it posts a confident, correctly-labelled
"Perception Skill Check" that rolls a bare `1d20`. Wrong-but-confident is worse than missing,
and it lands in a live session.

**Reference:** `buildRollFormula` in `master:packages/foundry-module/src/data-access.ts` (~L4634,
102 lines). Built across two commits — take the **final `master` state**, not either commit alone:

| Commit    | Added                                                                                         |
| --------- | --------------------------------------------------------------------------------------------- |
| `0fdbfcf` | `isPF2eFamily` branches for `skill` / `save` / `initiative`                                   |
| `fad49c3` | the pf2e Perception special case (`system.perception`, since pf2e has no `skills.perception`) |

**Steps**

- [x] **Rider from Phase 1:** use `combat.turns` for turn order in `getActiveCombat`, falling back
      to the manual sort. Fixes tied-initiative ordering. Free here — same file, same deploy.
- [x] Re-graft `buildRollFormula` from `master` onto upstream's `data-access.ts` (row 6, 98 ln)
- [x] Re-graft the `requestPlayerRolls` speaker priority (row 7, 7 ln)
- [x] Re-graft the `attachRollButtonHandlers` speaker fallback (row 8, 1 ln)
- [x] Keep the `dnd5e` branch and `getSkillCode` untouched (upstream default path, carried per
      strategy decision 3)
- [x] Confirm the Perception special case survives — it is the case that was actually observed
      failing, and the easiest one to drop during a re-graft
- [x] Consider hoisting the modifier lookup to the server-side adapter instead of extending the
      module-side `if (isPF2eFamily)` chain. **Decided 2026-08-12: module-side re-port.** See below.
- [x] Built, typechecked, deployed. **Module-only** — server bundle and tool list unchanged, so no
      backend restart and no Claude Desktop restart.
- [x] **You:** request a Perception skill check, an Athletics skill check, a Reflex save, and an
      initiative roll for a pf2e PC
- **Gate:** each rolls with the character's real modifier. Cross-check against `get-character`,
  which already reports correct values (Amiri: athletics +7, acrobatics +5, intimidation +4).
- **Note:** `rollType: 'custom'` already works and is the workaround until this lands.

**Phase 1.5 gate results (2026-08-12)** — Amiri (Level 1), pf2e, four rolls cross-checked
against `get-character`.

| #   | Roll               | Rolled   | Sheet reports         | Verdict                        |
| --- | ------------------ | -------- | --------------------- | ------------------------------ |
| 1   | Perception (skill) | `1d20+5` | `perception` 5        | ✅ **the observed bug, fixed** |
| 2   | Athletics (skill)  | `1d20+7` | `athletics` 7         | ✅                             |
| 3   | Reflex (save)      | `1d20+5` | `saves.reflex` 5      | ✅                             |
| 4   | Initiative         | `1d20+5` | _not reported at all_ | ✅ verified indirectly, below  |

**Gate verdict: PASS.** Perception — the case proven broken at `1d20 + 0` in Phase R — now rolls
`1d20 + 5`. No `+0` appeared on any of the four.

#### `warnOnMissingModifier` paid for itself on its first run

Row 4 had no sheet value to compare against, so on chat output alone it was unfalsifiable: `+5`
could equally be a correct lookup or a `?? 0` miss that happened to look plausible. The helper
closes that gap from the other side — it logs on **any** pf2e/sf2e lookup resolving `undefined`,
and **it did not fire**. The console was being watched closely enough to catch the unrelated
`rollMode` deprecation, so a miss would have been seen.

`+5` therefore came from a real field. With the cascade order (`attributes.initiative` →
perception → dex) and Perception at 5, initiative resolved correctly.

**The general lesson:** a silent fallback makes a whole class of results unverifiable from the
outside. One console warning converts "cannot compare" into "verified", at the cost of four call
sites. Worth repeating anywhere a `?? default` hides a lookup.

#### Upstream gap found: `get-character` never reports initiative

Not ours, and not a Phase 1.5 defect — `packages/mcp-server/src/systems/pf2e/` contains **no
reference to initiative at all**, so the adapter cannot report it. `get-character` returns
abilities, skills, perception and saves, and nothing else.

Consequence: initiative is the one roll type with **no server-side cross-check available**. If a
pf2e character has an initiative override (a different statistic selected, or a bonus), neither
the tool output nor this gate would detect it. Backlog item, not a blocker — the natural place to
fix it is the same adapter work as the post-Phase-6 hoist.

#### Row 8 is landed but unexercised (same shape as the Phase 1 scene fallback)

`attachRollButtonHandlers`' `{ alias: rollLabel }` fallback only runs when **no character
resolves**. All four gate rolls resolved Amiri, so the branch never executed. Benign, but do not
record it as proven. Second time this pattern has appeared — **a defensive fallback is not tested
by a passing happy path**, and both Phase 1 and Phase 1.5 shipped one unverified.

#### Explained: `targetName` flips between the character and the owning player

Roll 4 returned _"Roll request sent to Dragor"_ where rolls 1-3 said _"Amiri (Level 1)"_, which
reads like a targeting bug. It is not, and the target never changed.

`findPlayerAndCharacter` sets `targetName` from the **owning player** when an active non-GM owner
resolves (~L5739), and from the **character** when none does (~L5747). Those are the same two
branches that drive the `(GM Override)` tag: no owner resolved → the GM rolls it. Rolls 1-3 took
the character branch and carried `(GM Override)`; roll 4 took the owner branch once the player
client was connected, and the tag correctly disappeared. Upstream code, untouched by this port.

Worth knowing for Phase 2, which resolves speakers for chat and journal display.

#### Decision: module-side re-port, not the adapter hoist (2026-08-12)

Both routes were costed. **Module-side won**, on migration sequencing rather than architecture:

|                 | Module-side re-port (chosen)        | Server-side adapter hoist        |
| --------------- | ----------------------------------- | -------------------------------- |
| Reference       | exact, on old `master`              | none — genuinely new work        |
| Blast radius    | `data-access.ts` only               | WS payload → both packages       |
| Fixes           | pf2e + sf2e                         | every system, present and future |
| Strategy dec. 4 | satisfied ("nothing is re-derived") | **violated**                     |

The hoist is the better end state — the pf2e adapter already computes correct modifiers
server-side, so this is a routing problem, not a data problem. But it would have been the first
phase to re-derive rather than re-port, with five phases of unported tools still ahead. Get the
fork whole first, refactor from a known-good state. **Filed for after Phase 6.**

Franklin scoped it explicitly: pf2e and sf2e only for now. mgt2e / wfrp4e / dsa5 / cosmere still
fall through to the 5e path and still roll flat on skills. Not a regression, just not addressed.

#### Deviation from a faithful port: `warnOnMissingModifier`

The one thing added that is not on `master`. Every lookup in `buildRollFormula` ends in `?? 0`,
which is exactly how this bug shipped unnoticed — a miss becomes a confident, correctly-labelled
`1d20 + 0`. The helper logs a console warning on a pf2e/sf2e miss so the next one announces itself
instead of costing a session. It cannot change a formula; it only observes.

Agreed before writing. To revert to a byte-faithful port, delete the helper and its four call
sites and restore `?? 0` inline.

#### Watch for during the gate

- **The `?? 0` fallback is still there** by design. A correct-looking `1d20 + 0` on a character
  who genuinely has +0 is indistinguishable from a lookup miss **in the chat log** — the console
  warning is the only thing that separates them. Check the browser console, not just chat.
- **Initiative is the loosest lookup.** It cascades `attributes.initiative` → perception → dex mod
  across three field names each. Most likely of the four to pick a plausible wrong number rather
  than fail outright, so cross-check it hardest.
- **Row 7 is visible, not numeric.** It changes who the roll _request_ appears to come from, not
  any value. Confirm the request posts as the GM/`"GM"` actor rather than a bare user.

### Phase 2 — Chat + journal display 💬📖 ✅ DONE (gate passed 2026-08-13)

**Goal:** Three tools, two brand-new files, zero shared-file risk, **zero external-module
dependency**. Highest per-session value left.

> **Rescoped 2026-08-13.** The two Simple Quest tools moved to **Phase 7**. They are the only
> tools in the entire port with a hard module guard, and Simple Quest changed enough between
> 3.0.20 and 5.1.4 that re-landing them is a **rebuild, not a re-port** — which would silently
> violate strategy decision 4. See "Module dependency sweep" for where the line is drawn.

- [x] Port `chat.ts` (`read-chat`) across the 4 files
- [x] Port `journal.ts` (`send-chat-message`, `show-journal-to-players`) across the 4 files,
      including speaker/portrait resolution
- [x] `journal.ts` is a single 221-line `JournalTools` class holding **four** tools on `master`.
      Port it with the two quest tools **omitted, not stubbed** — Phase 7 adds them back.
- [x] Built, typechecked, formatted, bundled, deployed (both packages, matched pair).
      Diff is **284 insertions, 0 deletions** — no upstream line touched, same shape as Phase 1.
      Control-port probe: **47 tools** = 43 stock + `get-combat-tracker` + the 3 new ones,
      with both Simple Quest tools confirmed absent.
- [x] **You:** read recent rolls/messages; have Claude post to chat; show a handout page to players
- **Gate:** rolls readable; messages post with correct speaker + portrait; correct journal page
  displays to players.
- **Note:** speaker resolution has a known wrinkle from the Phase 1.5 gate — a target name resolves
  to the owning _player_ when one is active and to the _character_ otherwise. Expect the same split
  here, and do not read it as a bug.

**Phase 2 gate results (2026-08-13)** — 20-message read, three posts, one journal page.

| Check | Result                                                                        |
| ----- | ----------------------------------------------------------------------------- |
| 1     | ✅ 20 messages, 8 rolls; formula/total/speaker populated on every roll        |
| 2     | ✅ `author` correct — zero empty/blank/`"Unknown"` across all 20 (see below)  |
| 3a    | ✅ posts as GM, public                                                        |
| 3b    | ✅ resolves the actor **via its token** — portrait present                    |
| 3c    | ✅ whisper scoped correctly; player client could not see it                   |
| 4     | ✅ correct page, single-page mode, on the GM client (player side unexercised) |

**Gate verdict: PASS.**

#### ⚠️ The designed fixture could not discriminate — the formatter flattened it

The gate was built around an OOC message, on the reasoning that Foundry does `delete chatData.speaker`
for OOC (`chat.mjs` `#processChatCommand`), so `author` and `speaker` must differ. Foundry does
exactly that. **The tool output still showed them identical**, because the server-side formatter
substitutes the author when no speaker survives ([`chat.ts`](../packages/mcp-server/src/tools/chat.ts)):

```ts
speaker: msg.speaker?.alias ?? msg.speaker?.actor ?? msg.author,
```

So the one message shape guaranteed to have no speaker is also the one shape where the output layer
guarantees the two fields read the same. The fixture proved nothing.

**What actually proved it** was two unplanned messages in the same batch, spotted during the gate:

```
"author": "Dragor",  "speaker": "Dice So Nice!"
"author": "Dragor",  "speaker": "Amiri (Level 1)"
```

Under the removed v13 path `author` could only ever echo the speaker, so it would have read
`"Dice So Nice!"` and `"Amiri (Level 1)"`. A real User name appearing **nowhere** in the speaker
field cannot be produced by a `speaker.alias` fallback. Row 1 is confirmed landed.

> **The lesson recurred inside the test written to catch it.** "A silent `?? default` makes results
> unverifiable from the outside" is already a standing rule here (Phase 1.5). This time the silent
> fallback was in the **formatter**, and it defeated the gate rather than the feature.
> **Rule: check the whole path from source field to printed output before trusting a fixture.**
> A discriminating input is not a discriminating test if something downstream re-merges the fields.
>
> Follow-on, filed to 7d, not fixed here: that same `?? msg.author` means `read-chat`'s `speaker`
> can never be distinguished from "no speaker, showing author instead". Faithful to `master`, mildly
> dishonest as a field.

#### `1d20 + 0` in the log is a Phase R fossil (probable, unconfirmed)

Check 1 returned a `1d20 + 0` for Ezren. That matches the Phase R gate record exactly — _"a Perception
skill check for Ezren (level 1) rolled `1d20 + 0`"_ — and the same 20-message window still holds
Amiri's `+5`/`+7` from the Phase 1.5 gate, so the window demonstrably spans both. Chat history
survives deploys. **Not re-rolled during this gate, so this remains inference, not proof.** One
Perception request for Ezren settles it; do that before reading any future `+0` as a regression.

#### 3b resolved through the token path — the better branch

The tool echoed `"Amiri"` while the actor is named `"Amiri (Level 1)"`, which reads like a failed
partial match. It is not: `"amiri (level 1)".includes("amiri")` cannot fail. `sendChatMessage`
prefers a token on the current scene and `getSpeaker({token, actor})` takes its alias from the
**token name**, so `"Amiri"` is the token's name. Check 1 corroborates — both forms appear as roll
speakers in the same log. That branch is the one that yields the token portrait, and the portrait
was present.

**Reading note:** a returned speaker that differs from the actor name is expected and good. The
failure signature is a bare alias **with no portrait**, not the string itself.

#### Correction to this plan's own gate criteria: the TOC sidebar is not a mode tell

The gate listed "opens in multi-page mode with the sidebar TOC" as a failure sign. Wrong —
`journal-sheet.mjs` `getData()` builds `context.toc` (the page list) in **both** modes and varies
only `context.pages`: SINGLE renders `[toc[pageIndex]]`, MULTIPLE renders all of `toc`. The sidebar
is always present.

**The real tell is the content pane:** one page rendered = SINGLE, all pages in a continuous scroll
= MULTIPLE. Observed: one page, correct page highlighted in the TOC. Correct behaviour.

#### Landed but unexercised: the player-side render (third time this pattern appears)

No player client was connected for check 4, so only the GM render is proven. Risk is low — both
sides run the same `Journal._showEntry`, players via the socket listener and the GM directly in the
ack callback, and `force: true` grants the temp OBSERVER that stops `!force && !entry.visible` from
bailing. But it is inferred, not observed.

Third phase running to ship one of these (Phase 1's scene fallback, Phase 1.5's row 8, now this).
**A passing happy path does not test the branch it did not take** — the pattern is consistent
enough that it belongs on the pre-gate checklist, not in a post-mortem each time.

#### ⚠️ The port source was v13 code — `getRecentChat` needed three v14 corrections

This is the first phase where **a faithful re-port would have shipped broken code**. Phases 1 and
1.5 grafted cleanly; `getRecentChat` reads the `ChatMessage` document directly, and v14 changed
that document's shape. All three were caught by reading the installed v14 client source
(see below), not at the gate.

| #   | `master` (v13) wrote                      | v14 reality                                                               | Now                                        |
| --- | ----------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | `game.users.get(msg.user?.id ?? …)?.name` | **`user` is gone, with no shim.** `ChatMessage#author` is a resolved User | `msg.author?.name ?? speaker.alias`        |
| 2   | `type: msg.type`                          | `type` is now the _document subtype_ (`"base"`), not the v11 numeric type | `style: msg.style` (`CHAT_MESSAGE_STYLES`) |
| 3   | `rollsOnly` filter `\|\| msg.type === 5`  | dead — nothing is ever `5`; `CHAT_MESSAGE_STYLES` tops out at 3           | `msg.isRoll` (the supported getter)        |

**Row 1 is the dangerous one, and it is the project's recurring failure mode a fourth time.**
`msg.user` resolving to `undefined` does not throw — it falls through `?? msg.speaker?.alias`,
which is populated on most roll and IC messages. Chat reads would have looked _correct_ in exactly
the cases most likely to be tested, and reported `"Unknown"` only on OOC messages with no alias.
Nothing in the output would have said "this field is guessing".

Row 3 was harmless (the `rolls.length > 0` clause already carried the filter) and row 2 only
polluted the payload with a constant string. Row 1 alone justified the check.

**Rule, generalised from the "installed module" rule:** the standing rule said re-verify against
the **installed module** before porting anything that touches one. Extend it — _re-verify against
the installed **Foundry** before porting anything that reads a document's shape._ Core is not
exempt from major-version drift; it just breaks more quietly, because core keeps deprecation shims
for two generations and then removes them without one.

#### 📍 The v14 client source is on disk — use it, it settles these in minutes

```
C:\FoundryVTT-v14-Paizo\Foundry Virtual Tabletop\resources\app\client\    ← readable ESM source
C:\FoundryVTT-v14-Paizo\Foundry Virtual Tabletop\resources\app\common\    ← document schemas
```

Found via `Get-Process | ? ProcessName -like '*oundry*' | Select Path` — the install is **not** in
`C:\Program Files\Foundry Virtual Tabletop` (that directory exists but is empty). `resources/app/package.json`
confirms `"generation": 14`.

The two files that answered everything this phase:

- `common/documents/chat-message.mjs` — `defineSchema()`, the authoritative field list. This is
  where `author: new fields.DocumentAuthorField(...)` and the **absence of `user`** are visible.
- `client/documents/collections/journal.mjs` — `Journal.show` / `Journal._showEntry`.

Grepping for a deprecation shim (`get user`, `_addDataFieldShim`, `deprecat`) in **both** the
common and client document files is the cheap check: a field with no shim and no schema entry is
simply gone.

#### ✅ Verified unchanged on v14 — ported byte-faithfully

Everything `sendChatMessage` and `showJournalToPlayers` touch was checked and needed no edit:

| API                                     | v14 status                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `Journal.show(doc, { force })`          | intact; still accepts a `JournalEntryPage`                                          |
| `Journal._showEntry` single-page mode   | intact — a page arg still sets `VIEW_MODES.SINGLE` + `pageId`                       |
| `ChatMessage.getSpeaker({token,actor})` | intact; `token` must be a `Token`/`TokenDocument` — `scene.tokens.find()` gives one |
| `game.scenes.current`                   | intact (viewed scene if canvas ready, else active)                                  |
| `ChatMessage.create` + `style`          | already proven live by the Phase 1.5 roll request                                   |

`Journal.show` also confirms the tool description's "AND the GM" claim: `_showEntry` runs locally
in the socket callback, so the GM's own client renders it too.

#### Notes for the gate

- **`read-chat` is GM-gated** in `queries.ts`, like every other query. Read it from a GM session.
- **Check the `author` field specifically**, on a message with no speaker alias (a plain OOC
  message typed in chat). That is the one case where the v13 code would have said `"Unknown"`,
  so it is the case that proves row 1 landed rather than merely looking plausible.
- **`send-chat-message` with an unknown speaker name is not an error** — it posts under that name
  as a plain alias. Only a _matched_ actor gets a portrait.
- **A backend is already running** (started by hand, PID logged at deploy time). Per the Phase R
  race note, start Claude Desktop _while it is up_ so neither wrapper needs to spawn one.

### Phase 3 — Playlist control 🎵 ✅ DONE (gate passed 2026-08-13)

- [x] Port `playlist.ts` (`list-playlists`, `play-playlist`, `stop-playlist`) with loop/volume/mode
- [x] Built, typechecked, formatted, bundled, deployed (both packages, matched pair).
      **240 insertions, 0 deletions.** Control-port probe: **50 tools** = 43 stock + 7 ported.
- [x] **You:** play/stop a playlist; test loop and volume
- **Gate:** audio control works from Claude.

**Phase 3 gate results (2026-08-13)** — run against a duplicated `Ambience (Copy)` fixture so no
real playlist was mutated. Needed two rounds; the first was degenerate, see below.

| Correction                         | Result                                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| Row 1 — `soundboard` write → `-1`  | ✅ proven **bidirectionally** (`soundboard ↔ sequential`)    |
| Row 2 — read `-1` → `'soundboard'` | ✅ proven on all four playlists                               |
| Row 3 — volume curve               | ✅ write landed (`13% → 35%`); math verified vs `AudioHelper` |
| `playAll()` soundboard no-op       | ✅ proven on "Loops" — `playing: false` + explanation         |
| `loop` write                       | ✅ proven bidirectionally (`true → false → true`)             |

**Gate verdict: PASS.**

#### 🎯 Every playlist in this world is in soundboard mode — rows 2 and 4 were load-bearing

Check 1 returned `mode: "soundboard"` for **all four** playlists (Ambience, Ambience (Copy), Loops,
SFX). That was not the expected result, and it retroactively raises the value of two fixes:

- **Row 2 would have mislabelled 100% of the library.** `master`'s `playlistModeName` has a `case 3`
  and no `-1`, so every playlist Franklin owns would have reported `"unknown"` in `list-playlists`,
  silently and permanently.
- **The `playAll()` no-op branch would have failed every whole-playlist call.** `master` returns a
  confident `Playing playlist "X".` and produces silence on a DISABLED playlist. Since _every_
  playlist here is DISABLED, that is every bare `play-playlist` call ever made.

The no-op branch was added from reading Foundry's source, not from knowing the world's contents —
it turned out to describe the entire setup. **Reading the API's edge cases found a defect that
testing the happy path could not have**, because here there is no happy path.

#### ⚠️ Round one was degenerate — a write that agrees with the current value proves nothing

The first run set `mode: 'soundboard'` on a playlist already in soundboard mode, and `loop: true`
on a track already `repeat: true`. Set, read-back and restore were then all indistinguishable from
the parameter being **silently ignored**. Both had to be re-run starting from the opposite value.

**Rule: a write test must move the value away from its resting state, then back.** One direction is
not enough either — a write stuck at a constant would pass a single-direction test.

This is the same family as the Phase 1.5 `?? 0` problem and the Phase 2 fixture failure: the
observation could not distinguish success from no-op. Three phases, three variants. Add to the
pre-gate checklist alongside "a passing happy path does not test the branch it did not take".

#### ⚠️ A deleted-and-recreated fixture invalidates a timeline

Round two reported the `volume: 0.354` write "reverting" to `13%`, with a careful call-by-call
timeline narrowing it to three candidate calls. **The fixture had been deleted and re-duplicated
between rounds.** The new `Ambience (Copy)` is a different document that inherited `13%` from the
original; nothing overwrote anything. The apparent collection-order instability has the same cause —
the new copy was created last and appended to the end of `contents`.

The reasoning was sound and the deciding fact simply was not in the record. **Rule: the identity of
the fixture is part of the evidence.** When a gate spans rounds, re-confirm the fixture is the same
document — a matching name is not a matching document.

_(Chased on the false premise: `PlaylistSound#debounceVolume` is the only path in Foundry that
persists a sound's volume besides an explicit `update()`, and its sole caller is the sidebar slider
handler `_onSoundVolume`, which writes with `diff: false`. Not needed here, but it does mean a stale
UI slider **can** clobber a programmatic volume write. Worth remembering if volume ever really does
revert.)_

#### Found during the gate: exact-vs-substring lookup resolves by collection order

`findPlaylist` OR's all three clauses inside a single `find()` predicate:

```ts
.find(p => p.id === query || p.name.toLowerCase() === lower || p.name.toLowerCase().includes(lower))
```

`Array#find` returns the first **element** matching **any** clause, so an exact match on a later
element loses to a substring match on an earlier one. Same single-pass shape in the sound lookup
inside `playPlaylist`, and in both the journal and page lookups in Phase 2's `showJournalToPlayers`.

Notably **`sendChatMessage` already does it correctly** — `getName()` exact first, _then_ a substring
pass. So the fix is to match the port's own existing precedent, not to invent anything.

**Latent, not currently biting:** with `Ambience` at index 0 and `Ambience (Copy)` later, searching
`"Ambience"` still resolves correctly. It bites when a playlist whose name _contains_ the query is
ordered ahead of the one matching it _exactly_. Filed to 7d — four call sites across Phases 2 and 3.

#### Notes for the gate

#### ⚠️ Three defects in the port source — one would have thrown, two were silent

The v14 API check paid off again. `PLAYLIST_MODES` has **no `SOUNDBOARD`**:

```js
DISABLED: -1,  SEQUENTIAL: 0,  SHUFFLE: 1,  SIMULTANEOUS: 2      // common/constants.mjs L784
"PLAYLIST.ModeDisabled": "Soundboard Only"                        // public/lang/en.json L1938
```

Foundry's "Soundboard Only" **is** `DISABLED (-1)`. `master` maps it to `3`.

| #   | `master` wrote                                     | Reality                                                                   | Severity                       |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------ |
| 1   | `soundboard: PLAYLIST_MODES?.SOUNDBOARD ?? 3`      | key does not exist → falls to `3`, and `mode` validates against `choices` | **throws** on v14              |
| 2   | `playlistModeName`: `case 3 → 'soundboard'`, no -1 | a real soundboard playlist has mode `-1` → falls to `default`             | **silent** — reports `unknown` |
| 3   | volume doc: "cubic … use `(p/100)^(1/3)`"          | the curve exponent is **1.5** (`AudioHelper.inputToVolume`, `order=1.5`)  | **silent** — wrong values      |

Row 1 fails loudly, which is the good case. Row 2 is the quiet one: `list-playlists` would have
labelled every soundboard playlist `unknown` forever, and nothing would have looked wrong.

Row 3 is worth its own note because the description **contradicted itself** and shipped anyway:
it correctly stated "0.5 displays as ~63%" while prescribing `(p/100)^(1/3)`, which yields 0.79 for
that same case. With `volumeToInput(v) = v^(1/1.5)`, internal 0.5 → 63% ✓, and the correct inverse
is `(P/100)^1.5`. Whoever wrote it measured one value empirically and then guessed the formula.

**Ported with rows 1-3 corrected**, on the Phase 2 precedent: a constant that does not exist is not
a re-derive to fix. `getSkillCode`-style upstream defaults were left alone.

#### Free behaviour worth knowing: `playAll()` no-ops on a soundboard playlist

Not a defect — `Playlist#playAll()` explicitly sets `playing: false` for `PLAYLIST_MODES.DISABLED`,
because that mode means "never plays on its own". A bare `play-playlist` on such a playlist would
have returned a confident `Playing playlist "X".` and produced silence. The port now detects the
mode and returns an explanatory message plus `playing: false` instead.

#### Carried, not fixed: `list-playlists` reports raw volume, not UI volume

`formatPlaylistsResponse` does `Math.round(s.volume * 100) + '%'` on the **internal** value, so a
track at internal 0.5 reads `"50%"` here while Foundry's own UI shows **63%**. Faithful to `master`,
and now inconsistent with `play-playlist`'s corrected description in the same tool file.

Left alone deliberately, on the Phase 2 rule: **deviate where v14 forces it, flag where the port is
merely imperfect.** Rows 1-3 were forced; this is a presentation choice with a real trade-off
(matching the UI would make the read and write scales differ). Filed to 7d.

#### Notes for the gate

- All three tools are **GM-gated** in `queries.ts`.
- `loop` and `volume` apply **only** when a specific `sound` is named — by design, since they would
  otherwise rewrite every track in the playlist. A bare `play-playlist` silently ignores them.
- `loop`, `volume` and `mode` are **persistent document updates**, not playback-session settings.
  They survive stopping the playlist. Set them on a track you do not mind changing.
- Expect the reported volume percentage to disagree with Foundry's slider. See above — that is the
  known carried item, not a Phase 3 failure.

### Phase 4 — Token distances + hidden tokens 📐 ✅ DONE (gate passed 2026-08-15)

**Goal:** Second shared-file re-graft, and the highest v14 API-breakage risk (canvas/grid `measurePath`).

> **⚠️ Rescoped in revision 4.** The stat block is **two-sided** and revision 3 listed only the
> server half. Porting row 3 without row 4 ships a formatter for a payload the module never sends.

> **Deployed as one cycle**, all three surfaces together, on Franklin's call 2026-08-13. The
> `CLAUDE.md` one-tool cadence was set aside deliberately: the three changes share no code path,
> each gate check is a single tool call, and the phase's headline risk (`measurePath`) was
> **de-risked by reading the v14 source before writing**, so the "1-2 fix cycles" budget below
> was likely pessimistic. Verify that against the gate before generalising it.

- [x] `token-manipulation.ts`: `get-token-distances` (new tool) + `formatTokenDetails` stat-block
      extension (row 3, 42 ln)
- [x] **`data-access.ts`: `getTokenDetails` → `this.extractTokenActorStats(token.actor)` and the
      new `extractTokenActorStats` helper (row 4, 5 + 54 ln).** Without this, row 3 has no data.
- [x] `scene.ts`: hidden tokens — **three lines across two methods.** `handleGetCurrentScene`'s
      zod default (row 1) plus `getToolDefinitions`' `includeHidden` default **and** its
      description (row 2). Changing only one leaves the tool and its schema disagreeing.
- [x] Check interaction with upstream's `8546b0f` synthetic-token-actor resolution — **none**, see below
- [x] Built, typechecked, formatted, bundled, deployed (both packages, matched pair).
      **216 insertions, 11 deletions**; every deletion is inside a line we own (the two
      `includeHidden` defaults) or the `actorData` block being replaced. No upstream line touched.
      Control-port probe: **51 tools** = 43 stock + 8 ported, `get-token-distances` present,
      and the live schema reports `includeHidden` `default: true`.
- [x] **You:** confirm hidden tokens appear in `get-current-scene`; request token distances;
      confirm `get-token-details` returns a full stat block, not just name/type/img
- **Gate:** distances correct in scene units; hidden tokens visible to GM; stat block populated.
- **Risk:** budget 1-2 fix cycles here specifically. This is the phase most likely to need iteration,
  and the estimate is a guess, not a measurement. **Outcome: zero fix cycles on the ported code.**
  The one deploy-blocking defect was an unrelated pre-existing backend crash (below). Reading the
  v14 API up front is what moved this phase from Med-High to first-try.

**Phase 4 gate results (2026-08-15)** — scene with 5 tokens, one hidden, two unlinked copies of
`Chelaxian Recruit` sharing `actorId: dZqZzPFjGYz7s7rs`.

| Check           | Result                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------- |
| 1a default flip | ✅ no-param call returned **5** tokens including the hidden one                                |
| 1b explicit off | ✅ `includeHidden: false` → **4**, exactly the one `hidden: true` token dropped                |
| 2a matrix       | ✅ `units: "ft"`, complete 6-pair matrix, **every pair `measurement: "grid"`**, no fallback    |
| 2b/2c diagonal  | ✅ Rabbit↔Ezren (Δ300,Δ300) = 20 ft, and the filtered call returned that one pair at 20 ft    |
| 3 hp isolation  | ✅ `hp.value` **0 vs 15** across two unlinked copies sharing one `actorId`                     |
| 3 conditions    | ✅ `["dead"]` on the damaged copy, `[]` on the clean one — **an array, not `{}`**              |
| 3 isLinked      | ✅ `false` on both                                                                             |
| 3 field spread  | ✅ `ac: 16`, `saves {fortitude:9, reflex:6, will:4}`, `traits`, `size` all real, cross-checked |

**Gate verdict: PASS.**

#### 🎯 The diagonal arithmetic discriminated three algorithms, where a ruler would have confirmed one

The gate asked for a ruler cross-check. What was done instead is strictly better and worth copying.
Rabbit→Ezren is 3 pure diagonals, and the three candidate algorithms give three different answers:

| Algorithm                          | Result       |
| ---------------------------------- | ------------ |
| PF2e alternating diagonal (5/10/5) | **20 ft** ✅ |
| Chebyshev (every diagonal 5 ft)    | 15 ft        |
| Euclidean (`√(300²+300²)/100×5`)   | ~21.2 ft     |

`20` is only producible by the grid's real rule. Rabbit→Recruit corroborates it independently:
4 diagonals + 1 straight = 5+10+5+10+5 = **35**, which is what came back. So `measurement: "grid"`
is not merely a label the code attached to itself — the numbers behind it could not have come from
the fallback branch.

**Rule: prefer a fixture where the candidate explanations produce different numbers over one where
the expected value merely matches.** A ruler agreeing with `20` would have confirmed the answer
without ruling out a coincidence; this rules out both rivals at once.

#### ✅ The `Set` fix is proven live — this is the one that would have shipped broken

`conditions: ["dead"]` on the damaged copy is the payoff for the v14 source read. Ported faithfully
from `master`, that field would have been `{}` on every token forever: `Actor#statuses` is a `Set`,
and `JSON.stringify(new Set(['dead']))` is `{}`. The clean copy returning `[]` rather than `{}`
completes it — both shapes are arrays, so the serialisation is right in both the populated and
empty cases.

#### ✅ Resolved: `level: 0` is a real value, not a `null → 0` coercion

The gate flagged this "cannot determine", reasoning that `0` is what a missing-value fallback
produces. **Not for this expression** ([`data-access.ts:7695`](../packages/foundry-module/src/data-access.ts#L7695)):

```ts
const level = sys.details?.level?.value ?? sys.details?.level ?? sys.details?.cr ?? null;
```

`??` falls through on `null`/`undefined` only, and `0` is neither, so a literal `0` short-circuits
the chain immediately. The other branches cannot yield `0` either: if `level.value` were missing
while `level` existed, the result would be the **object** `{…}`, and if `details.level` were absent
entirely it would fall through to `cr` and then `null`. **`0` is only reachable from
`system.details.level.value === 0`.**

Corroborated independently: `get-character` reports the same `0` through the server-side pf2e
adapter, a completely separate code path.

So the extractor is correct and this is not a Phase 4 item. Whether a level-0 NPC with AC 16 and
Fortitude +9 is _authored_ correctly is a question about the `pf2e-ap222-hellbreakers` module's
bestiary entry, answerable by opening the sheet. Not our code either way.

> **The `??` vs `||` distinction is why this was decidable.** With `|| 0` the gate's reasoning would
> have been exactly right and the value genuinely ambiguous. Worth remembering next time a `0`
> looks suspicious: check which operator produced it before calling it undeterminable.

#### Honest limits of check 3c, as reported

The gate's own caveat is correct and is recorded rather than smoothed over: `get-character` was
given an `actorId`, so it reads the base actor, and the undamaged token has an empty delta, making
"reads base actor" and "reads undamaged token" the same data by construction. 3c establishes that
the damaged token's delta does **not** bleed into the actor-level read. It does not establish which
document was read. To make it decidable, the clean copy needs some unrelated non-HP delta so the two
stop being byte-identical.

#### ✅ The headline risk did not materialise — `measurePath` is intact on v14

Checked against the installed v14 client source **before** writing, per the Phase 2 rule. The phase
was budgeted Med-High almost entirely on this API, and it survived:

| API                                 | v14 status                                                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grid.measurePath(waypoints, opts)` | ✅ intact, `common/grid/base.mjs:397`. Returns `{distance, cost, spaces, diagonals, euclidean, …}`, so `path.distance` is still valid and in scene units |
| `canvas.grid`                       | ✅ `client/canvas/board.mjs:496`, returns `scene.grid` (a `BaseGrid`), `null` on a blank canvas                                                          |
| `Token#center`                      | ✅ `client/canvas/placeables/token.mjs:448`, delegates to `document.getCenterPoint()`                                                                    |
| `{ gridSpaces: true }`              | ⚠️ **not a v14 option.** See below                                                                                                                       |

**`gridSpaces` was dropped from the port.** v14's `measurePath` documents exactly one option
(`cost`); `gridSpaces` appears nowhere in `common/grid/`. An unknown option is ignored rather than
fatal, so this was dead weight plus a comment (`// measurePath is the v12+ API`) asserting it
mattered. Distances are grid-aware because `measurePath` always is, not because of that flag.

#### ⚠️ Fourth instance of the recurring failure mode: `Actor#statuses` is a `Set`

The port source ended `extractTokenActorStats` with:

```ts
const conditions = (actor.statuses ?? []) as string[]; // master
```

`Actor#statuses` is a **`Set<string>`** (`client/documents/actor.mjs:83-87`, and it was a Set on
v13 too). The payload crosses the wire through `JSON.stringify`
([`socket-bridge.ts:492`](../packages/foundry-module/src/socket-bridge.ts#L492)), and a Set
serialises to `{}`. Server-side, `tokenData.actorData.conditions ?? []` then passes `{}` straight
through, because `{}` is not nullish.

So `conditions` would have arrived empty for every token, forever, with no error. Ported as
`Array.from(actor.statuses ?? [])`.

**This one is not v14 drift.** It was already broken on `master` and never noticed, because it only
shows up on a token that actually carries a condition _and_ only if someone checks that field.
Same family as the `?? 0` roll modifier, the `?? msg.author` speaker, and the `case 3` playlist
mode: a silent default standing in for a lookup that never succeeded.

#### `8546b0f` does not interact, and it confirms why the stat block matters

Upstream's synthetic-token-actor commit extends **`findActorByIdentifier`** only. `getTokenDetails`
already resolves through `scene.tokens.get(id).actor`, so there is nothing to reconcile.

The useful part is what it does _not_ cover: `getCharacterInfo`, which backs `get-character`, still
resolves only against `game.actors` by id or exact name
([`data-access.ts:1685-1691`](../packages/foundry-module/src/data-access.ts#L1685-L1691)). A
synthetic actor is not in `game.actors`, so **`get-character` cannot reach an unlinked token's own
HP or conditions at all.** That is precisely the gap row 4 fills: on a map with four copies of one
NPC, the per-copy damage is only readable through `get-token-details`.

#### Two things flagged, not fixed

- **The fallback branch measures differently from the primary one.** When canvas placeables are
  unavailable, `getTokenDistances` falls back to raw euclidean pixel math, which ignores the grid's
  diagonal rules. The two branches therefore disagree on a diagonal pair. Only reachable with an
  unrendered canvas, so latent — but the response now carries a `measurement` field
  (`grid` / `euclidean-fallback`) so the two can never be silently confused. That field is the
  one deliberate addition beyond the port, on the Phase 1.5 `warnOnMissingModifier` precedent:
  it cannot change a number, it only says which path produced it.
- **Elevation is ignored.** v14's `measurePath` gained 3D overloads with `elevation` on waypoints,
  but we pass 2D centers, so a creature flying 20 ft up measures as adjacent. Using it is a
  re-derive rather than a re-port, so it is filed to 7d.

#### Housekeeping: `npm run format` dirties five files we never touched, in two different ways

A repo-wide `npm run format` left five unrelated upstream files modified. They are **not** the same
problem, and the second one is worth knowing because it looks alarming and is not:

1. **One real reformat.** `tools/character.ts` — Prettier wrapped an over-long zod enum in
   `handleManageWorldItems`. **Upstream's tip is not fully Prettier-clean under its own config.**
2. **Four phantom modifications**, content **hash-identical to the index** (`git hash-object` ==
   `git ls-files -s`): `systems/dsa5/index.ts`, `systems/index-builder-registry.ts`,
   `utils/comfyui-paths.ts`, `shared/tsconfig.json`. `git status` reports them modified while
   `git diff` shows nothing at all, including `--raw`. Cause is this repo's
   `core.autocrlf=true` fighting `.gitattributes`' `* text=auto eol=lf`: Prettier touched their
   mtimes, and on refresh git decides the worktree differs from what a checkout would write, even
   though the blob is byte-identical. `git update-index --refresh` does **not** clear it.

All five reverted so the phase diff stays free of upstream noise. **Verify the hash before
reverting anything in class 2** — identical hashes are what makes the revert provably a no-op rather
than a discarded change.

Prefer the husky/lint-staged path (staged files only) over a repo-wide `npm run format`, or expect
to clean this up every phase. And when `git status` and `git diff` disagree, compare blob hashes
before believing either one.

#### ⚠️ Backend dies on an abrupt control-client disconnect (upstream, pre-existing)

Hit for real on 2026-08-15: the hand-started backend from the Phase 4 deploy exited 1 with an
unhandled `ECONNRESET`, leaving nothing on 31414/31415 and no lock file.

```
Error: read ECONNRESET
    at TCP.onStreamRead (node:internal/stream_base_commons:216:20)
Emitted 'error' event on Socket instance at: ...
```

Cause is in [`backend.ts` ~L1496](../packages/mcp-server/src/backend.ts#L1496): the control channel's
`net.createServer(socket => …)` attaches **only** a `data` listener to each connection socket. There
is no `socket.on('error', …)`. Node rethrows an `error` event with no listener as an uncaught
exception, so a client that RSTs its connection takes the whole backend down with it.
`server.on('error', reject)` at ~L1873 is on the **server**, not on connection sockets, and exists
only to reject the `listen` promise.

**Not a Phase 4 regression** — nothing in this phase touches socket handling, and the same code is
in stock v0.8.3. It is the second fragility found around the control channel, after Phase R's
double-wrapper race, and the two compound: a wrapper that loses the spawn race is exactly the kind
of client that disappears abruptly.

**This falsifies the Phase R note** claiming the backend survives abrupt disconnects. That note was
written from a test that must have closed gracefully. Corrected in place above.

**✅ FIXED and verified 2026-08-15.** A `socket.on('error', …)` handler now logs and drops the
connection instead of letting Node rethrow. Server bundles only; the module is untouched, so the
matched pair holds.

**Verified by reproducing the crash, not by assuming the fix.** `rsttest.cjs` connects to 31414,
writes a partial line so the backend has an active read, then calls `socket.resetAndDestroy()` to
send a real RST. Before: process dead. After:

```
mcp-server.log  {"error":"read ECONNRESET","level":"warn",
                 "message":"Control client socket error, dropping that connection"}
backend PID     89956 before → 89956 after, still listening
```

Same error string that killed the old process, now survived. That before/after pairing is the point:
a fix that merely fails to crash proves nothing unless the trigger is known to have fired.

#### ⚠️ Correction: the Phase R mitigation does not prevent this

Phase R's advice is _"make sure a backend is already listening on 31414 before starting Claude
Desktop; both wrappers then just connect, neither spawns, and there is no race."_ That is exactly
what was done on 2026-08-15, and the backend **still died**, because the RST comes from the losing
wrapper being torn down, not from it spawning anything. Having a backend up is what **exposed** it
to the reset rather than protecting it.

The two defects compound: the double-launch guarantees a wrapper gets killed, and the missing error
handler turns that routine teardown into a process kill. The Phase R mitigation addresses the
spawn race only. With the socket handler in place the teardown is now harmless either way.

#### Notes for the gate — each check needs a fixture that can actually fail

Three phases running have shipped a check that could not distinguish success from a no-op. All
three items here have that trap:

- **Hidden tokens: call `get-current-scene` with no arguments at all.** That is the only call that
  proves the _default_ flipped. Passing `includeHidden: true` explicitly would pass on stock code
  too, so it proves nothing. Cross-check the count against a call with `includeHidden: false`.
- **Distances: pick a diagonal pair**, and get ground truth from Foundry's own ruler. An orthogonal
  pair measures the same under grid rules and euclidean math, so it cannot discriminate the two
  branches. Also confirm `measurement: "grid"` in the response — `euclidean-fallback` on a rendered
  canvas would mean the placeable lookup failed.
- **Stat block: needs a token carrying a real condition** (prone, frightened), or the `Set` fix
  above is unfalsifiable — an unconditioned token returns `[]` whether the code is right or wrong.
  Use an **unlinked, damaged** token for the HP check, since that is the case `get-character`
  structurally cannot answer and therefore the reason row 4 exists.
- All three tools are **GM-gated** in `queries.ts`. Read them from a GM session.
- **A backend is already listening** (started by hand, PID logged at deploy time). Per the Phase R
  race note, start Claude Desktop _while it is up_ so neither wrapper needs to spawn one. Foundry
  was disconnected by the backend kill and **must be refreshed** after the client is up.

### Phase 5 — Quest journal `replaceContent` 📜 ✅ DONE (gate passed 2026-08-15, round 2)

Stays in the main line: **core-Foundry code, no module guard**, an exact 33-line reference, and
useful on any journal. But it carries a _soft_ module interaction that must ship with it.

- [x] Re-graft the `replaceContent` mode onto upstream's `update-quest-journal` (33 ln, shared file),
      plus the matching `getToolDefinitions` entry (also on `master`, and easy to miss: without it
      the parameter exists in the zod schema but is invisible to callers)
- [x] **Add a page-type guard** (the one deliberate addition): refuse `replaceContent` on
      `page.type === 'simple-quest.quest'` with an explanatory error. Needs no Simple Quest
      knowledge beyond a string compare, and removes the hazard below entirely.
- [x] Built, typechecked, formatted, bundled, deployed. **70 insertions, 1 deletion, one file** —
      `quest-creation.ts` only. Probe: still **51 tools**, `replaceContent` present on
      `update-quest-journal` with `default: false`.
- [x] **You:** test content replacement on a **plain** journal page in the v14 world
- **Gate:** `replaceContent` behaves as on old `master`; the guard refuses an SQ quest page.

**Phase 5 gate round 1 (2026-08-15)** — checks A and B **PASS**, C **inconclusive**, D **failed**.
One real defect found, in the guard's error reporting. Round 2 pending after the fix below.

| Check                       | Result                                                        |
| --------------------------- | ------------------------------------------------------------- |
| A — replace on a plain page | ✅ old body wholly gone, only the new marker remained         |
| B — append still works      | ✅ replaced content intact, new line appended after it        |
| C — guard refuses           | ⚠️ call failed, but with a **generic** error identical to D's |
| D — append on an SQ page    | ❌ failed, same generic error                                 |

**Phase 5 gate round 2 (2026-08-15)** — after the structured-refusal fix. Fresh fixtures: a
standalone `create-quest-journal` entry in folder "MCP Testing" for A/B, and the world's one
`simple-quest.quest` page for C/D, re-discovered by type rather than by a round-1 id.

| Check                    | Result                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| C — guard                | ✅ **returned**, not thrown; all five elements present (`refused`, `reason`, name, type, why) |
| C vs D distinguishable   | ✅ structured JSON return vs thrown error — no longer byte-identical                          |
| D — append on SQ page    | ⚠️ threw the same content-free generic error → **cannot determine** (fixed after, below)      |
| A — replace              | ✅ ~1.4 KB body reduced to the 122-char replacement; no fragment survived                     |
| B — append after replace | ✅ 122 → 199 chars, marker A intact with marker B appended after it                           |

**Gate verdict: PASS.** C is proven by an independent read of the response, not by inference.

#### Round 2 follow-up: the append path had the same reporting defect, and it is now fixed

The gate marked D **"cannot determine" rather than "fail"**, and was right to: the C/D pair was
distinguishable, which was the stated pass condition, but D's own error stayed the opaque template,
so _"a correctly-handled 'no readable content' case and a genuinely broken tool would still produce
this identical string."_

Worse, the refusal message in C **asserts** that append does not work on these pages. D could not
confirm that assertion, which made it an unfalsifiable claim in user-facing text.

Fixed symmetrically: the append path already holds `pageResult.type`, so a non-text page now returns
a structured `reason: 'unreadable-page-type'` explaining that the reader only returns body content
for text pages, with an extra sentence when the page is specifically an SQ quest page. **Zero extra
queries** — the type was already fetched and discarded.

This generalises beyond page types: **`ErrorHandler.handleToolError` erases the message of every
error thrown inside a tool handler.** Any diagnostic worth writing in this codebase must be returned,
not thrown, or it never reaches the caller. Two instances found in one phase, in one method.

#### ⚠️ The guard fired correctly and reported like a crash — the gate could not tell them apart

The gate's key observation: **C and D failed with byte-identical generic errors**, so C's failure
was not evidence the guard fired. It was equally consistent with every write to that page being
broken. _"A guard that refuses correctly and a tool that crashes indiscriminately are
indistinguishable from the outside here."_

Cause, confirmed after the fact: `handleUpdateQuestJournal` wraps its entire body in one `try`, and
its `catch` calls `errorHandler.handleToolError`, which maps an unrecognised error to type `system`
and **replaces the message** with a generic _"An unexpected error occurred / Check Foundry VTT
console"_ template ([`error-handler.ts:228`](../packages/mcp-server/src/utils/error-handler.ts#L228)).
The guard's carefully-worded refusal never reached the caller.

**Fixed by returning a structured refusal instead of throwing**, which also matches the existing
precedent in `queries.ts` (`{ error, success: false }`):

```ts
return {
  success: false,
  refused: true,
  reason: 'simple-quest-objective-state',
  pageId,
  pageName,
  pageType,
  message: '…',
};
```

A refusal is a policy decision, not an exceptional condition, and routing it through the error path
was the mistake. This is the direct cost of the thing Phase 5 was explicitly designed to get right:
the plan said _"the error message names the mechanism, not the prohibition"_, and then the message
was discarded before anyone could read it. **Writing a good message is not enough; verify it
survives to the caller.**

#### ❌ Append to an SQ quest page has never worked — the plan's rationale was wrong

Check D falsified a Phase 5 design claim. The plan argued against guarding append because
_"blocking it would be a regression for no safety gain."_ **There was nothing to regress.**

`getJournalPageContent` returns `page.type === 'text' ? page.text?.content : page.src || ''`, so an
SQ quest page reads as `""`. The append path then hits upstream's
`if (!currentContent) throw new Error('Journal/page exists but has no content to update')`.

Not a Phase 5 regression — this is upstream behaviour, identical on `master`. The decision to leave
append unguarded is still correct (there is nothing to guard), but it was reached from a false
premise, and only the gate caught that. The refusal message now says so explicitly, so a caller
told "use append instead" is not sent to a second dead end. **Filed to 7a**, which will need a
reader that can see `simple-quest.*` pages before append can work at all.

#### The scratch-page episode — two things worth carrying

The gate had no plain page to test on (every text page in the world belongs to the licensed
Hellbreakers AP), so one was created. Two lessons:

1. **`update-quest-journal newPageName` cannot create a top-level journal.** It takes a required
   `journalId`, so it always adds a page _inside_ an existing entry. The scratch page landed inside
   the Simple Quest "Quest Journal" and is invisible in the sidebar, plausibly because SQ renders
   only `simple-quest.*` page types. `create-quest-journal` is the tool that makes a standalone
   entry, and it takes an optional `folderName`.
2. **It changed the tool's default target.** `update-quest-journal` with no `pageId` resolves to
   `pages.find(p => p.type === 'text')`. That journal previously had no text page; now it has the
   scratch page, so any future no-`pageId` call against it hits the scratch page. Cleanup is manual
   — no journal/page delete tool is exposed.

**Gate-design note for next time:** name the fixture _inside_ the prompt, not in the surrounding
message. The gate stopped and asked which page to use, correctly, because check A is destructive
and "the plain page" was never defined in the prompt itself.

#### Not a 4-file port — one file, because both module-side pieces already exist

`updateJournalContent` (the write) and `getJournalPageContent` (which the guard needs) are both
already registered upstream, and the latter **already returns `type`**. So the guard cost one extra
query and zero module changes, and the module bundle is untouched, which keeps the matched pair
intact without a module redeploy.

#### The guard is narrower than "is this Simple Quest"

Two conditions, both required: replace mode **and** an SQ quest page. Everything else passes.

| Call                        | SQ quest page? | Outcome                                                        |
| --------------------------- | -------------- | -------------------------------------------------------------- |
| Create page (`newPageName`) | n/a            | proceeds; never touches existing state                         |
| Append (default)            | no             | proceeds                                                       |
| Append (default)            | **yes**        | **proceeds** — existing `<li>` text is unchanged, so keys live |
| `replaceContent: true`      | no             | proceeds; this is the feature                                  |
| `replaceContent: true`      | **yes**        | **refused**, nothing written                                   |

Appending to an SQ page is deliberately still legal. Blocking it would be a regression for no
safety gain, since appending cannot change an existing objective's text and therefore cannot change
its derived key.

**The guard only runs when `pageId` is given**, and that is sufficient rather than lazy:
`updateJournalContent`'s no-`pageId` path selects `journal.pages.find(p => p.type === 'text')`, so
an SQ quest page is unreachable without an explicit id. Verified in the module source, not assumed.

#### Deliberately not built for Phase 7a

7a is a **replacement** for this guard, not an extension of it: "refuse because the keys would
orphan" and "remap the keys so they do not" share no logic. Three plan claims about Simple Quest
have already proven wrong, so designing Phase 5 around assumptions about 7a's shape invites a
fourth. Decisions taken instead:

- **Interface identical to `master`'s** (`replaceContent: boolean`, nothing else). When 7a lands,
  callers change nothing; the error simply stops happening.
- **No `force` / `bypass` flag.** It would become permanent API surface whose only purpose is
  performing the destructive write the guard exists to prevent.
- **The error message names the mechanism, not the prohibition** — the derived-key behaviour is
  precisely what 7a removes, so the message documents the seam.
- **The page-type test is an isolated predicate** (`isSimpleQuestQuestPage`), so 7a has one obvious
  place to replace rather than an inline string compare to hunt for.

**The refusal is itself a gate fixture for 7a.** It gives a documented operation that provably
fails today, so 7a's gate becomes "the exact call Phase 5 refused now succeeds **and** the
checkboxes survive". Without it, 7a's gate would be "replace content, check the boxes are still
ticked", which passes trivially if the remapping silently no-ops on a page whose keys happened not
to change. Same before/after discipline as the RST reproduction in Phase 4.

#### 🔒 MCP cannot create a Simple Quest quest page — scoping constraint for 7a

Franklin, 2026-08-15: _"Simple Quest ONLY reads quests created inside of it."_ Structurally true
from our side as well: `updateJournalContent`'s create path hardcodes `type: 'text'`
([`data-access.ts`](../packages/foundry-module/src/data-access.ts), mode 1), and
`create-quest-journal` makes an ordinary `JournalEntry`. **Nothing MCP creates can ever be a
`simple-quest.quest` page.**

Two consequences, one reassuring and one that scopes 7a:

- The guard can only ever fire on a genuine SQ page, and an MCP-created journal is never at risk
  from `replaceContent`. The narrow scoping above holds.
- **7a can modify existing SQ quests but not create them.** Creating one means writing a page with
  `type: 'simple-quest.quest'` and a fully populated `system` schema directly via
  `createEmbeddedDocuments`, bypassing SQ's own creation flow — a materially bigger job than
  toggling an objective, and one that would need the 5.1.4 schema reproduced faithfully. Decide
  explicitly whether 7a is in the modify-only business before starting it.

This also explains the scratch-page confusion in gate round 1: an MCP-created page dropped into the
SQ journal is invisible in SQ's interface because SQ renders only `simple-quest.*` subtypes, and it
was never going to be anything else.

#### Scope decision: `simple-quest.quest` only, not `simple-quest.*`

SQ 5.x ships twelve page subtypes; only `quest` carries `system.objectiveState`. The others keep
their data in typed `system` fields that a `text.content` rewrite does not touch. Guarding all of
them would refuse writes that are provably safe, and a guard that refuses more than it must trains
callers to route around it. Narrow it is — but re-verify against the installed 5.1.4 module before
7a, per the standing rule.

#### ⚠️ `replaceContent` silently wipes Simple Quest objective state

No module guard catches this, because there is nothing to guard — it is plain Foundry journal code.
The hazard is structural, verified 2026-08-13 against the shipped `quest.json`:

- Objectives live in `page.text.content`, as `<li>` elements.
- Their state lives **separately** in `system.objectiveState` / `objectiveSecrets`, keyed by a slug
  **derived from that `<li>` text** at render time (`_getObjectiveKey`).

Rewriting `text.content` changes the derived keys, so every stored entry orphans: all checkboxes
and secrets reset to unchecked, **with no error and a success response**. Same signature as the
rest of the Simple Quest work — a write that succeeds and means nothing.

Phase 7 can do this properly by remapping state onto the new keys. Phase 5 just refuses.

### Phase 6 — Promote & document 🏁 ✅ DONE (2026-08-15)

- [x] Archive branches created **first**, and SHA-verified against the originals, before anything
      moved. `archive/master-sf2e-v13` → `fd66b9a`, `archive/v14-port-v082` → `8dc4f59`.
- [x] Make `v14-port-v083` the new `master` — confirmed by Franklin, then `git branch -f master`.
      `master` and `v14-port-v083` now both point at `4008b12`.
- [x] Update `CLAUDE.md`: v14/pf2e state, 51-tool count, ported-vs-parked list, corrected commands,
      control-port verification, the gate-design rules, and the audit-script workflow.
- [ ] Refresh memory + vault session log
- **Gate:** you confirm. The only mildly destructive git step in the plan.

#### Branch layout after promotion

| Branch                    | Commit    | Role                                                      |
| ------------------------- | --------- | --------------------------------------------------------- |
| `master`                  | `4008b12` | **current line** — v0.8.3, Foundry v14, pf2e              |
| `v14-port-v083`           | `4008b12` | same commit; kept as the migration branch name            |
| `archive/master-sf2e-v13` | `fd66b9a` | old sf2e/v13 line (v0.7.0), port source for the remainder |
| `archive/v14-port-v082`   | `8dc4f59` | interim v0.8.2 branch, Phase 1 combat reference           |

#### ✅ Published 2026-08-15, archives first

Franklin authorised the publish after the promotion. Local `master` had reported **ahead 116,
behind 14** of `origin/master` — different lineages rather than divergent histories, which is what
re-forking produces. The merge base is `62cd3fb`, the original fork point; the "14 behind" are the
sf2e line's own custom-tool commits, i.e. exactly the work this migration re-ported by hand.

A plain push is rejected in that situation because the remote tip is not an ancestor of the new one,
so this needed a force push. Done in the safe order:

1. `git fetch origin`, confirm `origin/master` still at `8105290` (nothing moved under us).
2. Push **both `archive/*` branches first**, and verify their SHAs on the remote with `ls-remote`.
3. `git push --force-with-lease=refs/heads/master:8105290 origin master`. The explicit lease means
   the push aborts rather than clobbering anything if the remote moved after step 1.

**Verified afterwards that nothing was destroyed:** `git merge-base --is-ancestor 8105290
archive/master-sf2e-v13` confirms the old `origin/master` tip is still reachable from a permanent
named branch. Checked, not assumed.

| Remote branch             | Commit    |                                                     |
| ------------------------- | --------- | --------------------------------------------------- |
| `master`                  | `4056ae8` | v0.8.3 / Foundry v14 / pf2e                         |
| `archive/master-sf2e-v13` | `fd66b9a` | old sf2e line, incl. 2 commits the remote never had |
| `archive/v14-port-v082`   | `8dc4f59` | interim reference                                   |
| `v14-port`                | `8dc4f59` | pre-existing, untouched; safe to delete             |

Still live as a hazard: the `upstream` remote has a **push** URL to `adambdooley/foundry-vtt-mcp`.
A careless `git push upstream` would attempt to write to the real upstream. Phase R unset tracking
on this branch for that reason; keep it that way.

#### Why the archive had to go first

Old `master` was ahead of its **own** remote by 2 unpushed commits (`fd66b9a` and one before it).
So `archive/master-sf2e-v13` is a strict superset of what `origin/master` held: pushing the archive
made the fork _better off_ than before, while force-pushing `master` alone would have made those two
commits unreachable from any branch. Ordering was the whole safety margin.

### Phase 7 — Module-dependent re-integration & enhancements 🧩 ⬜ (new, 2026-08-13)

**Goal:** Everything whose correctness depends on a **third-party module we do not control**. Runs
_after_ the fork is whole and promoted, so module churn can never block the migration itself.

**Why this phase exists.** Franklin's call, 2026-08-13: make the fork whole first, then recheck the
module-dependent tools fresh, because those modules changed a lot. The Simple Quest investigation
proved the point — three separate plan claims about SQ were wrong, each because the plan described
3.0.20 behaviour that 5.1.4 no longer has. That work is **not a re-port**: there is no known-good
reference to copy, because the target moved. Doing it alongside genuine re-ports would quietly
violate strategy decision 4 while looking like compliance.

**Entry condition:** Phase 6 complete — fork whole, promoted, every core tool proven.

> **Scope decision, 2026-08-15 (Franklin).** Run **7d first and alone**. Simple Quest (7a **and**
> 7b) is deferred until it gets its own analysis and plan, because 5.1.4 differs from 3.0.20 far
> more than a re-port assumes — the same reasoning that created this phase. 7c is **parked on a
> prerequisite**, see below. The `getJournalPageContent` reader fix stays with 7a: it is listed on
> 7a's checklist and its only fixture and consumer are Simple Quest pages. It has standalone value
> (`pf2e-bestiary-tracking` ships custom page subtypes that read as `""` for the same reason), so
> it can be pulled forward as its own cycle on request.
>
> 7d ordering, by live-session value against risk: `get-token-distances` → `read-chat` speaker →
> playlists → `show-journal-to-players` → `rollMode` → pf2e adapter. One deploy cycle each.

#### 7a — Simple Quest integration ⬜ **designed 2026-08-16, not started**

> **Design session, 2026-08-16 (Franklin + Claude).** This section **supersedes** the 7a and 7b
> checklists that stood here before it, and discharges the 2026-08-15 scope decision above ("Simple
> Quest is deferred until it gets its own analysis and plan"). The old 7a listed
> `set-quest-checklist-item` / `set-quest-visibility` as tools to rebuild; that framing came from
> the 3.0.20 tool names and is not the shape the work actually has. The old 7b logged typed page
> subtypes as an unclaimed opportunity; it is now the centre of the phase, not an addendum.
>
> Everything below was read from the installed 5.1.4 source on 2026-08-16, plus core v14 for the
> two claims that depend on it. Citations are to files on disk.

**What this is for.** Franklin's framing: premium pf2e modules ship their own adorned Foundry
journals carrying the adventure's prose and logic, written for the GM. Simple Quest is **not** a
replacement for those. It is the **living campaign layer** — what actually happened at the table,
plus light prep on places, factions and timeline — which the MCP assistant fills in during and
after play. The assistant reads the module's journals for source material and **composes new SQ
pages from them**.

**🔒 Scope boundary (Franklin, 2026-08-16): never write into module journals.** Read and recompose
only. No `ForcedReplacement`, no `page.update({type: ...})` promotion of a stock page, no content
edits. Module journals frequently carry embedded macro triggers (scene switches and the like) and
mutating a page's type or content can break that logic. Promotion is technically trivial (SQ's own
`migrateQuestJournal` does exactly it) and is **declined on purpose**, not for lack of a mechanism.

##### What the investigation established

The single most consequential finding, because it invalidates how this document has framed the
blocker since Phase 5:

> **⚠️ Correction, 2026-08-16. SQ pages are not unreadable — we never look at the field they use.**
> The page body of every `simple-quest.*` type is the **core Foundry `page.text.content`**, format
>
> 1. `templates/journal-page-sheets/quest-view.hbs` L9 renders `{{{text.enriched}}}`, and the
>    shipped `assets/example-journals/quest.json` L40-42 stores the entire "Welcome to Simple Quest"
>    prose there. `system.*` carries only the structured extras.
>
> Previous revisions said the reader "returns `page.src` for non-text page types, so every
> `simple-quest.*` page reads as `""`", and scoped that as a blocker gating all of 7a. The **cause**
> is right (`data-access.ts` L4201 branches on `page.type === 'text'`). The **conclusion** was
> wrong. The content is present and has always been present; the reader steps past it. This is a
> one-line branch fix, not a rebuild, and it unblocks the phase rather than gating it.
>
> Fifth instance of the recurring failure mode, and the first where it bit the _plan_ rather than
> the code: a silent default (`: page.src`) standing in for a lookup that was never attempted.

| Fact                                                                          | Evidence                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **11** page subtypes, not twelve                                              | `module.json` `documentTypes.JournalEntryPage` — quest, lore, character, creature, faction, location, event, era, achievement, map, investigation                                                                                                        |
| Page body is core `text.content`                                              | `quest-view.hbs` L9; `quest.json` L40-42                                                                                                                                                                                                                 |
| `system` is composed from **8 reusable block classes**                        | `scripts/handlebars/*.js`, each a `static getSchema(label, key)`                                                                                                                                                                                         |
| Block field keys are mechanical: `<blockName><index?>`                        | `html`, `html0`…; `iconList0`…; `stats0`…; `table0`…; `colorTags0`…; `colorHtml0`…; `resources`; `mainTag`                                                                                                                                               |
| `module.json` `htmlFields` is **stale**                                       | It advertises `description.content` / `objectives.content`; **neither field exists** in the 5.1.4 schema. Do not build against it.                                                                                                                       |
| SQ ships a **live schema exporter**                                           | `scripts/journal/JournalPageSchemaExporter.js` — `exportAllSchemas()` walks `CONFIG.JournalEntryPage.dataModels` and serialises every field                                                                                                              |
| Page templates are **static HTML appended to `text.content`**                 | `scripts/journalTemplates.js` L19-46: `fetch(t)` → `textContent + "\n" + template` → `page.update({'text.content': …})`. Twelve files in `templates/JournalTemplates/`. The literal `https://source.unsplash.com/random` is the file-picker placeholder. |
| SQ registers **custom enrichers** usable in `text.content`                    | `scripts/enrichers.js`: `@QUEST[uuid]{…}`, `@LORE[…]`, `@MAP[…]`, `@TTM[src]{title\|caption}`, `@COUNT[id]{max}`, `@REPUTATION[id,color,icon]{min,max}`, `@time[…]`                                                                                      |
| Page image is plain data                                                      | `system.src` (`FilePathField`, IMAGE) + `system.aspectRatio` + `system.imageFilter`; `quest-view.hbs` L13-15                                                                                                                                             |
| List items carry `hidden`, and a block vanishes when **all** items are hidden | e.g. `IconListBlock.js` L53-54, L78                                                                                                                                                                                                                      |
| `system.tags` and `achievement.awardedTo` are **`SetField`s**                 | Fifth instance of the `Set`-serialises-to-`{}` trap (Phase 4, Phase 5). Needs `Array.from()` module-side.                                                                                                                                                |

Two findings that change tool behaviour, both verified against **core v14**, not inferred:

> **⚠️ `show-journal-to-players` grants no permission.** It calls `Journal.show(doc, {force:true})`,
> and core is explicit (`client/documents/collections/journal.mjs` L56-69): the call emits a
> `showEntry` socket that force-renders the document on player clients **regardless of normal
> permission**. Close the window and it is gone; nothing in the player's sidebar changed.
>
> This is a live trap for the workflow below. Mid-session "give the party the quest" plausibly
> reaches for this tool, and it will look like it worked. **7a must tighten that tool's description
> to say it is a temporary spotlight that grants no access.**

> **⚠️ Objective secrets are a display convention, not a security boundary.** Core defines
> `.hidden { display: none !important; }` (`public/css/foundry2.css` L5697), and SQ hides a secret
> objective by adding that class (`JournalPageHelpers.js` L417-420). The player's browser has
> already received the **full** `text.content`, secrets included; devtools shows the lot.
>
> Consequence for prep: genuinely spoiler-sensitive material must ride on **page ownership** (the
> document never reaches the client), not on `objectiveSecrets` or block `hidden`.

##### The three visibility axes (they are independent)

| Axis            | Field                                               | Controls                                             | Does **not** control            |
| --------------- | --------------------------------------------------- | ---------------------------------------------------- | ------------------------------- |
| Page access     | `ownership`, on the **page and its parent journal** | Whether the page exists for the player at all        | anything inside the page        |
| Quest state     | `system.status` (-1 / 0 / 1 / 2)                    | The status badge, and Quest Recap grouping           | **visibility of anything**      |
| Content secrets | `system.objectiveSecrets`, block item `hidden`      | What is redacted inside a page they can already read | whether they can reach the page |

`status: -1` ("Undiscovered") hides nothing. Its only readers are the sidebar's Quest Recap
grouping (`JournalBrowser.js` L324, L398-401). This confirms the 2026-08-13 correction already
recorded further down, from the opposite direction.

> **⚠️ Two-level ownership gotcha.** A player needs OBSERVER on the **JournalEntry** to see it in
> the sidebar at all. Page `ownership.default` is `-1` (inherit) by default, and the shipped example
> has the journal itself at `0` (none). Granting only the page leaves the player seeing nothing,
> while every write reports success and every read-back confirms the field. **Gate this from a real
> player login, never by reading the fields back.**

##### The lifecycle this has to support

Franklin's prep-then-reveal pattern, which is what drives the tool split:

```
prep         create-simple-quest-page   page hidden · status -1 · objectives written but secret
                                        · pre-populated list items hidden
party takes  set-journal-visibility     page → observer (both levels); reveal chosen objectives
             set-quest-progress         status → 0 (In Progress)
             show-journal-to-players    optional, transient spotlight
mid-play     set-journal-visibility     reveal further objectives / NPC facts as earned
             set-quest-progress         objective → checked (or failed)
resolution   set-quest-progress         status → 1 or 2
```

Two calls at hand-off rather than one compound call, deliberately: "the party can see this" and
"the quest is now in progress" fail differently, and a single call hides which half did not land.

##### Tool granularity — decided 2026-08-16

**Generic transport with live-schema validation**, not per-type tools. The numbers drove it: of the
six priority types, only three have any type-specific scalar fields at all.

| Type                              | Type-specific scalars beyond the shared blocks                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `quest`                           | status, questGiver, location, difficulty, deadline, objectiveState, objectiveSecrets, observerObjectivePermission |
| `location`                        | population, area, government, demonym, ruler, founded                                                             |
| `faction`                         | leader, headquarters, memberCount, alignment, goals, rivals, allies                                               |
| `character` · `creature` · `lore` | **none** — they differ only in which blocks they carry                                                            |

Per-type tools would be six near-identical schemas, six deploy cycles before a single page could be
written, and a permanently-resident tool-list cost (Lore alone carries three each of six block
types). SQ is a protected module on theripper93's release cadence, and hand-mirrored Zod schemas
rot silently; `exportAllSchemas()` cannot.

> **The generic design is only acceptable with validation attached.** Foundry DataModels **silently
> discard unknown keys** on `update()`. Submitting `system.description` (exactly what SQ's own stale
> `module.json` advertises) returns a clean success with nothing written. That is the house failure
> mode, sixth instance.
>
> **Every write tool must validate the submitted `system` object module-side against the live
> `CONFIG.JournalEntryPage.dataModels[...]` schema and return the rejected keys alongside the valid
> ones.** The error is the documentation: a wrong guess costs one round trip and teaches the correct
> field names, instead of costing tokens in every session's tool list. Without this, build per-type
> instead.

**Split by gesture, not by data structure.** The two live-play tools divide the way Franklin's
sentences divide, not the way the schema does:

- `set-quest-progress` — "they finished the second objective", "the quest failed"
- `set-journal-visibility` — "the party can see this now", "they learned the thing about the Hellknights"

Those are two sentences and five field paths. The boundary follows the sentence.

##### Cycles

Priority page types, in order: **quest · lore · location · character · creature · faction**. Then
`event` / `era` (timeline). `map`, `achievement` and `investigation` are deferred (see 7b).

One tool per deploy cycle, per the standing cadence rule.

**7a.0 — Foundation (three cycles, no new tools).** All three are generic defect fixes with value
beyond Simple Quest (`pf2e-bestiary-tracking` also ships custom page subtypes).

- [x] **0a · Reader.** ✅ **DONE, gate passed 2026-08-16.** `getJournalPageContent` returns
      `text.content` when the page has one, keeps `src` for genuinely src-backed types, and adds
      `system` to the payload. Also returns a parsed **objective manifest** for
      `simple-quest.quest` — `{index, depth, text, key, state, secret}` per `<li>`, document order.
      The manifest lives here, not in the reveal tool, because `create-simple-quest-page` and
      `set-quest-progress` need the same parse.
      **Module-side, necessarily:** key derivation needs `enrichHTML`, a DOM, and Foundry's
      `String#slugify`, none of which exist server-side. It must run against the **enriched** DOM —
      an `@QUEST[…]{Label}` inside an `<li>` changes `textContent` and therefore the slug.
      See **0a as built** below for four corrections the installed source forced.
- [x] **0b · Writer.** ✅ **DONE, gate passed 7/7 2026-08-16.** `createJournalEntry` /
      `updateJournalContent` accept `type` and `system` instead of hardcoding `type: 'text'`.
      Unknown-key validation against the **live** DataModel lands here, so both write tools
      inherit it. Tool surface: `pageType` + `pageSystem` on `update-quest-journal` only.
      ⚠️ **`getJournalContent` moved out to 0d** — see below.
- [x] **0c · Search.** ✅ **DONE, gate passed 5/5 2026-08-16.** `handleSearchJournals` skipped
      every non-text page
      (`quest-creation.ts` L764: `if (page.type !== 'text') continue;`). Every SQ page we create
      would be unsearchable. Fix the skip. Note in passing: it also does one WebSocket round trip
      per page, which will be slow in a module world — **measure before optimising**, do not bundle
      a rewrite into this cycle.
- [x] **0d · Journal-level reader/writer alignment** ✅ **DONE, gate passed 6/6 2026-08-17**
      (split out of 0b, 2026-08-16).
      `getJournalContent` picks `pages.find(p => p.type === 'text')` and has the same defect 0a
      fixed, so an all-Simple-Quest journal reads as empty at the journal level.
      **Why it is not in 0b:** its consumer round-trips. `update-quest-journal`'s
      append-without-`pageId` path reads through `getJournalContent` and writes through
      `updateJournalContent`'s own first-`text`-page lookup. Fixing the read alone makes append
      **read page A and write page B**. Worse, the Phase 5 guard's comment records that it is only
      reachable _with_ an explicit `pageId` "because without one, `updateJournalContent` targets
      the first page of type `text`, which an SQ quest page never is" — so widening the reader
      silently puts a wholesale `text.content` write back on a quest page and disarms the guard.
      Fixing neither keeps read and write consistent, which is the property that matters.
      **The fix is to stop matching two lookups and resolve once:** have the read return the page
      id it resolved, and have the append path pass that id explicitly to the write, so the two
      are the same page by construction rather than by coincidence — which also makes the Phase 5
      type guard cover the previously unreachable case. Gate: away-and-back on a journal whose
      first page is **not** a text page.

##### 0d gate result — 6/6, 2026-08-17 (journal-level reader/writer alignment) — **Phase 7a complete**

| #   | Check                                                                | Result                       |
| --- | -------------------------------------------------------------------- | ---------------------------- |
| 1   | Journal-level read finds a body page where it returned `""`          | 58 chars, `Gate Quest`       |
| 2   | It says **which rule** fired                                         | `currentPageIsFallback=true` |
| 3   | Append with no `pageId` refuses on a module page, **writes nothing** | 0 pages changed              |
| 4   | `link-quest-to-npc` refuses the same way, **writes nothing**         | 0 pages changed              |
| 5   | With a text page present, text wins                                  | `fallback=false`             |
| 6   | The write lands on the resolved page and **no other**                | exactly 1 page changed       |

**Checks 3 and 6 are the pair that matters.** Both snapshot every page body in the journal and
compare afterwards, because the defect this cycle exists to prevent — read page A, write page B —
shows up as a body changing somewhere nobody named. A response-only assertion could not see it.

**What was actually fixed.** `getJournalContent` now resolves text-page-first then falls back to any
page carrying a `text.content` body. That alone would have been dangerous:
`updateJournalContent`'s own no-`pageId` path searches for a _text_ page, so the two lookups could
resolve differently, and Phase 5's guard comment explicitly relied on that path never reaching a
quest page. So the reader also returns `currentPage.id` and `currentPageIsFallback`, and **both
round-tripping write paths pass that id back explicitly** — `update-quest-journal`'s append and
`link-quest-to-npc`. Read and write are now the same page by construction rather than by two
lookups agreeing. Both refuse a non-`text` resolved page, which keeps write behaviour identical to
before while making Phase 5's guard cover the case it previously could not reach. Verification reads
back the same resolved id, so a verify cannot pass by reading a page the write never touched.

###### Two gate defects found and fixed in the running

- **A whitelist swallowed the new field.** Checks 2 and 5 first failed with
  `currentPageIsFallback=undefined`: the module set it, but `list-journals`' journal mode returns an
  explicit list of fields and the new one was not on it. The alignment worked regardless (3/4/6
  passed, since the write paths read the module response directly) — but the flag exists _for_
  callers, and no caller could see it. **Adding a field to a reader is not done until every
  passthrough that whitelists fields has been updated.**
- **The fixture had to be fresh per run.** Check 5 adds a text page, which makes checks 1-4
  unfalsifiable on any re-run against the same journal. Now a new journal per run. Cheaper to
  create one journal than to score a check that cannot fail.

##### 7a.5 gate result — passed, 2026-08-17 (`set-journal-visibility`, 55 → 56 tools)

**Verified from a real player login**, as the plan required — a second Foundry session logged in as a
player, watching live while the GM side drove the tool. Fixture: `Gate Nested Quest` in the shared
`MCP Gate Fixture` journal, built with a **secret parent** ("Identify the leak") holding two secret
children, plus a secret sibling. It had to be created nested rather than appended to, because 7a.4
refuses nested appends for the re-keying reason.

| Stage | Action                                          | Player screen                                        |
| ----- | ----------------------------------------------- | ---------------------------------------------------- |
| setup | page created hidden, all objectives secret      | nothing                                              |
| 1     | grant access + reveal the sibling               | quest appears with **one** objective                 |
| 2     | **reveal a child whose parent is still secret** | **no change** — and `hiddenByAncestor` reported      |
| 3     | reveal the parent                               | parent + that child appear, **sibling stays hidden** |
| 4     | five refusal checks                             | not player-visible                                   |

**Stage 3 is what proves the cascade only suppresses and never grants.** Both children sit under the
same now-visible parent, yet one appears and one does not. That is why stage 2 refuses to
auto-reveal the ancestor: doing so would have pushed "Compare the seals" to the party unasked, and
nothing on the GM's screen would have said so.

The `hiddenByAncestor` ancestor key came back as
`identify-the-leakread-the-writ-ledgercompare-the-s` — the parent's slug swallowing both children
and cut mid-word at 50 characters. The 0a keying rule, visible in live data.

###### ⚠️ The bug this gate caught: a **false success** on a silently-discarded write

Stage 1 first reported `revealed: ["report-to-the-lictor"]` while the stored value stayed `true`.
The reveal had removed the key from the secrets map and written the map back — but **Foundry merges
an object write into the stored value**, so a key absent from the submitted map is simply not
mentioned and the old `true` survives.

Two things make this the worst instance of the house pattern so far:

1. **It reported success.** A failure gets investigated; a false success does not. Had the gate
   checked only the tool response — as an earlier harness would have — it would have passed, and the
   defect would have surfaced at the table as "I revealed that, why can't they see it?"
2. **The source had already said so.** `JournalPageHelpers.js` L449 shows Simple Quest's own toggle
   doing `mergeObject(currentSecrets, {[key]: !current})` — it stores `false`, it does not delete.
   That was read during design and then overridden anyway, on the theory that dropping the key kept
   the map tidier. **Reading the source is not enough if you then override what it shows you.**

Fixed by storing `false`, matching the module. And `set-journal-visibility` now **reads the field
back after writing and refuses to claim success if the write did not take**
(`reason: 'write-not-applied'`). A tool that changes what players can see must not take its own word
for it.

Neighbouring tools checked for the same failure mode: `set-quest-progress` and
`create-simple-quest-page` only ever **set** keys, never remove them, and setting works correctly
under merge — so they are safe by construction, not by luck.

###### ⚠️ Check (e) passed while testing nothing

The first stage-4 run scored `e. refuses a non-Simple-Quest page` as PASS on the message
`Page not found: nope` — the fixture journal has no text page, so the harness had fallen back to a
literal `'nope'` and the refusal was for a **missing** page, not a wrong-typed one. Re-run against a
real text page (`License` in the Hellbreakers `Frontmatter` journal), asserting ownership unchanged
on both levels.

Also worth carrying: the redo uses `revealObjectives` rather than `visibleToPlayers`. **Never probe a
guard with the payload you would regret if the guard is broken** — a failed reveal on a text page is
inert, whereas a failed ownership write would have granted players access to a module-authored
journal.

###### Confirmed from the player side, incidentally

- **`status: -1` hides nothing.** The page rendered for the player with an `UNDISCOVERED` badge the
  whole time. Previously inferred from reading `JournalBrowser.js`; now observed.
- **There is no Simple Quest setting to hide undiscovered quests from players.** All 43 registered
  settings were checked; the word "Undiscovered" appears once in the module, as a status label, and
  the recap grouping code does no status or permission filtering. `hideFolderFromPlayers` hides the
  folder from Foundry's own sidebar, which is a different thing. **Ownership is the only lock**, and
  the prep default of hidden + `-1` is what keeps prep quests invisible.

###### ⚠️ Page ownership inside a visible journal is a display boundary, not a security boundary

Franklin spotted a bare `MCP GATE FIXTURE` header under "In Progress" on the **player** screen, with
no page beneath it. Traced to `JournalBrowser.js` ~L325-339:

```js
if (journal.pages?.some(p => p.system?.status === 0)) {
  // no permission filter
  questJournals.inProgress.push(entry);
}
```

Grouping walks **every** page in the journal regardless of permission, while the page rows under each
group are filtered by `isObserver` (L367). Hence a header with nothing under it.

**The consequence is bigger than the cosmetic glitch.** That check ran on the player's client and
returned true, which proves the player's browser holds the hidden page's data — its `status`, and per
`pageToItem` its `name` and entire `system` object. Nothing rendered it; it is present in memory
anyway.

So page-level ownership **within a journal the player can see** hides a page from display, not from
the client. Same shape as the `objectiveSecrets` finding recorded earlier — content reaching the
client and being hidden with CSS — but broader, because it covers a whole page presumed locked.

**Consequence for how these tools should be used:** genuinely spoiler-sensitive prep belongs in its
**own journal, with the journal hidden**, so the document never reaches the client.
`create-simple-quest-page` already does this when called with `folder` (new journal, ownership NONE
on both levels). The exposure appears only when `journalId` co-locates prep pages inside a journal
players can already see — which is exactly what stage 4's check (d) did, producing the observed
header.

**Deliberately out of scope, so it is not mistaken for missing:** `hidden` on **block list items**
(the third visibility surface the 7a design lists). The quest-facing axes are ownership and
objective secrets, which is what the plan's gate line covers. Block items belong with a follow-on
cycle that manages blocks properly.

##### 7a.4 gate result — 10/10 + UI confirmed, 2026-08-17 (`set-quest-progress`, 54 → 55 tools)

Fixture: the shared `MCP Gate Fixture` quest page. **Both halves ran**: 10 data checks through the
control port, and the render confirmed by eye in the Simple Quest window.

| #   | Check                                                  | Result                                 |
| --- | ------------------------------------------------------ | -------------------------------------- |
| 1-3 | checked → failed → unchecked, addressed by exact text  | `1 → 2 → 0`, stored and manifest agree |
| 4   | Read-modify-write: neighbour untouched                 | unchanged                              |
| 5   | Status by name                                         | `in-progress` → `0`                    |
| 6   | **Append: pre-existing keys survive and stay checked** | 3 → 4 keys, victim still `1`           |
| 7   | Appended text is inert                                 | `<ul><li>…` added **1** key, not 2     |
| 8   | Unmatched selector fails loudly                        | `objective-not-found`, nothing moved   |
| 9   | Unknown state refused, not coerced                     | valid values listed                    |
| 10  | Non-quest page refused                                 |                                        |

**UI confirmation (the half the tool response cannot give):** checked renders as a filled marker
with strikethrough; **failed renders red** — red marker, red strikethrough — visibly distinct from
checked; unchecked is an empty box. The appended objective appears and the previously-checked one
**stays visibly ticked**. The smuggled `<ul><li>smuggled child</li></ul>` renders as literal text
under a single checkbox, which is check 7's whole point. The sidebar incidentally showed
`Lictor Ozrin` / `Kintargo` / `Moderate`, confirming 7a.2's fields and 7a.3's merge render too.

###### ⚠️ The plan's append rule is true only at the top level

The plan states appending an `<li>` is safe because existing objectives keep their text and so
their slugs. **That holds only for a top-level append.** A key is the slug of the objective's
_full_ `textContent`, descendants included, so adding a child _into_ an existing objective changes
that parent's text and re-keys it — stranding its checkbox. Same mechanism as
`the-tabsthe-header-shows-all-the-folders-containe`, working against us.

Two consequences, both implemented: the insertion target is the last `<ul>` **with no `<li>`
ancestor**, and appended objectives are inserted as **plain text, never markup** — otherwise a
caller passing `<ul><li>…</li></ul>` re-keys the enclosing objective through the back door. Check 7
is that fixture, and it discriminates: a parsed list would have added two keys and moved a parent's.
Nesting under an existing objective is **refused**, not silently re-keyed; key migration is a bigger
change than this cycle should make.

###### Gate-running lesson: run UI checks one step at a time

The first run executed the whole toggle sequence with timed pauses. By the time it was observed
only the **end state** was visible, so the intermediate `failed` render was never seen — the run
proved less than it appeared to. Re-run as a single step that stops and waits. **For any check whose
evidence is transient, the harness must stop, not sleep** — a pause assumes the observer is already
watching, and unobserved states leave no trace.

##### 7a.3 gate result — 11/11, 2026-08-17 (`update-simple-quest-page`, 53 → 54 tools)

Fixture: **`MCP Gate Fixture`** journal (`d08x3jjHcWEjTjsy`) in `Quests`, quest page
`5n2UZX24wYSSB0C0`. **Reused across runs and by 7a.4/7a.5** rather than created fresh each time —
the earlier gates left a journal per run behind, and there is no delete tool to clean up with.

| #   | Check                                                   | Result                                      |
| --- | ------------------------------------------------------- | ------------------------------------------- |
| 1   | **Away:** `questGiver` moved off its resting value      | Lictor Ozrin → Nox the Fence                |
| 2   | **Merge, not replace:** unnamed fields survive          | `difficulty`, `location` + 9 more untouched |
| 3   | **Back:** restored                                      | Lictor Ozrin                                |
| 4   | SetField **write** round-trips as an array              | `["gate","hellknights"]` on a lore page     |
| 4b  | Same key refused on quest, which has no `tags`          | per-type schema, not a global allowlist     |
| 5   | Appending an objective is allowed                       | 3 objectives, existing slugs intact         |
| 6   | **Enforced:** stranding rewrite refused, body unchanged | 2 keys named, `bodyUnchanged=true`          |
| 7   | `objectiveState` refused — owned by 7a.4                |                                             |
| 8   | Foundry `-=` unset syntax refused                       | `questGiver` still present                  |
| 9   | Unknown key refused by name                             | `["description"]`                           |
| 10  | Non-Simple-Quest page refused                           | module journals stay read-only              |

**Check 2 is the one that fails if the merge is really a replace**: it writes `questGiver` alone and
asserts everything else survived. Check 6 asserts the body is byte-identical afterwards, so
"refused" has to mean nothing was written rather than merely looking unhappy.

###### ⚠️ This phase's own gate line for `tags` was wrong

The plan said "Read `system.tags` back and assert it is an array, not `{}`" as part of cycle 3. **A
quest page has no `tags` field** — 7a.1's inventory lists its 12 fields and `tags` is not among
them; it lives on lore, character, faction, location, creature and map. The first run scored that as
a failure when the tool had in fact refused the key by name, which is the correct answer.

Corrected by testing the SetField **write** path where the field exists (lore), and keeping the
quest refusal as check 4b. That pair is stronger than the original line: together they show the
validation is reading a **per-type** live schema rather than a global allowlist. 0a had proved the
SetField read path; this proves the write path.

##### 7a.2 gate result — 10/10, 2026-08-17 (`create-simple-quest-page`, 52 → 53 tools)

Writes landed in the **Quests** folder at Franklin's direction (easy to delete afterwards).

| #   | Check                                             | Result                                 |
| --- | ------------------------------------------------- | -------------------------------------- |
| 1   | **`status` omitted entirely → `-1`**              | `-1`, not SQ's default `0`             |
| 2   | Type read back from the document, not echoed      | `simple-quest.quest` both sides        |
| 3   | Caller's `system` survives alongside our defaults | `questGiver`, `difficulty` intact      |
| 4   | Every objective secret by default                 | 3 of 3                                 |
| 5   | Nesting survives creation                         | `d0 · d1→parent 0 · d0`                |
| 6   | Hidden on page **and** journal                    | both `ownership.default=0`             |
| 7   | **Branch not taken:** `visibleToPlayers:true`     | both levels `=2`; lore has no `status` |
| 8   | `secretObjectives:false` honoured                 | `objectiveSecrets={}`                  |
| 9   | Unknown `system` key still refused by name        | `rejected:["description"]`             |
| 10  | Folder resolves **exactly**                       | `"Quest"` does not match `"Quests"`    |

**Check 1 is the cycle's real test and it only works because the argument is absent.** Passing
`-1` explicitly would pass against SQ's own default of `0` too, so the omission is the evidence.

The parent objective keyed as `question-the-harbourmasterfind-the-dock-ledger`, confirming on fresh
content the nested-descent behaviour that 0a established from the shipped fixture.

###### The gate could not fail checks 6 and 7 on the first run

Both came back `ownership.default=undefined`: the 0a reader never returned ownership at all, so a
visibility assertion had no way to observe the axis it was testing. **Neither check could have
passed no matter what the tool wrote** — the classic unfalsifiable test, caught only because the
expected value was pinned rather than merely eyeballed.

Fixed by returning `ownership` **and** `journalOwnership` from `getJournalPageContent`. Both,
deliberately: a player needs OBSERVER on the JournalEntry to see the page in the sidebar at all, so
page ownership alone answers the half that reads as success while the player sees nothing. 7a.5
needs both anyway.

**Scope note:** ownership here is verified as _fields_, which is the right question for "did the
write land". It is **not** proof a player cannot see the page — that check belongs to 7a.5 and must
come from a real player login, per the two-level ownership trap.

**Deliberately not built, so it is not mistaken for missing:** the `template` parameter (SQ's twelve
`templates/JournalTemplates/*.html`) and auto-hiding pre-populated _block_ list items. Both belong
with 7a.3/7a.5, which actually manage block items.

##### 7a.1 gate result — 10/10, 2026-08-16 (`get-simple-quest-context`, 51 → 52 tools)

Read-only gate. Simple Quest 5.1.4, `schemaSource: simple-quest.api.exportAllSchemas`.

| #   | Check                                                    | Result                                                |
| --- | -------------------------------------------------------- | ----------------------------------------------------- |
| 0   | Tool registered                                          | 52 tools on the control port                          |
| 1   | Module available                                         | v5.1.4, live API reached                              |
| 2   | All 11 page types                                        | achievement…quest                                     |
| 3   | Quest schema has `questGiver` + `status`                 | 12 fields                                             |
| 4   | **Discriminator:** no `description` / `objectives` field | absent — live model, not stale `module.json`          |
| 5   | `objectiveState` + `objectiveSecrets` present            | both restored                                         |
| 6   | The restoration is declared                              | `hiddenFields: ["objectiveState","objectiveSecrets"]` |
| 7   | `status` is a `NumberField` with 4 choices               | confirms the earlier string-keys correction           |
| 8   | Special directories resolved **by flag**                 | root/quests/party/timeline/achievements all found     |
| 9   | Tab folders with icons                                   | 10 tabs, e.g. `Quests [fas fa-compass]`               |

**Checks 4 and 5 are the discriminating pair, and they fail in opposite directions.** 4 fails if we
read the stale `module.json` (which advertises `description.content` / `objectives.content` under
`htmlFields`); 5 fails if we read the live model _naively_. Neither alone would have caught the
defect below.

###### ⚠️ Simple Quest's own exporter omits the two fields 7a.4 and 7a.5 must write

`JournalPageSchemaExporter.js` skips every field marked `hideInConfig` (L34, L54) — it was written
to drive a config form. `objectiveState` and `objectiveSecrets` are both declared `hideInConfig:
true` (`JournalPageQuest.js` L39-46). So `exportAllSchemas()` returns a quest schema **without
them**, and using it verbatim would have shipped a "self-describing" context tool that hides the
only fields the progress and visibility tools exist to change — and would have failed this phase's
own gate line, which asserts `objectiveState` is present.

Fixed by walking the live schema for fields the export omitted, adding them back marked
`hideInConfig: true`, and listing them in `hiddenFields`. `hideInConfig` is a UI concern, not a
data one. The supplement also recovered four fields on `investigation` (`src`, `items`,
`connections`, `stamps`).

**A sixth variant of the house failure mode, and a new shape: not a silent default but a silent
_omission_** — a library function quietly answering a narrower question than the one asked.
Same tell: nothing in the response distinguishes "this field does not exist" from "this field was
not included."

Also: **`exportAllSchemas()` defaults to `toFile: true`**, which calls `saveDataToFile` and triggers
a **browser download on the GM's machine**. `toFile: false` is mandatory and the name does not hint
at it.

Field counts confirm the granularity decision: lore 26, faction 19, location 18, character 14 —
per-type tools would have been six large, near-identical schemas resident in every session.

###### ⚠️ Deploy verification was checking the wrong invariant

The first run failed with 51 tools and `Unknown tool`. Cause: an earlier compound command aborted
on a path guard **before** `bundle:server` ran, so `dist/backend.js` had the new tool and
`backend.bundle.cjs` did not. The deploy check compared the repo bundle's hash to the deployed
bundle's — they matched, because **both were stale**.

**Hash-matching deployed against repo proves they are the same, not that either is current.**
Verify a deploy by asserting the artifact _contains the change_ (`Select-String` for the new tool
name), or by the control-port tool count — not by comparing two files that a skipped build step
leaves equally old.

##### 0c gate result — 5/5, 2026-08-16

Read-only gate; nothing was written. Baseline captured **before** deploying, which is the half
that cannot be recovered afterwards.

| #   | Check                                                                      | Baseline | After             |
| --- | -------------------------------------------------------------------------- | -------- | ----------------- |
| 1   | `"destroyed two villages"` → `UAAOvl8akbVb2r8r` (achievement)              | 0 hits   | 1 hit, right page |
| 2   | `"Peace between Wyverns"` → `Hg8hmaZiNbLI0Rqg` (event)                     | 0 hits   | 1 hit, right page |
| 3   | `"helped an old lady"` → `gmufLlJeZCsM8OZ6` (achievement)                  | 0 hits   | 1 hit, right page |
| 4   | **Control:** `"pzopss0018-vampire"`, a token in an image page's `src` only | 0 hits   | 0 hits            |
| 5   | **Regression:** `"watchmage"` on text pages                                | 6 hits   | 6 hits            |

**The 0-hit baseline is what makes check 1-3 evidence rather than coincidence.** Had any string
also lived in a text page, the baseline would have been ≥1 and the "1 hit now" would prove nothing.
Check 4 is the over-inclusion control: it required hunting for a token that is in an image `src` and
in no prose — the obvious candidate, `"watchmage"`, appears in six AP text pages and would have
passed no matter what the code did.

**Cost, measured rather than assumed** (the plan said measure before optimising): 419 candidate
pages before, 434 after — the fix adds 15 round trips, not 257, because src-backed pages are still
skipped. Full content search ~140 ms before and after. **No optimisation warranted; do not rewrite
the per-page round-trip loop.**

###### ⚠️ A wrong diagnosis, caught before it shipped

The first run of this gate failed 4/5 with every search returning 0 hits in ~0 ms. That was
mis-read as "`search-journals` returns a confident `success: true, totalMatches: 0` while Foundry
is unreachable" — the house failure mode, apparently in its highest-stakes location yet.

**It was not.** Verified afterwards against a real disconnect (Foundry tab closed, poll until
`list-journals` fails, then capture the raw payload): `search-journals` **errors** during an
outage. `handleSearchJournals` guards `listJournals` at the top and throws before reading any
page. The gate harness only printed hit counts, in which a thrown error and an empty result set
are indistinguishable — so the mechanism was inferred from a display artefact, not observed.

Two things carried forward:

- **A harness that renders failure as emptiness cannot diagnose emptiness.** The fix is to print
  the raw payload when a check fails, not just the derived count. This is the same lesson as
  "when a response IS the evidence, copy it, don't let a model retype it," now applied to the
  harness rather than the model.
- **Restarting the backend does not reliably disconnect the module.** It reconnected on its own
  within 4 s on a later attempt, so an outage cannot be reproduced that way; closing the Foundry
  tab is the deterministic fixture.

The counting added in response is still worth keeping, but for a **narrower** reason than it was
written for: `pagesRead` is now reported (confirmed at 434), and a page read that fails after
`listJournals` succeeded — a mid-search disconnect, or a per-page error — is counted and reported
as `partial` instead of silently skipped. **The `pagesFailed` branches are unexercised**, and the
total-outage case they were motivated by is already covered by the existing guard. Noted here
rather than left for someone to discover.

##### 0b gate result — 7/7, 2026-08-16

Driven through the control port. Every write landed in a throwaway journal the gate created
(`o6N1YGmXwvwPBpTY`, "MCP Gate 7a.0b (safe to delete)", folder "MCP Gate Scratch") — no module
journal and no Simple Quest content was touched, per the scope boundary.

| #   | Check                                                   | Result                                           |
| --- | ------------------------------------------------------- | ------------------------------------------------ |
| 1   | `pageType: simple-quest.lore` honoured                  | read-back `type=simple-quest.lore`               |
| 1b  | Valid `system` field lands and round-trips              | `system.tags = ["gate-0b"]`, an array            |
| 2   | `system.description` **refused by name**                | `rejected=["description"]` + the real field list |
| 2b  | The refusal wrote nothing                               | page count 2 → 2                                 |
| 3   | Mixed keys are all-or-nothing                           | `rejected=["bogusKey"] accepted=["tags"]`, 2 → 2 |
| 4   | Unknown `pageType` refused with the real type list      | nothing written                                  |
| 5   | **Branch not taken:** no `pageType` still yields `text` | `type=text`                                      |

**Checks 2b/3/4 assert page count either side**, so "refused" has to mean nothing was written
rather than merely looking unhappy — a rejection that still writes is the exact failure this
validation exists to prevent, and a response-only check could not see it.

Check 2's message is the deliverable working as designed: it names `description` **and** lists the
type's real top-level fields, which is why the rejection is _returned_ rather than thrown.
`ErrorHandler.handleToolError` would have replaced all of it with a generic template.

Check 4 also confirms the three-source type union resolves: the refusal listed the core types
**and** all eleven `simple-quest.*` subtypes, so `dataModels` was read, not just `game.model`.

##### 0a gate result — 8/8, 2026-08-16

Driven through the control port (`call_tool`), so every value below is the tool's verbatim response.
Fixture: `Welcome to Simple Quest`, page `ApRdPC9GJhXtllVU` in journal `B8K7C52dhISV83Fi`.

| #   | Check                                                    | Result                                                 |
| --- | -------------------------------------------------------- | ------------------------------------------------------ |
| 1   | Body reads from `text.content`                           | `contentSource=text.content`, 4317 chars (was `""`)    |
| 2   | `system` carried                                         | 12 keys incl. `status`, `objectiveState`, `questGiver` |
| 3   | 7 live stored keys reproduced verbatim                   | 7/7                                                    |
| 4   | **Discriminator:** nested descent + slice-before-slugify | long key present, `the-tabs` absent                    |
| 5   | Orphans reported, not invented as objectives             | `["integer-nec-justo-dolor","nullam-malesuada"]`       |
| 6   | Manifest is the page, not the state log                  | 31 `<li>` vs 9 stored keys                             |
| 7   | `depth` / `parentIndex` resolve nesting                  | child `depth=1`, parent resolves to the long key       |
| 8   | **Regression, branch not taken:** core `image` page      | `"Watchmage"` → `contentSource=src`, path intact       |

**The deploy verified itself.** Old code physically cannot emit `contentSource` or `objectives`, so
their presence is proof the browser was running the new module — stronger than a timestamp.

**Second pass over all 14 `simple-quest.*` pages in the world.** 10 of 14 now return a body that
previously read as `""`. The `SetField` claim is proven with **non-empty** sets, not just shape:
`tags=["steamy","rocky","firey"]` (map), `["grey","robed"]` (character), `["Great","Gig","Sky"]`
(location), `awardedTo=[]` (achievement) — arrays, not `{}`. The three pages reading
`contentSource=none` (two `era`, one `map`) are genuinely empty bodies: those types keep their
data in typed fields and flags. That is the field earning its place — "empty" and "not found" are
now different answers.

**⚠️ Three branches shipped unexercised**, stated rather than left to be discovered:
`duplicateKey: true` (no two `<li>`s in the fixture share a 50-character prefix), `secret: true`,
and a non-empty `orphanedSecretKeys` (the fixture's `objectiveSecrets` is `{}`). All three are
report-only flags whose failure mode is under-reporting, not corruption. `secret: true` closes with
one alt+left-click in the Simple Quest UI; the other two need the writer from 0b.

##### 0a as built (2026-08-16) — four corrections from the installed source

**1. ⚠️ The gate criterion in the table below was unpassable, and this is the important one.**
It said the shipped `objectiveState`'s 9 keys are the oracle and "our parser must reproduce that
set **exactly**". It cannot, and it must not. `objectiveState` is **not a manifest of the page's
objectives** — it is a sparse write log. Simple Quest only stores a key once that checkbox has been
touched, and it never prunes keys whose text later changed. Scanning the shipped `quest.json`:

|                                    |                                                       |
| ---------------------------------- | ----------------------------------------------------- |
| `<li>` elements in the page body   | **31**                                                |
| Keys stored in `objectiveState`    | **9**                                                 |
| Stored keys our parser reproduces  | **7**, exact string match                             |
| Stored keys matching **no** `<li>` | **2** — `integer-nec-justo-dolor`, `nullam-malesuada` |

Those two are lorem-ipsum leftovers from an earlier draft of the example. So the real criterion is
**containment plus an orphan set**, not equality: the 7 live keys must appear verbatim among the 31,
and the 2 must appear in `orphanedStateKeys` and **not** in the manifest. That is strictly the
stronger test — set-equality could be passed by a parser that just echoed `objectiveState` back,
and the orphan half is what makes that impossible.

The long key `the-tabsthe-header-shows-all-the-folders-containe` still discriminates exactly as the
plan claimed: it proves `textContent` descends into the nested `<ul>` **and** that the slice to 50
happens before the slugify. A parser emitting `the-tabs` is wrong and this fixture says so.

**2. Enrichment happens, but not where reading one method would suggest.** `JournalPageQuest`'s
`_prepareContext` assigns `context.text.enriched = context.text.content` — raw — with the real
enrich call sitting **commented out** above it (`JournalPageHelpers.js` L300-311). Stopping there
gives the opposite of the truth. `_renderHTML` (L325-332) then re-enriches the entire rendered
part's `innerHTML` before `onRenderView` scans it. So the plan's requirement was right and the
mechanism was different — the conclusion survived only because the whole render path was read.

**3. `String#slugify` separates on whitespace only.** Core (`common/primitives/string.mjs` L73-83)
folds diacritics, converts **whitespace** runs to `-`, and only then, under `strict`, deletes every
remaining non-alphanumeric **in place**. Hence `"Tabs:The"` → `tabsthe` with no dash, while
`"(Tabs)"` → `-tabs-`. Reimplementing this is how the port goes wrong, so 0a calls Foundry's own
method — note `data-access.ts` already has an unrelated local `slugify()` for dnd5e feature
identifiers which gets this rule wrong and must not be reused here.

**4. Scope line: `getJournalContent` is deferred to 0b on purpose, not overlooked.** The
journal-level reader picks `pages.find(p => p.type === 'text')` and has the identical defect, so an
SQ journal reads as empty at the journal level. It is held back because its consumer round-trips:
`update-quest-journal`'s append-without-`pageId` path reads through `getJournalContent` and writes
through `updateJournalContent`, which does its own first-`text`-page lookup. Fixing the read alone
would make append **read page A and write page B** — silent cross-page corruption. Reader and
writer move together in 0b.

Also found, and it matters for 7a.5: **`_setupSecretToggles` is commented out** in
`JournalPageQuest.onRenderView` (L96). `objectiveSecrets` is still fully live — honoured at render
(secret `<li>`s get `.hidden` for non-owners, `.secret` for the GM) and toggled by **alt+left-click**
on the checkbox. Only the separate toggle UI is gone. Writing the field still works and is still
visible; the gate for 7a.5 must use alt-click, not a toggle that no longer renders.

**Beyond the plan's field list**, the built manifest also returns `parentIndex` (7a.5's
`hiddenByAncestor` needs the ancestor relation, and it belongs in the parse rather than duplicated
in the reveal tool), `duplicateKey` (two `<li>`s whose first 50 characters match derive one key and
share one checkbox — SQ's own example page warns about this and provides no defence), and
`orphanedStateKeys` / `orphanedSecretKeys`. The payload also gains `contentSource`
(`text.content` | `src` | `none`), so an empty body is distinguishable from a lookup that found
nothing — the house failure mode, stated in the response instead of left to be rediscovered.

**7a.1 — `get-simple-quest-context`. ✅ DONE, gate passed 10/10 2026-08-16.** Live schemas via SQ's own `exportAllSchemas({toFile:false})`,
plus the folder/tab structure (root + the five `simpleQuestDir`-flagged folders + tab folders with
their icons). Read-only, cheap, and makes the write tools self-describing.

**7a.2 — `create-simple-quest-page`. ✅ DONE, gate passed 10/10 2026-08-17.** One page per call, deliberately: Franklin batches at the
thinking/vault level, and one-at-a-time gives the assistant a chance to read back what it made and
catch errors per page. Parameters: journal or folder target, `type`, `name`, `text`, `system`,
optional `template` (by name, with real image paths substituted for the unsplash placeholder) and
image.

> **Defaults diverge from SQ's own, on purpose.** SQ's schema defaults `status` to `0` / In Progress
> (`JournalPageQuest.js` L34-38). For prep that is wrong: a quest written three weeks early would
> sit hidden but labelled "In Progress" and land in the wrong Quest Recap group the moment access
> was granted. Our defaults: **`status: -1`, page ownership none, list items hidden, objectives
> secret.** This must be stated in the tool description, because it contradicts the module.

**7a.3 — `update-simple-quest-page`. ✅ DONE, gate passed 11/11 2026-08-17.** Partial merge into `system`. Never a wholesale replace, and
that has to be **enforced**, not documented.

**7a.4 — `set-quest-progress`. ✅ DONE, gate passed 10/10 + UI confirmed 2026-08-17.** Owns `system.status`, `system.objectiveState`, and appending new
`<li>` objectives.

> **Narrower guarantee than Phase 5's blanket refusal.** Appending an `<li>` is **safe**: every
> existing `<li>` keeps its text and therefore its slug. Only **rewriting or reordering existing
> objective text** orphans state. So Phase 5's `replaceContent` refusal can be narrowed rather than
> replaced with full key remapping — the old 7a checklist over-scoped this.

**7a.5 — `set-journal-visibility`. ✅ DONE, gate passed (player-verified) 2026-08-17.** Owns `ownership` (page **and** journal), `system.objectiveSecrets`,
and `hidden` on block list items. Reveal selectors resolve against the manifest from 0a:
`"all"` · ordinals `[1]` · keys `["question-the-harbourmaster"]`.

> **⚠️ Secrets cascade visually through DOM nesting, but not in data.** A secret parent `<li>` hides
> its whole subtree via `.hidden` regardless of the children's own flags. Revealing a nested
> objective while its parent is still secret **changes the data and changes nothing on screen**.
> The tool must **report** this, not auto-reveal ancestors — auto-revealing a parent to satisfy a
> request about a child would spill sibling objectives that were meant to stay back, and that
> failure is invisible until a player mentions it:
>
> ```
> { revealed: [...], alreadyVisible: [...],
>   hiddenByAncestor: [{ key: "search-the-docks", ancestor: "find-the-missing-courier" }] }
> ```

For list items, address by **name first, index second**, and return the resolved item. A name that
matches nothing must fail loudly rather than falling back to index 0 — that is the exact failure
shape this project has now shipped five times. `index: "all"` covers "hide the whole block", since
list blocks have no block-level flag and disappear only when every item is hidden.

**Tool count: 51 → 56.** ✅ **Reached 2026-08-17.** All five tools built and gate-passed; the three
foundation cycles (0a/0b/0c) landed first with no new tools. **0d remains** (journal-level
reader/writer alignment), plus the two deferred surfaces noted below.

##### Gate design

Per the standing rule that a test which cannot fail is not a test. Each check below names the
fixture and what distinguishes a pass from an accident.

**Fixture:** SQ's own example quest journal, imported by answering **Yes** to "Create Extended
Structure" (or `createAdvancedFolders()` from the console). Confirm fixture **identity**, not just
name, before trusting a result.

| Cycle | Check that can actually fail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0a    | ⚠️ **Corrected 2026-08-16 — see "0a as built" above.** `objectiveState` is a sparse write log, not a manifest: **31** `<li>`s, **9** stored keys, **2** of them orphans. The check is containment plus orphans, not equality — the 7 live keys must appear verbatim in the manifest, and `integer-nec-justo-dolor` / `nullam-malesuada` must appear in `orphanedStateKeys` and nowhere else. Set-equality could be passed by a parser that merely echoed `objectiveState` back; the orphan half cannot. The long key `the-tabsthe-header-shows-all-the-folders-containe` is the discriminator: it proves `textContent` includes descendant text **and** that the slice-to-50 happens **before** slugify. A parser that emits `the-tabs` is wrong and this fixture says so. |
| 0a    | Regression: a core `image` page must still return its `src`. The happy path does not test the branch it did not take.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 0b    | Create a `simple-quest.lore` page, read back `page.type`. Then submit `system.description` and assert it is **rejected by name** — proving validation ran, rather than the key being silently dropped as it is today. Also: omitting `type` must still yield `text`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 0c    | Search a string present **only** in an SQ page's `text.content` and in no `text` page. Before: 0 hits. After: 1 hit with the right `pageId`. If the string also occurs in a text page, the check proves nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1     | Assert the returned quest schema **contains** `questGiver`/`status`/`objectiveState` and **does not contain** `description`. The absence is the discriminating half: it proves we read the live DataModel and not the stale `module.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2     | **Call with no `status` argument** and assert `-1`. Passing `-1` explicitly passes on SQ's default too, so it proves nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 3     | **Away and back:** set `questGiver` to a new value, verify, set it back. Setting it to what it already holds is indistinguishable from the write being ignored. Separately, write `questGiver` **only** and assert `difficulty` is unchanged — that is the check that fails if the merge is really a replace. Read `system.tags` back and assert it is an array, not `{}`.                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4     | Toggle an objective to checked, then failed, then back to unchecked, **watching the Simple Quest UI** rather than the tool response. Then append an objective and assert the 7 live pre-existing keys survive in `objectiveState` **and still render checked** (the other 2 stored keys are orphans and prove nothing).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5     | **Verify from a real player login**, not by reading fields back — the two-level ownership gotcha makes every field read pass while the player sees nothing. Then reveal a child whose parent is still secret and assert the response reports `hiddenByAncestor` **and** the player still cannot see it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

##### Traps carried into this phase

- `ErrorHandler.handleToolError` erases the message of every error thrown inside a tool handler.
  Any diagnostic worth writing must be **returned**, not thrown. Refusals and validation failures
  are structured payloads (`{success:false, rejected:[…]}`), matching the `queries.ts` precedent.
- A write to the wrong place still succeeds and returns OK. Verify in the SQ UI.
- "The symbol still exists" is not "the behaviour still exists". Read the call site.
- Confirm a module is installed before scheduling work against it. SQ **is** installed at 5.1.4.

#### ▶️ START HERE NEXT SESSION (written 2026-08-17, end of Session 11)

**State:** Phase 7a is **complete** — 0a/0b/0c/0d plus five tools, all gate-passed, 51 → **56 tools**.
`master` and `origin/master` are level. Nothing is half-built and nothing is blocked on a decision.

**Next cycle: 7b.0 — the flags foundation**, the first cycle of the phase designed immediately below.
No new tools; it is the write path that 7b.3 and 7b.4 both need. Namespace-scoped to
`flags['simple-quest']` on both JournalEntry and JournalEntryPage, with each caller declaring its own
allowed key set, because flags are schema-less and 0b's live-schema validation has no equivalent here.

**Before writing any of it, do these three things:**

1. **Re-read `Timeline.js` L114-159.** The phase is built around the orphaned-event trap and the
   exclusive `eraEnd`; do not take this document's word for either.
2. **Settle the `relativeTo: era` question** (L130) before 7b.4 is designed in detail. If a counter in
   an event body really does write to the containing era's flags, `set-quest-counter`'s target is not
   the page the text lives on, and that changes its signature.
3. **Verify the assumption the phase leans on:** that `create-simple-quest-page` already writes
   `simple-quest.event` and `simple-quest.era` pages correctly. It should — the tool is generic over
   type — but it is an inference from our own code, not an observation. One call settles it.

**Deploy state:** backend and module artifacts on disk match HEAD, verified by content rather than by
hash (a stale bundle matched by hash and cost a gate this session). The running backend was started
directly with `node backend.bundle.cjs`, not by Claude Desktop; a Claude Desktop restart will reuse
it via the lock file.

**Housekeeping carried over:** the `MCP Gate Fixture` and `MCP Gate 0d *` journals in the `Quests`
folder are gate litter and can be deleted by name prefix. There is still **no journal-delete tool**,
and adding one was declined on purpose — a permanently-resident destructive tool to serve a testing
convenience is a bad trade.

**After 7b's tools ship, do 7z** — the GM-facing usage documentation, agreed 2026-08-17. It is the
last deliverable of the phase and it closes three gaps that no per-tool description can: workflow
sequencing, the journal-isolation rule, and the fact that enrichers exist at all.

---

#### 7b — Timeline & enrichers 🕰️ ⬜ **designed 2026-08-17, not started**

> **Design session, 2026-08-17 (Franklin + Claude).** Scopes the first tranche of the deferred
> surface listed further down: **`event`/`era` timeline** (the campaign involves history and dated
> events) and **custom enrichers**. `@time` is sequenced **last** at Franklin's direction — Simple
> Timekeeping is not installed and he wants to evaluate it first, and per the standing rule a module
> that is not installed cannot be gated.
>
> Read from the installed 5.1.4 source on 2026-08-17: `JournalPageEvent.js`, `JournalPageEra.js`,
> `classes/Timeline.js`, `classes/TimelineJournalConfig.js`, `scripts/enrichers.js`.

##### ⚠️ The headline finding: an event outside every era is silently dropped

`Timeline.js` L117-118:

```js
const era = eras.find((e) => year >= e.system.eraStart && year < e.system.eraEnd);
if (!era) continue;                                    // no era → the event never renders
```

An event whose `year` falls in no era **does not appear on the timeline at all**. The page exists,
every field reads back correctly, and nothing anywhere says it is invisible. That is the house
failure mode again — this time in the module, which means our tools have to be the thing that
notices.

Two details sharpen it:

- **`eraEnd` is exclusive** (`year < eraEnd`). An event dated exactly on an era's end year belongs
  to no era unless the next era starts on that number. Off-by-one here costs a vanished event.
- **A null `eraEnd` displays but does not match.** Rendering falls back to
  `eraEnd || nextEra?.eraStart` (L84), while event matching uses the raw `e.system.eraEnd` (L117).
  So an era missing its end renders fine and quietly swallows nothing — every event that should sit
  in it disappears instead.

##### What the timeline actually is

| Fact                                                                           | Evidence                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A timeline is **one journal**; its `event` and `era` pages are its content     | `new Timeline(container, journal, page)`                                                                                                                   |
| Axis config lives in **journal flags**, not page `system`                      | `TimelineJournalConfig` L38-43, L79                                                                                                                        |
| Flag keys                                                                      | `timeScale` (10), `dynamicTimeScale` (false), `negativeAbb` ("BC"), `positiveAbb` ("AC"), `showMinus` (false), `content` ("always"/"toggleOff"/"toggleOn") |
| Eras are laid out **contiguously**, stacked in `eraStart` order                | L87-89: each era's start pixel is the previous era's end                                                                                                   |
| So **numeric gaps between eras are not drawn as gaps**                         | geometry is a sequence of blocks, not a true axis                                                                                                          |
| `dynamicTimeScale` sizes an era by **event count**, not by its length in years | L70-74                                                                                                                                                     |
| Events alternate **left/right by index**, not by any field                     | L149-153 — side is not controllable                                                                                                                        |
| Both eras and events are **permission-filtered** (OBSERVER)                    | L61, L63 — so 7a.5's visibility tooling already applies                                                                                                    |
| `year`, `eraStart`, `eraEnd` are `required: true` integers                     | the two page classes                                                                                                                                       |

##### ⚠️ A counter inside an event body resolves against the **era**, not the event

`Timeline.js` L130 enriches an event's content with `relativeTo: era` — the containing era, not the
event page. `@COUNT` and `@REPUTATION` read and write `content.relativeTo`'s flags
(`enrichers.js` L127-128, L158-159), so **a counter written into an event body stores its value on
the era page**, and every event in that era shares it. Almost certainly an SQ bug; either way it
constrains where counters can be placed. Verify before building the counter tool.

##### What already works, so the phase is smaller than it looks

`create-simple-quest-page` and `update-simple-quest-page` are **generic over page type** and validate
against the live schema, so `simple-quest.event` and `simple-quest.era` pages should already be
creatable and editable today, `awardedTo` and all. **Cycle 1 verifies that rather than assuming it.**
Likewise, every enricher is plain text in `text.content`, so **emitting** `@QUEST` / `@LORE` / `@MAP`
/ `@TTM` / `@COUNT` / `@REPUTATION` needs no new tool at all.

What is genuinely missing is narrower: **flags cannot be written** (timeline config and counter state
both live in flags), **nothing detects the orphaned-event trap**, and **nothing can read the timeline
as rendered**.

##### Cycles

**7b.0 — Flags foundation (no new tools).** A write path for `flags['simple-quest']` on both
JournalEntry and JournalEntryPage. Namespace-scoped: refuse any flag scope other than
`simple-quest`, so this never becomes a general-purpose flag poker. Flags are schema-less, so 0b's
live-schema validation has no equivalent — instead each _caller_ declares its own allowed key set,
and the writer refuses anything outside it. Counter ids are arbitrary by design and are the
exception, scoped to the `counters` object.

**7b.1 — `get-timeline`.** Read a timeline journal exactly as `Timeline._prepareContext` does: eras
sorted by `eraStart`, events sorted by `year`, each event resolved to its containing era — and
**`orphanedEvents` listed explicitly**, with the reason (no era covers the year / era has a null
`eraEnd` / year equals an exclusive `eraEnd`). Read-only, and it is the tool that makes the headline
trap visible. Also returns the journal's axis flags and each page's `uuid`, which is what
cross-link emission needs.

**7b.2 — Containment guard on create/update.** When an `event` is written, report whether it lands
in an era. **Warn, do not refuse:** writing events before their eras exist is a legitimate prep
order, so a refusal would fight the workflow. But the response must say so plainly, and
`get-timeline` must list it. Same for an `era` written with a null `eraEnd`.

**7b.3 — `set-timeline-config`.** The six journal flags. Numbers validated (`timeScale > 0`),
`content` constrained to its three choices.

**7b.4 — `set-quest-counter`.** `@COUNT` / `@REPUTATION` state in page flags
`['simple-quest'].counters[id]`. Blocked on resolving the `relativeTo: era` question above — if
counters in event bodies really do write to the era, the tool must target the page the enricher
resolves against, not the page the text lives on, and say which.

**7b.5 — `@time`, LAST.** Requires **Simple Timekeeping & Calendar**, not installed.
⛔ **Do not start** until it is installed and its source has been read. Emitting `@time` without it
renders the literal text "Simple Timekeeping & Calendar Not Installed" into the page — not a broken
link, a visible embarrassment — so until then the tools should treat `@time` as forbidden output.

**Tool count: 56 → 59** (`get-timeline`, `set-timeline-config`, `set-quest-counter`).

##### Gate design

| Cycle | Check that can actually fail                                                                                                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Create an event dated **outside** every era and assert `get-timeline` lists it under `orphanedEvents` — then confirm in the Simple Quest timeline that it genuinely does not render. The page reading back correctly is exactly what makes this invisible otherwise. |
| 1     | **Boundary:** an event dated exactly on an era's `eraEnd` must be reported orphaned (exclusive bound), while one dated on `eraStart` must not. A fixture where both eras are adjacent distinguishes the off-by-one; one with a gap does not.                         |
| 1     | Assert `get-timeline`'s era order and event-to-era mapping match what the module renders, not what the numbers suggest — eras stack contiguously, so a gap in years is not a gap on screen.                                                                          |
| 2     | Create an event with no eras present at all: must succeed **and** warn. A refusal here fails the workflow, so the check is that it wrote and reported, not that it blocked.                                                                                          |
| 3     | **Call with no arguments** and assert the flags are unchanged rather than reset to defaults — a config writer that helpfully fills in `timeScale: 10` would silently retune an existing timeline.                                                                    |
| 3     | Away-and-back on `timeScale`, and confirm in the UI that the axis actually rescales. Reading the flag back proves storage, not effect.                                                                                                                               |
| 4     | Write a counter, then read it back **through the rendered page**, not just the flag — and settle whether an event-body counter lands on the event or its era. If it lands on the era, that is the finding, not a bug in our tool.                                    |
| 4     | Two counters with different ids on one page must not disturb each other (flags are an object; the merge trap from 7a.5 applies).                                                                                                                                     |

##### Traps carried in

- **Foundry merges object writes.** Removing a key from a flags object does nothing; `setFlag` with
  an object merges. Deleting a counter needs the `-=` unset form. This is the 7a.5 false-success
  defect, and flags are the same shape.
- **Read the field back after writing** and refuse to claim success if it did not take.
- Adding a field to a reader is not done until every **passthrough that whitelists fields** is
  updated (0d).
- For any check whose evidence is transient or on screen, the harness **stops and waits**; it does
  not sleep (7a.4).
- Confirm a module is installed before scheduling work against it (7c). `@time` is why this phase
  ends where it does.

#### 7z — GM-facing usage documentation 📖 ⬜ (agreed 2026-08-17, after 7b's tools ship)

**Trigger:** once 7b's tools are built and gate-passed (56 → 59). Not before — tool descriptions and
behaviour are still moving, and a document written against a moving target is a second source of
truth that drifts.

**Franklin's framing (2026-08-17):** the document lives in the **dev vault** as the single source of
truth; he propagates it to the pf2e game vault or references it cross-vault so it never forks.
Suggested home: `Z:\Obsidian Vaults\FoundryDevVault\01 - MCP Server\Simple Quest Tooling — GM Guide.md`.

##### Why this is needed at all — MCP tools are self-describing, but only per tool

A model consuming this server sees exactly three things per tool: `name`, `description`, and
`inputSchema` with its per-parameter descriptions. Nothing else — not the code, not this plan, not
`CLAUDE.md`. The 7a descriptions were written heavy on purpose so the non-obvious policy travels with
the tool (prep defaults that contradict the module, merge-not-replace, exact-name matching,
`hiddenByAncestor`), and refusals teach on contact by naming the real fields or listing the available
objectives.

So individual tool _use_ needs no documentation. **Three things fall outside what a per-tool
description can carry**, and they are the whole reason this deliverable exists:

1. **Workflow sequencing.** Each tool describes itself; nothing describes the lifecycle. That the
   hand-off is deliberately **two calls** — `set-journal-visibility` for access, `set-quest-progress`
   for status — and that skipping the second leaves an `UNDISCOVERED` badge on a quest the party can
   already see. Franklin hit exactly this during the 7a.5 gate.
2. **The journal-isolation rule.** Page ownership inside a _visible_ journal is not a security
   boundary, so spoiler-sensitive prep belongs in its **own** journal via `folder`, never co-located
   via `journalId`. The `folder` parameter says what it does, not why it is the safer choice — an
   assistant optimising for tidiness would co-locate everything and quietly leak.
3. **Enrichers exist and are unmentioned.** Emission needs no tool, which also means no tool mentions
   them, so an assistant will never write `@QUEST[uuid]{Label}` because nothing tells it the syntax is
   available. Same for `@time` being **forbidden output** while Simple Timekeeping is uninstalled.

##### Structure: two parts, kept structurally separate

- **Part A — paste-ready assistant instructions.** Short and self-contained (~15-25 lines), written to
  be dropped into the GM AI's project instructions verbatim. Covers only the three gaps above. This is
  the part that has to be short, because it is loaded every session.
- **Part B — human reference for Franklin.** The tool inventory, the lifecycle table, the traps, and
  the "why" behind the defaults. Length is free here; nothing loads it into a context window.

⚠️ **An `.md` file in the vault is not read by the GM AI.** Part A only takes effect once it is pasted
into (or referenced by) the assistant's project instructions. Worth stating in the document itself, so
future-Franklin does not assume writing it was sufficient.

##### What the document must NOT do

**Do not restate per-tool parameters.** They are already in the `inputSchema`, the model already reads
them, and a copy in the vault is a second source of truth that will drift — the exact failure this
project keeps finding. Part B links to the tool list; it does not mirror it.

**Maintenance rule: if the document and the tool descriptions disagree, the tool descriptions win.**
They are what the model actually reads. The document is derived, not authoritative.

##### Note on cross-vault referencing

Obsidian `[[wikilinks]]` do not resolve across vaults. Cross-vault reference needs an
`obsidian://open?vault=…&file=…` URI, or a filesystem junction/symlink so the same file appears in
both vaults. Franklin's call which; recording it so the "single source of truth" intent is not defeated
by a link that silently does not work.

#### 7b-deferred — the rest of the Simple Quest surface

Still out of scope after the tranche above. `achievement` needs **no new work** — `awardedTo` is a
`SetField` and the generic create/update tools already handle those (proven in 7a.3).

- ~~**`event` / `era`** — the timeline.~~ **Pulled forward into 7b above, 2026-08-17.**
- ~~**Custom enrichers as first-class output**~~ — **also 7b above.** Emission needs no tool;
  only counter state does.
- ~~**`achievement`**~~ — **needs no work.** `awardedTo` is a `SetField`, and the generic
  create/update tools handle those already (proven in 7a.3).
- **`map`** — waypoints, fog-of-war and pins live in `classes/MapImage.js` (73 KB) and page flags,
  not in the data model. Not a schema write.
- **`investigation`** — `JournalPageInvestigation.js` is 84 KB of mind-map. Its own project.
- **Custom enrichers as first-class output** — `@QUEST`/`@LORE`/`@MAP` cross-links, `@COUNT` and
  `@REPUTATION` counters (stored in `flags['simple-quest'].counters`). 7a can emit these as raw
  text; a tool that manages counter state is separate. Note `@time[…]` requires **Simple
  Timekeeping**, which is _not installed_ — it renders a "Not Installed" label, so do not emit it.
- **Custom page templates** — SQ scans a user `storage/` folder for extra `.html` templates, so
  house styles Franklin authors could be applied by name.

#### 7c — Other module-dependent backlog ⛔ BLOCKED (2026-08-15)

- [ ] Exalted Scenes + Narrator's Jukebox tools (5 tools; guard with `game.modules.get(id)?.active`)
- [ ] Re-verify any remaining module assumption inherited from the sf2e era

> **⛔ Neither module is installed in the v14 world.** Enumerated
> `D:\FoundryData-Paizo\Data\modules` on 2026-08-15: 33 modules, of which `simple-quest` is the
> only one this phase depends on. Exalted Scenes and Narrator's Jukebox were **sf2e-era wants that
> did not survive the pf2e pivot**, and they were carried into this backlog without anyone checking
> whether they were still installed.
>
> There is therefore **no test target**, so 7c cannot be gated — and a gate that cannot fail is not
> a gate. Franklin's call: **keep parked, install later.** Do not write these five tools until the
> modules are installed and their installed source has been read, per the standing rule.
>
> Generalise the check: this is the second backlog item found to be describing a world that no
> longer exists. **Confirm a module is installed before scheduling work against it.**

#### 7d — Non-module items parked for the same reason

Not module-dependent, but each is a **re-derive** rather than a re-port, so they wait for the same
strategy-decision-4 reason:

- [ ] ⏸️ **Server-side modifier hoist** — move roll-modifier lookup into the system adapters instead
      of the module-side `isPF2eFamily` chain (deferred from Phase 1.5). **Parked 2026-08-15.**
- [ ] ⏸️ **`get-character` never reports initiative** — upstream pf2e adapter gap found in the Phase
      1.5 gate. **Parked 2026-08-15.**

> **Cycle 6 parked, 2026-08-15 (Franklin).** Both items above, together. His challenge was the
> right one: _"in actual play, why would `get-character` need to report initiative? We have
> `get-combat-tracker` and that's where initiative lives."_ Checking rather than arguing:
>
> - `getActiveCombat` already returns `initiative` and `hasRolledInitiative` per combatant,
>   initiative-sorted (`data-access.ts` L10737). That is the **rolled** value — what play needs.
> - `buildRollFormula` already resolves the initiative **modifier** module-side
>   (`data-access.ts` L5876): `attributes.initiative` → perception → dex, with
>   `warnOnMissingModifier` on a miss. That is the Phase 1.5 fix, and it is the code that
>   actually rolls.
>
> So the only real absence is an initiative entry in the **server-side** pf2e adapter — which
> matters only if that adapter were authoritative, and it is not, because `buildRollFormula`
> never consults it. **The two items are therefore coupled**: the adapter entry has value only if
> the hoist lands first. Neither delivers observable behaviour alone, and together they are a
> refactor whose gate is "nothing changed" — the weakest kind. Not wrong, just not in the same
> queue as live defects.
>
> **A false lead, recorded so it is not re-followed.** A `get-character "Amiri"` call failed with
> `Character not found` and was briefly taken as the known unlinked-token limitation. It was not:
> the actor is named `Amiri (Level 1)` and resolves correctly under its full name. `game.actors`
> lookup is fine. What the episode _did_ surface is that `get-character` matches names **exactly**
> — no substring pass — so the natural table query "Amiri" misses. The exact-first pattern from
> cycles 3-4 would fix that without reintroducing the ambiguity those cycles removed. Logged as a
> candidate, not adopted.

- [x] **`Roll#toMessage` `rollMode` → `messageMode`** — and it was **not** a deprecation. Cycle 5
      of 7d, 2026-08-15.

> **Cycle 5 of 7d, 2026-08-15 — ✅ GATE PASSED. The backlog had the severity wrong.**
>
> Filed as "v14 deprecation, breaks on v16 / console noise until fixed." Reading the installed
> source shows **every private roll button has been failing outright on v14**:
>
> ```js
> // client/dice/roll.mjs L1155
> static _mapLegacyRollMode(rollMode) {
>   if ( rollMode === "roll" ) return game.settings.get("core", "messageMode");
>   return {publicroll:"public", gmroll:"gm", blindroll:"blind", selfroll:"self"}[rollMode] || rollMode;
> }
> ```
>
> We passed `rollMode: isPublic ? 'publicroll' : 'whisper'`. **`'whisper'` was never a valid
> rollMode** — not in that map, so it passed through unmapped to `ChatMessage#applyMode`, where
> `CONFIG.ChatMessage.modes['whisper']` is `undefined` and reading `cfg.handler` throws.
> `CONFIG.ChatMessage.modes` holds exactly `public / gm / blind / self / ic` (`client/config.mjs`
> L246-266), and pf2e only ever _reads_ that object — it throws `Unexpected message-visibility
mode` on unknown keys rather than adding one.
>
> The click handler wraps the call in `try/catch`, so it surfaced as
> `ui.notifications.error('Failed to execute roll')` with the button re-enabled — **no roll
> posted, no stack trace shown**. A broken feature that read as a transient glitch. `isPublic` is
> a _required_ parameter on `request-player-rolls`, so this is a first-class path.
>
> Fixed to `messageMode: isPublic ? 'public' : 'gm'`. **`'gm'`, not `'blind'`:** `applyMode`
> substitutes the all-GMs whisper list only when `chatData.whisper` is **empty**, and the handler
> always populates `whisperTargets` (target user + active GMs), so the explicit recipients survive
> and `blind` stays false. `'blind'` would hide the result from the player who rolled it.
> `publicroll` → `public` is behaviour-preserving: exactly what `_mapLegacyRollMode` did.
>
> **The bundled type declarations still describe the pre-v14 signature** and know only `rollMode`,
> so the call needs a cast. The installed `roll.mjs` L926 is the authority, not the types — a case
> where a clean typecheck argued _for_ keeping the broken code.
>
> **Gate — every participating browser must be refreshed.** The click handler runs in the
> _clicking_ user's browser, so the player's client needs the F5 as much as the GM's; testing from
> a stale player client reproduces the old failure and looks like the fix did not land.
>
> 1. Private roll (`isPublic: false`) → player clicks → **roll posts**, whispered to that player
>    - GMs. Before: `Failed to execute roll`, nothing posted.
> 2. Public roll (`isPublic: true`) → still posts to everyone. The control: `publicroll` already
>    worked, so a fix that broke it would otherwise go unnoticed.
>
> ##### Gate result, 2026-08-15 — passed, both halves
>
> Both buttons issued over the control port, clicked by the player, verified by reading chat back
> rather than by trusting the UI:
>
> |         | `author` | `speaker`         | roll            | `whisper`  |
> | ------- | -------- | ----------------- | --------------- | ---------- |
> | Private | `Dragor` | `Amiri (Level 1)` | `1d20 + 5` = 21 | **`true`** |
> | Public  | `Dragor` | `Amiri (Level 1)` | `1d20 + 5` = 17 | _(absent)_ |
>
> The private roll **posted at all**, which it could not do before — the throw happened inside
> `toMessage`, so nothing was ever created. And it posted _whispered_ while the public control
> posted unwhispered, so `messageMode: 'gm'` preserved the explicit recipient list rather than
> being ignored or overwritten.
>
> Two unrelated confirmations came free: the `+5` shows the Phase 1.5 pf2e modifier fix is intact
> (this path used to roll a bare `1d20 + 0`), and `author: "Dragor"` against `speaker: "Amiri
(Level 1)"` is cycle 2's author/speaker independence holding on a real message.
>
> **One gap in the evidence:** `getRecentChat` reduces `whisper` to a boolean
> (`(msg.whisper || []).length > 0`), so the log cannot show _who_ was whispered to. That the
> player saw his own private result was confirmed at the table, not from the payload. If the
> recipient list ever needs proving, the reduction to boolean is what stands in the way — a
> candidate 7d item in its own right.

- [x] **`read-chat`'s `speaker` hides "no speaker"** — `author` and `speaker` are now reported
      independently and either may be null. Cycle 2 of 7d, 2026-08-15.

> **Cycle 2 of 7d, 2026-08-15 — ✅ GATE PASSED.** The listed defect was one line
> ([`chat.ts`](../packages/mcp-server/src/tools/chat.ts) `?? msg.author`), but fixing only that
> line would not have worked — **the same merge happens twice on the same path**, which is the
> Phase 2 lesson ("a downstream `?? default` can re-merge the two fields the test was built to
> separate") pointing at its own cause:
>
> 1. **Server formatter** — `speaker: … ?? msg.author`. A message with no speaker read as one
>    spoken by its author. Now `null`.
> 2. **Module, `author`** — `msg.author?.name ?? speaker.alias ?? 'Unknown'`. When the User could
>    not be resolved this substituted the _speaker's_ alias, so `author` and `speaker` collapsed
>    to the same value **before** the formatter ever ran. Fixing only (1) would have left the two
>    fields merged whenever the author lookup missed. Now `null`.
> 3. **Module, `speaker.actor`** — `game.actors.get(id)?.name ?? speaker.alias`. A deleted or
>    foreign actor id resolved to the alias, so a lookup that **missed** read exactly like one
>    that succeeded. Now `null`, with the raw id surfaced as `unresolvedActorId` only when the
>    lookup actually fails, so the miss is visible rather than disguised.
>
> Items 2 and 3 were not on the backlog. Both are the canonical trap, found by reading the whole
> path from source field to printed output instead of the one line the item named.
>
> **Blank is not absent.** `speaker.alias` is a `StringField` with `blank: true`
> (`common/documents/chat-message.mjs` L58), so a message created with no speaker stores `""`,
> not `null` — and `??` does not catch the empty string. A first pass that only swapped the
> fallback to `?? null` would have printed a blank speaker instead of a visible absence. Blank
> and whitespace-only aliases are normalised to `null`.
>
> **Gate — needs both halves, because nulling everything passes the first one:**
>
> | Fixture                                                            | `author` | `speaker`      |
> | ------------------------------------------------------------------ | -------- | -------------- |
> | Console `ChatMessage.create({content: "…"})` — no speaker recorded | user     | **`null`**     |
> | Chat typed with a token selected — actor speaker recorded          | user     | **actor name** |
>
> The first proves the substitution is gone (it read as the user's name before). The second proves
> a real speaker still resolves — without it, a fix that returned `null` unconditionally would
> pass. Note that plain chat typed with **no** token selected legitimately carries an alias:
> `ChatMessage.getSpeaker()` fills it from `user.name` (`#getSpeakerFromUser`), so Foundry really
> did record a speaker there and reporting it is correct. Only a message with no speaker _stored_
> reads null.
>
> ##### Gate result, 2026-08-15 — passed, both halves
>
> | Message                                  | `author`     | `speaker`  |
> | ---------------------------------------- | ------------ | ---------- |
> | `U5B7…` console-created, no speaker      | `Gamemaster` | **`null`** |
> | `Cqae…` typed with a token selected      | `Gamemaster` | `Amiri`    |
> | `WjO2…` sent via `send-chat-message`     | `Gamemaster` | `Amiri`    |
> | `hqMp…` / `0RWt…` GM narration + whisper | `Gamemaster` | `GM`       |
>
> `author` held constant at `Gamemaster` across all five while `speaker` took three distinct
> values including null — the two fields are demonstrably independent, which is the whole point.
> Under the old code `U5B7…` would have read `speaker: "Gamemaster"`, identical to its author and
> indistinguishable from a message the GM really did speak as themselves.
>
> No `unresolvedActorId` appeared, as expected on a world with no deleted actors — branch 3 above
> remains **unexercised**. It is a strict improvement over substituting the alias, but it has not
> been proven live, and per the standing rule a passing happy path does not test the branch it did
> not take. Exercising it needs a message whose speaker actor is deleted afterwards.

- [x] **`list-playlists` reports raw volume, not UI volume** — resolved by reporting **both**,
      each named for its scale. Cycle 3 of 7d, 2026-08-15.
- [x] **Hidden tokens: the two tools now disagree by default** — resolved with an `includeHidden`
      parameter **defaulting to `true`**, matching `get-current-scene`. Explicit `tokenIds` are
      honoured verbatim regardless, and every token reports its own `hidden` flag, so an included
      ambusher is visible in the response rather than a silent extra row.
- [x] **`get-token-distances` returns a field literally named `feet`** — renamed to `distance`,
      with `units` still reporting the scene's real unit.
- [x] **`get-token-distances` ignores elevation** — now 3D.
- [x] **The distance fallback branch uses different math from the primary one** — **deleted**
      rather than made grid-aware. See below: nothing in this tool ever needed the canvas.

> **Cycle 1 of 7d, 2026-08-15 — ✅ GATE PASSED.** All four items collapsed into one
> rewrite once the installed core source was read (`common/grid/base.mjs`, `square.mjs`,
> `gridless.mjs`, `common/documents/token.mjs`, `client/documents/scene.mjs`):
>
> - **`TokenDocument#getCenterPoint()` already returns an `ElevatedPoint`** — `{x, y, elevation}`,
>   x/y in pixels and **elevation already in grid units**, not pixels. That last detail is the one
>   that would have shipped broken: `square.mjs:_measurePath` divides dx/dy by `grid.size` but dz
>   by `grid.distance`. It also handles hex shapes, which the old pixel math did not.
> - **Supplying `elevation` is what selects the 3D overload.** `BaseGrid#getOffset` sets `k` only
>   when `coords.elevation !== undefined`, and `_measurePath` branches on `o0.k !== undefined`.
>   With both tokens at the same elevation the 3D result is arithmetically identical to the old 2D
>   one, so the change is a strict addition. **Mixed 2D/3D waypoints yield `NaN`, not an error**,
>   so a non-numeric elevation is normalised _and reported_ under `missingElevation`.
> - **`scene.grid` is a real `BaseGrid` instance,** not the grid config — `Scene.#prepareGrids`
>   replaces it (`scene.mjs` L409/L430). So `scene.grid.measurePath()` works with the canvas
>   unrendered, and the fallback had no reason to exist. **Both** grid classes handle 3D.
> - **Bonus defect, not on the list:** the old code drew tokens from `game.scenes.current` (the
>   _active_ scene) but measured with `canvas.grid` (the _viewed_ scene's). Viewing any other scene
>   measured the active scene's tokens against the wrong grid — or dropped to the fallback, since
>   `canvas.tokens.placeables` held the wrong scene's tokens. Both paths are gone.
> - Response now reports the **diagonal rule by name**, derived by inverting `CONST.GRID_DIAGONALS`
>   at runtime rather than hardcoding it — an unmatched value reports raw instead of guessing — and
>   lists each token's `elevation` and `hidden` once, rather than widening N(N-1)/2 pair rows.
>   Unknown ids come back under `notFound` instead of silently shrinking the matrix.
> - Distances now carry 2dp. `EXACT`/`APPROXIMATE` diagonals are fractional and integer rounding
>   hid that; alternating rules stay integral, so PF2e output is unchanged.
>
> **Gate:** call with **no arguments** (proves `includeHidden` defaults true, per the standing rule
> that passing the value explicitly passes on the old code too). Fixture needs a **hidden** token
> and a token at **non-zero elevation**, with a pair whose candidate explanations give different
> numbers. On a 5 ft square grid, a flyer **20 ft up and 15 ft away in a straight line** (so 3
> squares horizontal, 4 squares of elevation, no horizontal diagonal to confound it):
>
> | Reading                                     | Result    |
> | ------------------------------------------- | --------- |
> | 3D, alternating diagonals (PF2e / this fix) | **25 ft** |
> | elevation still ignored (the old behaviour) | 15 ft     |
> | 3D, rectilinear                             | 35 ft     |
> | 3D, equidistant (Chebyshev)                 | 20 ft     |
>
> Worked from `square.mjs:_measurePath`: the offsets sort to `di=4, dj=3, dk=0`, and alternating
> gives `di + floor(nd/2)` = `4 + 1` = 5 squares = 25 ft. Four candidate explanations, four
> distinct numbers — no reading of the fixture is ambiguous.

##### Gate result, 2026-08-15 — passed on a live pf2e scene

Six tokens, `Sarcovalt` flying at **elevation 15** (3 squares), the rest on the ground; one
`Chelaxian Recruit` hidden. Scene reported `units: "ft"`, `measurement: "grid"`,
`diagonals: "ALTERNATING_1"`. Called with **no arguments** both times.

Run 1 at elevation 15, run 2 with Sarcovalt set to elevation 0 and **not moved**:

| Pair with Sarcovalt | elev 15 | elev 0 | horizontal `dx, dy` that explains both |
| ------------------- | ------- | ------ | -------------------------------------- |
| "Rabbit" Dryden     | 20      | 10     | `2, 0`                                 |
| Recruit `6Tow…`     | 26.25   | 21.25  | `4.25, <1`                             |
| Recruit `F2PH…` 🕵  | 20      | 16.25  | `3, 1.25`                              |
| Amiri               | 21.25   | 16.25  | `3.25, <1`                             |
| Ezren               | 20      | 11.25  | `2.25, 0`                              |

**All ten values recomputed by hand** through the `ALTERNATING_1` branch
(`l1 = a0(1-mx) + a1(mx-my) + a2(my-mz) + a3·mz`, `a = fx + 0.5·fy + 0.25·fz`), and **a single
fixed horizontal geometry explains every one of them**. That is the real strength of this gate:
not that the numbers changed, but that one unmoved `(x, y)` per token reconciles both runs, which
rules out "the token moved" as the explanation. Every one of the ten pairs **not** involving
Sarcovalt held byte-identical across runs.

Worth keeping: the naive decomposition `dy = 0` fits four of the five pairs and **fails on
`F2PH…`** — it predicts 21.25 where the tool returned 20. The correct `dx=3, dy=1.25` reproduces
both runs exactly. A four-of-five fit looked like a tool bug and was an arithmetic error in the
_check_. Solve the decomposition from both runs jointly before calling a mismatch a defect.

Also confirmed: `includeHidden` defaulted true (the hidden recruit appears with `hidden: true`
under a no-argument call), no `feet` key anywhere, and `notFound` / `missingElevation` correctly
**absent** rather than present-and-empty.

The quarter-square offsets are themselves evidence: they come from `getCenterPoint()` centring a
token by its own size, which is why fractional distances persist at elevation 0.

> **⚠️ Evidence-handling note.** The pasted run-2 payload listed **16 rows for 15 pairs**, with
> `Amiri ↔ Sarcovalt` duplicated. `getTokenDistances` iterates `for i; for j = i + 1`, which
> structurally cannot emit a duplicate pair — so the payload was **reproduced by the assistant
> rather than pasted verbatim**. The values themselves all verified, so nothing was lost here, but
> a retyped payload is weaker evidence than a copied one. Add to the gate-design rules: when a
> response is the evidence, copy it, do not let a model retype it.

- [x] **Exact-match lookups lose to substring matches** — all 4 call sites done. `findPlaylist`
      and the `playPlaylist` sound lookup in cycle 3; the journal + page lookups in
      `showJournalToPlayers` in cycle 4.

> **Cycle 4 of 7d, 2026-08-15 — ✅ GATE PASSED.** Same exact-first split as cycle 3, applied to
> the journal and page lookups, with `journalAmbiguousWith` / `pageAmbiguousWith` **returned**
> rather than thrown. Module-only change — no server code touched, so no backend or Claude Desktop
> restart, just an F5.
>
> **This was never latent.** The backlog recorded these four call sites as "latent today". They
> were not: the defect reproduces on the campaign's real data, and reproduces _destructively_,
> because `show-journal-to-players` pushes to every connected client. Identical call, before and
> after the module refresh:
>
> |            | `journalName`                 | `pageName`             | `journalId`        |
> | ---------- | ----------------------------- | ---------------------- | ------------------ |
> | **Before** | `Ch 3: Devils of Chitterwood` | `Into the Chitterwood` | `pf2ap22203devils` |
> | **After**  | `Chitterwood`                 | `Chitterwood`          | `pf2ap22212chitte` |
>
> The world holds a journal named exactly `Chitterwood`, but `Ch 3: Devils of Chitterwood` sorts
> earlier and contains the string, so the OR-ed predicate took it — then searched _that_ journal's
> pages and pushed a page nobody asked for to the players. Note the **id** changes, not just the
> name: a different document, per "fixture identity is part of the evidence".
>
> A scan of all 28 journals found **nine** such collisions in this campaign (`Wolfpoint` →
> `Wolfpoint Palisade`, `Sabotage` → `Mission 2: Armory Sabotage`, `Sarcovalt` → `Sarcovalt
Swarm`, `Hellknight` → `Skeletal Hellknight`, …). Worth generalising: **"latent" should mean
> "no fixture can reach it", not "nobody has hit it yet".** Scanning the live data for a
> discriminating pair took one script and converted a theoretical item into a reproducible bug.
>
> **Unexercised:** `journalAmbiguousWith` / `pageAmbiguousWith`. An exact match short-circuits
> before the partial pass, so the passing fixture cannot also produce them. The pattern is proven
> at the playlist call sites (cycle 3), but this is different code.
>
> **Process note:** the before-shot pushed adventure text to a connected player without warning
> Franklin first. A gate for a tool whose whole purpose is broadcasting to players is
> player-visible by definition — say so before running it, not after.

- [x] **`stop-playlist` on a named playlist returns no count** — both branches now report
      `stopped` (playlists) and `stoppedSounds`. Cycle 3 of 7d, 2026-08-15.

> **Cycle 3 of 7d, 2026-08-15 — ✅ GATE PASSED.**
>
> **Volume: the plan's claim was right, and verified this time by reading the render path.**
> `playlist-directory.mjs` L404/L414 renders `volumeToPercentage(volumeToInput(volume))` — note the
> **nesting**. `volumeToPercentage` on its own is just `volume * 100`, so reading only that helper
> would have "disproved" the claim; the sidebar percentage is the _slider position_, and internal
> 0.5 really does display as 63%. Resolved by reporting **both** scales, named: `volume` (internal,
> and what `play-playlist` accepts back) and `volumePercent` (what the GM sees). Picking one would
> have left read and write silently on different scales.
>
> The conversion delegates to `AudioHelper.volumeToInput` rather than reimplementing the 1.5
> exponent, and returns **null** if the helper is missing — a guessed number would be
> indistinguishable from a real reading. The `volume` param's own description already documented
> the curve correctly, so only the read side was ever wrong.
>
> Also removed: `volume: s.volume ?? 0.5`, which made an absent volume indistinguishable from a
> track really set to 0.5. Not on the backlog; same trap, found in passing.
>
> **Exact-match:** split into a prior pass, as `sendChatMessage` already did. An ambiguous
> substring still resolves — behaviour preserved — but now **returns** `ambiguousWith` /
> `soundAmbiguousWith` listing the other candidates. Deliberately not thrown:
> `ErrorHandler.handleToolError` erases thrown messages, so a diagnostic has to be returned or the
> caller never sees it (the Phase 5 lesson, applied rather than rediscovered).
>
> **Stop count:** counted _before_ `stopAll()`, and `stopped` now means playlists in **both**
> branches so the unit does not change between them, with `stoppedSounds` alongside. A no-op stop
> now says so instead of returning the same success string as a real one.
>
> **Gate — the write test must move the value and come back:**
>
> 1. `list-playlists`. Pick a track; note `volume` and `volumePercent`. They must **differ**
>    (e.g. `0.5` / `"63%"`), and `volumePercent` must match the tooltip on Foundry's own slider.
>    Equal values mean the nested conversion did not land.
> 2. `stop-playlist` on a playlist that is **not** playing → `stopped: 0` and the "was not playing"
>    message. Then play it and stop it again → `stopped: 1`, `stoppedSounds: ≥1`. Only the second
>    half proves the count is real rather than hardcoded.
> 3. Exact-match needs two playlists where one name is a prefix of the other (e.g. `Combat` and
>    `Combat Ambience`) — ask for the **shorter** name and confirm the exact one plays regardless
>    of sidebar order. Without such a pair the branch cannot fail and the test proves nothing.
>
> ##### Gate result, 2026-08-15 — passed, driven over the control port
>
> **The control port can call tools, not just list them** (`backend.ts` L1538, `method:
'call_tool'`, `params: {name, args}`). Driving a gate through it removes Claude Desktop from the
> loop entirely: exact arguments, verbatim responses, no retyped payload. This is the better
> harness for any gate that does not need a human to _see_ something, and it is how cycle 3 was
> run. Scratch client: `scratchpad/call.cjs`.
>
> | Check                                | Result                                  | Old behaviour              |
> | ------------------------------------ | --------------------------------------- | -------------------------- |
> | `list-playlists` volume scales       | `0.5`→`63%`, `0.35`→`50%`, `0.85`→`90%` | reported `50%`/`35%`/`85%` |
> | stop a **not**-playing playlist      | `stopped: 0` + "was not playing"        | `Stopped playlist "X"`     |
> | ambiguous query `"s"`                | `ambiguousWith: ["Loops","SFX"]`        | silent pick, no trace      |
> | `play-playlist` sound `"Docks"`      | `sound: "Docks"`                        | **`"Docks Nighttime"`**    |
> | stop the same playlist while playing | `stopped: 1`, `stoppedSounds: 1`        | no count at all            |
>
> **Finding a fixture that could fail took longer than the fix.** The obvious candidate — the
> world's `Loops` / `Loops (Copy)` pair — is **not discriminating**: `Loops` precedes `Loops
(Copy)` in collection order, so the old OR-predicate found the exact match first as well. Both
> codepaths return `Loops`, and testing it would have produced a confident pass for a branch never
> exercised. The real fixture was at the **sound** level, already present: in `Ambience`,
> `Docks Nighttime` sits _before_ `Docks`, so the query `"Docks"` genuinely separates the two
> implementations. Generalises: for an ordering bug, the fixture must put the **wrong** answer
> earlier in the collection, which is a property of the data, not of the names.
>
> **Volume was verified by reading, not by testing** — the live `list-playlists` payload already
> carried both scales and matched `volumeToInput` to the rounding. No world interaction needed.
>
> **Still unexercised:** `findPlaylist`'s own exact-vs-substring precedence. The world has no
> playlist whose name is a substring of an earlier one, and the deleted `Loops (Copy)` would not
> have discriminated anyway. The sound-level lookup proves the _pattern_, but it is a different
> call site. Left as latent-but-unproven rather than recorded as passed.

---

#### ⚠️ Simple Quest 3.0.20 → 5.1.4 — **rewritten 2026-08-12, the earlier note was wrong**

Read against the **installed** module at
`D:\FoundryData-Paizo\Data\modules\simple-quest` (manifest confirms **5.1.4**, compat
min=14 verified=14), not from release notes.

> **📍 Partly superseded by the 2026-08-16 design session — see Phase 7a above.** This section's
> objective-key and `system.objectiveState` analysis is **confirmed correct** and the shipped
> fixture is now the 0a gate's oracle. Two things here are corrected upstream in 7a: the page
> subtype count is **11, not twelve**, and the reader blocker is a one-line branch fix rather than
> the gating rebuild this section implies — SQ pages populate the core `text.content`, which we
> simply never read. Read 7a first; keep this section for the flag-migration history and the
> three dated corrections, which still stand.

> **The previous revision of this section said "what survived: the flag shape" and scoped the
> work as a key-derivation fix. Both halves of that were wrong.** The flag shape did not survive,
> and the back-compat map does not do what the note claimed. Corrected below. This is the same
> failure mode as revision 4's row 4 — a plan entry documenting one side of a two-sided change —
> and it was caught the same way, by reading the code instead of the note.

**What actually changed: state moved out of flags entirely.** SQ 5.x introduces a custom journal
page subtype `simple-quest.quest` with a real DataModel (`scripts/journal/JournalPageQuest.js`,
`objectiveState` / `objectiveSecrets` as `ObjectField`s). Runtime reads
`scripts/journal/JournalPageHelpers.js` L407-411:

```js
const state = this.document.system.objectiveState ?? {};
const secrets = this.document.system.objectiveSecrets ?? {};
const key = li.textContent.trim().slice(0, 50).slugify({ strict: true }); // _getObjectiveKey
```

`checkboxes` and `secret` flags now have **exactly one reader left in the codebase**:
`scripts/migration.js`, the one-time upgrade that rewrites `text` pages into
`simple-quest.quest`. There are zero runtime readers.

**The back-compat map is not a back-compat map.** `listItemSlugMap[oldKey] = newKey` lives
_inside_ `migrateQuestJournal`, not the render path. It translates flags that already existed at
migration time and never runs again. The old note said it "remaps legacy keys on render, so our
old-format writes may appear to work" — it does not, so they will not. Our writes land on flags
nobody reads.

That is **better for testing** (total, visible failure rather than a subtle one) and **worse for
scope** (a storage-layer change, not a string fix).

**Compatibility of each thing we port**

| Our write                             | Goes to                                  | SQ 5.1.4 reads                             | Verdict                              |
| ------------------------------------- | ---------------------------------------- | ------------------------------------------ | ------------------------------------ |
| `setQuestChecklistItem` `completed`   | `flags.simple-quest.checkboxes.<oldKey>` | `system.objectiveState[slug]`              | ❌ location **and** key              |
| `setQuestChecklistItem` `revealed`    | `flags.simple-quest.secret.<oldKey>`     | `system.objectiveSecrets[slug]`            | ❌ location **and** key              |
| `setQuestVisibility` section          | `flags.simple-quest.secret.<slug>`       | `system.objectiveSecrets[slug]`            | ⚠️ key already right, location wrong |
| `setQuestVisibility` page (quest tab) | `flags.simple-quest.hidden`              | **nothing that gates display** — see below | ❌ **corrected 2026-08-13**          |
| `setQuestVisibility` page (lore tab)  | Foundry `ownership`                      | Foundry core                               | ✅ survives                          |
| `loreFolderName` lookup               | `game.settings.get('simple-quest', …)`   | still a setting (`settings.js` L51)        | ✅ survives                          |
| `stateMap` 0/1/2                      | —                                        | `CHECKBOX_STATE` 0/1/2 unchanged           | ✅ survives                          |

Note the asymmetry: the **section** path already slugifies correctly and only needs its storage
moved; the **checklist** path needs both. Half of `setQuestVisibility` needs no change at all.

**Required work for Phase 7a**

- [ ] Key derivation → `text.trim().slice(0, 50).slugify({ strict: true })`. Order matters:
      **slice before slugify**, matching `_getObjectiveKey`.
- [ ] Storage → `page.system.objectiveState` / `system.objectiveSecrets`. Follow SQ's own write
      pattern (`JournalPageHelpers.js` L448-450): read current, `foundry.utils.mergeObject`, then
      `page.update({ 'system.objectiveState': merged })`. Do not assume a dotted-path update into
      an `ObjectField` behaves.
- [ ] **Guard on page type.** Only `page.type === 'simple-quest.quest'` has `system.objectiveState`.
      An unmigrated `text` page must fail loudly, not write into nothing.
- [ ] Leave the `hidden` flag and the ownership path alone — both still correct.
- [ ] **Failure mode is silent from the tool's side.** A write to the wrong place still succeeds
      and returns OK. Verify by watching the checkbox/secret marker change **in the Simple Quest
      UI**, never by trusting the response.

> **⚠️ Correction, 2026-08-13.** The row above was first recorded as "✅ survives" because
> `getFlag(MODULE_ID, 'hidden')` is still present in 5.1.4. It is — inside
> `showQuestNotification` (`notifications.js` L46), where it suppresses the **toast popup only**.
> It gates no display. That flag has exactly one reader in the module.
>
> **Player visibility in SQ 5.x is plain Foundry ownership.** `JournalBrowser.js` filters with
> `rootFolder.contents.filter(c => c.visible)` (L295) and `testUserPermission(…OBSERVER)` (L367);
> neither consults the flag. `system.status === -1` ("Undiscovered") is a **categorisation label**
> used to group quests in the browser (L324, L398), not a gate either.
>
> Consequence: our quest-page visibility write silences a notification and leaves the page fully
> readable. The **lore** branch was already correct, so in 5.x the fix is to use ownership for
> **both** page types — the lore-vs-quest folder branch collapses rather than growing.
>
> Lesson, third time this has bitten: **"the symbol still exists" is not "the behaviour still
> exists".** Grep found the flag; only reading its one call site showed it had been demoted.

**Test fixture: use SQ's own example quest journal.** Answering **Yes** to Simple Quest's
"Create Extended Structure" prompt imports `assets/example-journals/quest.json` into the Quests
folder. That page is a ready-made Phase 7a fixture — and its shipped data confirms every claim
above empirically, rather than by inference from the source:

```json
"type": "simple-quest.quest",
"system": {
  "status": 0,
  "objectiveSecrets": {},
  "objectiveState": { "this-is-my-initial-objective": 0, "woah-a-second-objective": 0,
                      "the-header-shows-all-the-folders-contained-inside": 0 }
}
```

New page subtype, state under `system.objectiveState`, slugified keys, values 0/1/2, and an empty
`objectiveSecrets` so one fixture exercises both `completed` and `revealed`. The long key is
truncated at 49 chars, which confirms the **slice-to-50 happens before slugify** — the ordering
detail easiest to get backwards.

The prompt is one-shot (gated on the root folder not existing). If it was declined,
`createAdvancedFolders()` is exported and can be called from the console.

**Carries into Phase 5:** `completed` also left the flags — quest status is now `system.status`
(`-1` Undiscovered / `0` In Progress / `1` Completed / `2` Failed). Check `update-quest-journal`
against that before porting `replaceContent`.

> **⚠️ Correction, 2026-08-15.** This line previously wrote those values as the **strings**
> `"0"` / `"1"` / `"2"`. `status` is a **`NumberField`** — verified in the installed
> `scripts/journal/JournalPageQuest.js`, and the shipped `quest.json` fixture stores `"status": 0`
> unquoted. The `QUEST_STATUS` choices map only _looks_ string-keyed because every JS object key
> is a string. Writing `"1"` where a number is expected is precisely the class of silent-success
> failure this phase exists to avoid.
>
> Same read also confirms the field types 7b would write: `questGiver`, `location`, `difficulty`
> and `deadline` are plain `StringField`s and `status` a `NumberField`, while **only**
> `objectiveState` / `objectiveSecrets` are `ObjectField`s. So 7b's typed writes involve **no
> derived keys at all** — it is the _easier_ half of the Simple Quest work, not the harder one,
> and it is the natural place to prove the read-modify-write pattern before 7a bets on it.

---

### Deferred — sf2e adapter + sf2e creature index 🔮 ⏭️

~870 lines (`systems/sf2e/*` plus the `SF2e*` functions in `data-access.ts`). Port later as its own
mini-project, only if sf2e one-shots need more than upstream's pf2e adapter provides.

---

## Open questions

1. ~~Order: value-first, or pull the risky phase earlier?~~ **Resolved:** cheap new-file phases
   (1, 2, 3) first, risky shared-file phase (4) after.
2. ~~Tool-name overlap vs upstream?~~ **Resolved 2026-08-12:** zero collisions across all 10 tools.
3. ~~Merge or re-fork onto upstream?~~ **Resolved 2026-08-12:** re-fork. See Phase R.
4. **Batching:** strict one-phase-per-test-cycle, or batch the new-file phases? _Leaning: batch
   2 + 3 now that 1 has served as the pattern check. Keep 4 and 5 separate._ **Still open.**
5. ~~Do any remaining phases depend on third-party modules?~~ **Resolved 2026-08-13:** yes, exactly
   two tools, both Simple Quest, now lifted into Phase 7. See the module dependency sweep.
6. **sf2e adapter:** revisit after Phase 6, or leave deferred indefinitely?

---

## Deploy reminder (from CLAUDE.md)

Kill the backend **first**, then copy, then restart Claude Desktop. Claude Desktop queries the tool
list once per session, so a stale backend at startup means a stale tool list for that whole session.

```bash
# 1. Kill running backend BEFORE copying
taskkill //PID $(cat "$TEMP/foundry-mcp-backend.lock" 2>/dev/null) //F 2>/dev/null
rm "$TEMP/foundry-mcp-backend.lock" 2>/dev/null

# 2. Build and deploy the server bundle
npm run bundle:server && cp packages/mcp-server/dist/backend.bundle.cjs \
  "C:/Users/Franklin Figueroa/AppData/Local/FoundryMCPServer/foundry-mcp-server/packages/mcp-server/dist/backend.bundle.cjs"

# 3. Deploy the module too if it changed (matched-pair rule)
#    → D:\FoundryData-Paizo\Data\modules\foundry-mcp-bridge

# 4. Restart Claude Desktop
```

If the tool list is still stale after a restart, rename the server key in
`claude_desktop_config.json` (e.g. `foundry-mcp-bridge` → `foundry-mcp-bridge-v2`) to force
Claude Desktop to treat it as a new server.
