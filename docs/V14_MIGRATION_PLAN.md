# Foundry v14 Migration + Upstream Re-Sync Plan

> **Purpose:** Re-fork cleanly onto current upstream (Foundry **v14** + native **pf2e** adapter),
> then re-port our system-agnostic custom tools on top, one phase at a time.
> Pivoting from sf2e → **pf2e**, so the sf2e-specific code is deferred.
>
> This file is the source of truth for resuming after breaks. Update the **Status** column
> as we complete each phase.
>
> _Revision 4, 2026-08-12. Port inventory rebuilt by method-level audit
> ([`scripts/port-audit/`](../scripts/port-audit/)), not by reading commit messages._
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
- **Simple Quest:** v13 world has **3.0.20**, v14 world has **5.1.4** (breaking, see Phase 2)

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
| `set-quest-visibility`     | `journal.ts` (new)                   | `setQuestVisibility`    | 2     | `master` ⚠️    |
| `set-quest-checklist-item` | `journal.ts` (new)                   | `setQuestChecklistItem` | 2     | `master` ⚠️    |
| `list-playlists`           | `playlist.ts` (new)                  | `getPlaylists`          | 3     | `master`       |
| `play-playlist`            | `playlist.ts` (new)                  | `playPlaylist`          | 3     | `master`       |
| `stop-playlist`            | `playlist.ts` (new)                  | `stopPlaylist`          | 3     | `master`       |
| `get-token-distances`      | `token-manipulation.ts` (**shared**) | `getTokenDistances`     | 4     | `master`       |

★ already written and **proven on Foundry v14**; re-port onto the new base, do not re-derive.
⚠️ needs the Simple Quest 5.x key fix, see Phase 2.

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
> They now land together in Phase 2. `quest-creation.ts` never contained `set-quest-visibility`
> or the checklist tool, so revision 1's Phase 6 was mis-scoped.

---

## Phases

Legend: ⬜ not started · 🔄 in progress · ✅ done · ⏭️ deferred

| Phase | Goal                                                  | Files         | Risk         | Status      |
| ----- | ----------------------------------------------------- | ------------- | ------------ | ----------- |
| **R** | **Re-fork onto upstream v0.8.3 + stock baseline**     | —             | Low          | ✅ **done** |
| 1     | Combat tracker read (re-port)                         | new           | Low          | ✅ **done** |
| 1.5   | `request-player-rolls` repairs (rows 6-8, **missed**) | **shared**    | Low          | ⬜ **NEXT** |
| 2     | Chat read/send + journal + quest visibility           | new ×2        | Low-Med      | ⬜          |
| 3     | Playlist control                                      | new           | Low          | ⬜          |
| 4     | Token distances + hidden tokens + stat block          | **shared ×3** | **Med-High** | ⬜          |
| 5     | Quest journal `replaceContent`                        | **shared**    | Med          | ⬜          |
| 6     | Promote → `master` + docs                             | —             | Low          | ⬜          |
| —     | sf2e adapter + sf2e index                             | sf2e          | —            | ⏭️ deferred |

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
> Same failure mode as the Simple Quest checklist in Phase 2: a success string that means "sent",
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
- Verified separately: the backend survives both graceful and abrupt (RST) control-client
  disconnects, so probing it is safe.

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

### Phase 2 — Chat + journal + quest visibility 💬📖 ⬜

**Goal:** Five tools, two brand-new files, zero shared-file risk. Highest per-session value left.

- [ ] Port `chat.ts` (`read-chat`) across the 4 files
- [ ] Port `journal.ts` (`send-chat-message`, `show-journal-to-players`, `set-quest-visibility`,
      `set-quest-checklist-item`) across the 4 files, including speaker/portrait resolution
- [ ] **You:** read recent rolls/messages; have Claude post to chat; show a handout page to players;
      toggle quest visibility and tick a checklist item
- **Gate:** rolls readable; messages post with correct speaker + portrait; correct journal page
  displays to players; quest visibility and checklist behave as on old `master`.

#### ⚠️ Simple Quest 3.0.20 → 5.1.4 breaking change (verified 2026-08-12)

`set-quest-visibility` and `set-quest-checklist-item` need the **Simple Quest** module active
(guard already present at `data-access.ts` ~L3533: `game.modules.get('simple-quest')?.active`).

The v13 world runs Simple Quest **3.0.20**; the v14 world runs **5.1.4**. Our integration was
reverse-engineered against 3.0.20.

**What survived:** the flag shape. SQ 5.1.4 still reads `page.getFlag('simple-quest', 'secret')`
and `page.getFlag('simple-quest', 'checkboxes')` as keyed objects, and `loreFolderName` is still
a module setting. The overall approach is sound.

**What broke:** the checklist/objective **key derivation**.

```js
// ours (3.x era), data-access.ts ~L3619
key = text.replace(/\s/g, '').replace(/\./g, '').substring(0, 50);

// SQ 5.1.4
key = li.textContent.trim().slice(0, 50).slugify({ strict: true });
```

SQ 5.1.4 ships a back-compat map (`listItemSlugMap[oldKey] = newKey`) that remaps legacy keys on
render, so our old-format writes may appear to work. Do not rely on it: it exists for migration
and can be dropped in any 5.x patch.

- [ ] Update key derivation in `setQuestChecklistItem` **and** `setQuestVisibility` (the
      `secret.${slug}` path) to `text.trim().slice(0,50).slugify({strict:true})`
- [ ] **Failure mode is silent.** A wrong key still writes a flag successfully and returns OK;
      SQ simply ignores it. Test by confirming the checkbox/secret marker **visibly changes in the
      Simple Quest UI**, never by trusting the tool's success response.

### Phase 3 — Playlist control 🎵 ⬜

- [ ] Port `playlist.ts` (`list-playlists`, `play-playlist`, `stop-playlist`) with loop/volume/mode
- [ ] **You:** play/stop a playlist; test loop and volume
- **Gate:** audio control works from Claude.

### Phase 4 — Token distances + hidden tokens 📐 ⬜

**Goal:** Second shared-file re-graft, and the highest v14 API-breakage risk (canvas/grid `measurePath`).

> **⚠️ Rescoped in revision 4.** The stat block is **two-sided** and revision 3 listed only the
> server half. Porting row 3 without row 4 ships a formatter for a payload the module never sends.

- [ ] `token-manipulation.ts`: `get-token-distances` (new tool) + `formatTokenDetails` stat-block
      extension (row 3, 42 ln)
- [ ] **`data-access.ts`: `getTokenDetails` → `this.extractTokenActorStats(token.actor)` and the
      new `extractTokenActorStats` helper (row 4, 5 + 54 ln).** Without this, row 3 has no data.
- [ ] `scene.ts`: hidden tokens — **two places**, `handleGetCurrentScene`'s zod default (row 1)
      and `getToolDefinitions`' `includeHidden` default + description (row 2). Both flip
      `false` → `true`; changing only one leaves the tool and its schema disagreeing.
- [ ] Check interaction with upstream's `8546b0f` synthetic-token-actor resolution
- [ ] **You:** confirm hidden tokens appear in `get-current-scene`; request token distances;
      confirm `get-token-details` returns a full stat block, not just name/type/img
- **Gate:** distances correct in feet; hidden tokens visible to GM; stat block populated.
- **Risk:** budget 1-2 fix cycles here specifically. This is the phase most likely to need iteration,
  and the estimate is a guess, not a measurement.

### Phase 5 — Quest journal `replaceContent` 📜 ⬜

- [ ] Re-graft the `replaceContent` mode onto upstream's `update-quest-journal` (33 ln, shared file)
- [ ] **You:** test quest content replacement against Simple Quest 5.1.4 in the v14 world
- **Gate:** `replaceContent` behaves as on old `master`.

### Phase 6 — Promote & document 🏁 ⬜

- [ ] Make `v14-port-v083` the new `master` — **confirm before running**
- [ ] Archive old sf2e-era `master` and the interim `v14-port` as reference branches
- [ ] Update `CLAUDE.md`: pf2e + v14 + upstream-synced architecture, corrected tool count
- [ ] Refresh memory + vault session log
- **Gate:** you confirm. The only mildly destructive git step in the plan.

### Deferred — sf2e adapter + sf2e creature index 🔮 ⏭️

~870 lines (`systems/sf2e/*` plus the `SF2e*` functions in `data-access.ts`). Port later as its own
mini-project, only if sf2e one-shots need more than upstream's pf2e adapter provides.

---

## Open questions

1. ~~Order: value-first, or pull the risky phase earlier?~~ **Resolved:** cheap new-file phases
   (1, 2, 3) first, risky shared-file phase (4) after.
2. ~~Tool-name overlap vs upstream?~~ **Resolved 2026-08-12:** zero collisions across all 10 tools.
3. ~~Merge or re-fork onto upstream?~~ **Resolved 2026-08-12:** re-fork. See Phase R.
4. **Batching:** strict one-phase-per-test-cycle, or port Phases 1 + 2 + 3 together (all new files)
   and test in one pass to save deploy round-trips? _Leaning: keep 1 separate as the pattern check,
   then batch 2 + 3. Keep 4 and 5 separate._
5. **sf2e adapter:** revisit after Phase 6, or leave deferred indefinitely?

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
