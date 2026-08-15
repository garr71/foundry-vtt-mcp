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
| 5     | Quest journal `replaceContent` + SQ refusal guard     | **shared**    | Med          | 🔄 deployed  |
| 6     | Promote → `master` + docs                             | —             | Low          | ⬜           |
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

### Phase 5 — Quest journal `replaceContent` 📜 🔄 DEPLOYED 2026-08-15, awaiting gate

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
- [ ] **You:** test content replacement on a **plain** journal page in the v14 world
- **Gate:** `replaceContent` behaves as on old `master`; the guard refuses an SQ quest page.

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

### Phase 6 — Promote & document 🏁 ⬜

- [ ] Make `v14-port-v083` the new `master` — **confirm before running**
- [ ] Archive old sf2e-era `master` and the interim `v14-port` as reference branches
- [ ] Update `CLAUDE.md`: pf2e + v14 + upstream-synced architecture, corrected tool count
- [ ] Refresh memory + vault session log
- **Gate:** you confirm. The only mildly destructive git step in the plan.

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

#### 7a — Simple Quest, rebuilt against 5.1.4

- [ ] `set-quest-checklist-item` — new key derivation + `system.objectiveState` storage
- [ ] `set-quest-visibility` — collapse to a single Foundry-ownership path
- [ ] `update-quest-journal replaceContent` — replace Phase 5's refusal guard with real key
      remapping, so content can be rewritten without orphaning objective state
- [ ] **Re-verify every claim against the installed module before writing.** Three for three have
      been wrong so far.

Full analysis in "Simple Quest 3.0.20 → 5.1.4" below.

#### 7b — Capability the 5.x rewrite opened up

SQ 5.x turned prose-with-checkboxes into **twelve schema-backed page subtypes** (quest, lore, map,
character, creature, faction, location, achievement, era, event, investigation). Quest pages carry
typed fields:

```
status (-1 Undiscovered / 0 In Progress / 1 Completed / 2 Failed)
questGiver · location · difficulty · deadline · reward
observerObjectivePermission (default / allow / deny)
```

Objectives gained three states (unchecked / checked / **failed**), per-objective secrets, nested
parent-child auto-checking, and player-toggleable objectives over a socket.

Typed fields are a far better fit for an MCP assistant than string-munging prose — "mark the quest
failed", "set the deadline" become typed writes. **Logged as opportunity, not commitment.**

#### 7c — Other module-dependent backlog

- [ ] Exalted Scenes + Narrator's Jukebox tools (5 tools; guard with `game.modules.get(id)?.active`)
- [ ] Re-verify any remaining module assumption inherited from the sf2e era

#### 7d — Non-module items parked for the same reason

Not module-dependent, but each is a **re-derive** rather than a re-port, so they wait for the same
strategy-decision-4 reason:

- [ ] **Server-side modifier hoist** — move roll-modifier lookup into the system adapters instead of
      the module-side `isPF2eFamily` chain (deferred from Phase 1.5)
- [ ] **`get-character` never reports initiative** — upstream pf2e adapter gap found in the Phase
      1.5 gate; leaves initiative with no server-side cross-check
- [ ] **`Roll#toMessage` `rollMode` → `messageMode`** — v14 deprecation, breaks on v16
- [ ] **`read-chat`'s `speaker` hides "no speaker"** — the formatter's `?? msg.author` makes a
      message with no speaker indistinguishable from one spoken by its author. Faithful to `master`,
      but it defeated the Phase 2 gate fixture. Emit the speaker as nullable and let the caller
      decide, rather than silently substituting.
- [ ] **`list-playlists` reports raw volume, not UI volume** — `Math.round(s.volume * 100)` on the
      internal value, so a track at 0.5 reads `"50%"` while Foundry's slider shows 63%. Decide
      whether to report the UI percentage (matches what you see, but then read and write use
      different scales) or to report both. Found in Phase 3.
- [ ] **Hidden tokens: the two tools now disagree by default** — `get-current-scene` includes them
      (Phase 4 rows 1-2), `get-token-distances` excludes them (faithful to `master`). Recorded at
      the Phase 4 gate, where the hidden token was also the dead one. Ambushers and lurkers are
      arguably the tokens a GM most wants a distance to, so consider an `includeHidden` parameter
      on the distance tool rather than silently dropping them.
- [ ] **`get-token-distances` returns a field literally named `feet`** alongside a `units` field
      reporting the scene's real unit. Correct on this world (`units: "ft"`), misleading on a scene
      in metres. Rename to `distance`, or keep both and document the unit.
- [ ] **`get-token-distances` ignores elevation** — v14's `measurePath` accepts 3D waypoints with an
      `elevation` field, but we pass 2D centers, so a flying creature 20 ft up measures as adjacent.
      Found in Phase 4. Using the 3D overload is new work, not a re-port.
- [ ] **The distance fallback branch uses different math from the primary one** — euclidean pixels
      vs. grid rules, so the two disagree on diagonals. Currently only distinguishable by the
      `measurement` field in the response. Either make the fallback grid-aware or drop it.
- [ ] **Exact-match lookups lose to substring matches** — `findPlaylist`, the sound lookup in
      `playPlaylist`, and the journal + page lookups in `showJournalToPlayers` all OR their clauses
      inside one `find()` predicate, so the first element matching _any_ clause wins and collection
      order decides. Split exact matching into a prior pass, as `sendChatMessage` already does.
      Four call sites, Phases 2-3. Latent today. Found in Phase 3.
- [ ] **`stop-playlist` on a named playlist returns no count** — it reports `Stopped playlist "X"`
      whether or not anything was playing, while the stop-everything branch returns `stopped: N`.
      Give the named path the same count so the success string is falsifiable. Found in Phase 3.

---

#### ⚠️ Simple Quest 3.0.20 → 5.1.4 — **rewritten 2026-08-12, the earlier note was wrong**

Read against the **installed** module at
`D:\FoundryData-Paizo\Data\modules\simple-quest` (manifest confirms **5.1.4**, compat
min=14 verified=14), not from release notes.

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
(`"0"` open / `"1"` complete / `"2"` failed). Check `update-quest-journal` against that before
porting `replaceContent`.

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
