# Foundry v14 Migration + Upstream Re-Sync Plan

> **Purpose:** Re-fork cleanly onto current upstream (Foundry **v14** + native **pf2e** adapter),
> then re-port our system-agnostic custom tools on top, one phase at a time.
> Pivoting from sf2e → **pf2e**, so the sf2e-specific code is deferred.
>
> This file is the source of truth for resuming after breaks. Update the **Status** column
> as we complete each phase.
>
> _Revision 3, 2026-08-12. Verified against the repo._

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

## Port inventory (verified against old `master`)

Ten tools, ten `data-access` methods, ten `queries.ts` handlers, ten `backend.ts` cases.
**Zero tool-name collisions** with upstream's 43 tools (verified 2026-08-12).

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

Plus three **shared-file** behaviour changes with no new tool:

| Change                                  | File                             | Size   | Phase |
| --------------------------------------- | -------------------------------- | ------ | ----- |
| Hidden tokens included in scene read    | `scene.ts` (shared)              | 6 ln   | 4     |
| `get-token-details` full stat block     | `token-manipulation.ts` (shared) | 42 ln  | 4     |
| `update-quest-journal` `replaceContent` | `quest-creation.ts` (shared)     | 33 ln  | 5     |
| **pf2e/sf2e roll modifiers**            | **`data-access.ts` (shared)**    | 102 ln | 1.5   |

> **Correction (revision 2, still current):** `journal.ts` is a single 221-line `JournalTools`
> class holding four tools. Revision 1 split those across three phases, which was not portable.
> They now land together in Phase 2. `quest-creation.ts` never contained `set-quest-visibility`
> or the checklist tool, so revision 1's Phase 6 was mis-scoped.

---

## Phases

Legend: ⬜ not started · 🔄 in progress · ✅ done · ⏭️ deferred

| Phase | Goal                                              | Files         | Risk         | Status                 |
| ----- | ------------------------------------------------- | ------------- | ------------ | ---------------------- |
| **R** | **Re-fork onto upstream v0.8.3 + stock baseline** | —             | Low          | ✅ **done**            |
| 1     | Combat tracker read (re-port)                     | new           | Low          | ⬜ **NEXT** (proven ★) |
| 1.5   | pf2e roll modifiers (re-port, **missed**)         | **shared**    | Low          | ⬜                     |
| 2     | Chat read/send + journal + quest visibility       | new ×2        | Low-Med      | ⬜                     |
| 3     | Playlist control                                  | new           | Low          | ⬜                     |
| 4     | Token distances + hidden tokens                   | **shared ×2** | **Med-High** | ⬜                     |
| 5     | Quest journal `replaceContent`                    | **shared**    | Med          | ⬜                     |
| 6     | Promote → `master` + docs                         | —             | Low          | ⬜                     |
| —     | sf2e adapter + sf2e index                         | sf2e          | —            | ⏭️ deferred            |

Each phase ends at a working, testable state.
**Me** = code + build + deploy. **You** = test in Foundry, report.

> **Ordering rationale:** cheap new-file phases (1, 2, 3) run before the risky shared-file phase (4).
> Phase R is the de-risking event; banking easy wins right after confirms the new base is healthy
> before we attack the phase budgeted for iteration.

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

### Phase 1 — Combat tracker read 🎯 ⬜ (proven, re-port)

**Goal:** Re-land the one tool already proven on v14, and re-validate the 4-file pattern on v0.8.3.

- [ ] Try `git cherry-pick 9f9cfcd` first. One commit's conflict is far more tractable than a merge;
      fall back to hand-porting from `git show 9f9cfcd` if it fights.
- [ ] Drop the doc-only hunks from that commit (the plan file is already carried in Phase R)
- [ ] Confirm all four pieces landed: `combat.ts`, the `backend.ts` case, the `queries.ts` handler,
      and `getActiveCombat` in `data-access.ts`
- [ ] Fold in the known follow-up: `getActiveCombat` returns `scene: null` when the combat is not
      bound to a scene. Add a `game.scenes.active?.name` fallback.
- [ ] **You:** read initiative order / current turn / round in a combat
- **Gate:** round, current turn, init sorted highest-first, defeated/hidden/disposition all correct
  (this exact behaviour was confirmed on v0.8.2, so any difference is a v0.8.3 regression worth chasing).

### Phase 1.5 — pf2e roll modifiers 🎲 ⬜ (re-port, missed by revision 3)

**Goal:** Restore the `request-player-rolls` modifier fix that the port inventory forgot.
Not new work — a re-port with an exact reference, same as every other phase.

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

- [ ] Re-graft `buildRollFormula` from `master` onto upstream's `data-access.ts`
- [ ] Keep the `dnd5e` branch and `getSkillCode` untouched (upstream default path, carried per
      strategy decision 3)
- [ ] Confirm the Perception special case survives — it is the case that was actually observed
      failing, and the easiest one to drop during a re-graft
- [ ] Consider hoisting the modifier lookup to the server-side adapter instead of extending the
      module-side `if (isPF2eFamily)` chain. **Decide before writing** — the module-side re-port is
      the faithful, cheap option; the adapter route is architecturally correct and fixes future
      systems for free, but changes the WS payload (matched-pair, both packages)
- [ ] **You:** request a Perception skill check, an Athletics skill check, a Reflex save, and an
      initiative roll for a pf2e PC
- **Gate:** each rolls with the character's real modifier. Cross-check against `get-character`,
  which already reports correct values (Amiri: athletics +7, acrobatics +5, intimidation +4).
- **Note:** `rollType: 'custom'` already works and is the workaround until this lands.

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

**Goal:** First shared-file re-graft, and the highest v14 API-breakage risk (canvas/grid `measurePath`).

- [ ] Re-graft onto upstream's `token-manipulation.ts`: `get-token-distances` (new tool) and the
      `get-token-details` full stat-block extension (42 ln)
- [ ] Re-graft onto upstream's `scene.ts`: include hidden tokens in `get-current-scene` (6 ln)
- [ ] Check interaction with upstream's `8546b0f` synthetic-token-actor resolution
- [ ] **You:** confirm hidden tokens appear in `get-current-scene`; request token distances
- **Gate:** distances correct in feet; hidden tokens visible to GM.
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
