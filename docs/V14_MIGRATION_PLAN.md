# Foundry v14 Migration + Upstream Re-Sync Plan

> **Purpose:** Re-base our fork onto upstream `v0.8.2` (which adds Foundry **v14** support
> and a native **pf2e** adapter), then re-port our system-agnostic custom tools on top.
> Pivoting from sf2e → **pf2e**, so the sf2e-specific code is deferred.
>
> This file is the source of truth for resuming after breaks. Update the **Status** column
> as we complete each phase.

---

## Context Snapshot (as of planning)

| | Our fork (`master`) | Upstream (`master`) |
|---|---|---|
| Version | 0.7.0 | **0.8.2** |
| Foundry verified | v13 only | **v14** |
| Fork point | 2026-03-28 (`62cd3fb`) | — |
| Divergence | 14 commits ahead | 50 commits ahead |

- **Old Foundry v13 data:** `D:\FoundryVTTdata` (current `foundry-mcp-bridge` module lives here)
- **New Foundry v14 data:** `D:\FoundryData-Paizo` (dedicated to pf2e/sf2e — module goes here)
- **Installed MCP server:** `C:\Users\Franklin Figueroa\AppData\Local\FoundryMCPServer\`
- **Working branch:** `v14-port` (off `upstream/master`); old `master` kept as reference until Phase 7.

### Strategy decisions (locked)
1. **Re-base on upstream, re-port features** (NOT a raw `git merge` — upstream enforced prettier,
   so a merge would be a wall of false whitespace conflicts).
2. **Keep all our tools**, but **defer the sf2e adapter** — upstream's pf2e adapter covers pf2e play.

### Matched-pair rule (critical)
The Foundry **module** and the MCP **server** share a WebSocket protocol. They must be the **same
lineage** — stock+stock or ours+ours. Never mix our old v13 server with a stock v14 module.

---

## What's sf2e-specific vs. agnostic (why the pivot is cheap)

- **Genuinely sf2e-only (~770 lines, DEFERRED):** `systems/sf2e/*` (adapter, filters, index-builder)
  + `buildSF2eIndex` / `extractSF2eCreatureData` in `data-access.ts`. Made redundant for pf2e by
  upstream's pf2e adapter + pf2e creature index.
- **System-agnostic (PORT THESE):** combat read, chat read/send, token distances, hidden-token
  visibility, playlist control, journal/handout display, Simple Quest integration. The roll-modifier
  and stat-block code mentions sf2e only inside shared `pf2e || sf2e` branches — pf2e is the primary
  path, so it works as-is.

### The "4-file pattern" (every tool touches these)
1. `packages/mcp-server/src/tools/<tool>.ts` — server-side tool definition (Zod schema + description)
2. `packages/mcp-server/src/backend.ts` — register + switch-case (server forwards query over WS)
3. `packages/foundry-module/src/queries.ts` — module-side query handler
4. `packages/foundry-module/src/data-access.ts` — module-side Foundry API call

Module guard for optional-module tools: `game.modules.get('<id>')?.active` (goes in `data-access.ts`).

---

## Phases

Legend: ⬜ not started · 🔄 in progress · ✅ done · ⏭️ deferred

| Phase | Tool / Goal | Files | Risk | Status |
|---|---|---|---|---|
| 0 | Foundation & stock baseline | — | Low | ⬜ |
| 1 | Combat tracker read | new | Low-Med | ⬜ |
| 2 | Chat read + send-to-chat | new | Low-Med | ⬜ |
| 3 | Token distances + hidden tokens | **shared** | **Med-High** | ⬜ |
| 4 | Playlist control | new | Low | ⬜ |
| 5 | Journal / handout display | new | Low | ⬜ |
| 6 | Simple Quest integration | **shared** | Med | ⬜ |
| 7 | Promote `v14-port` → `master` + docs | — | Low | ⬜ |
| — | sf2e adapter + sf2e index | sf2e | — | ⏭️ deferred |

Each phase ends at a working, testable state. **Me** = code + build + deploy. **You** = test in Foundry, report.

---

### Phase 0 — Foundation & stock baseline ⚙️
**Goal:** Prove the v14 pipeline works end-to-end before adding custom code; establish reference baseline.
- [ ] Create branch `v14-port` off `upstream/master`
- [ ] Restore `CLAUDE.md` + `.claude/` onto the branch (they only exist on old `master`)
- [ ] `npm install` + `npm run build` on stock upstream — confirm clean build
- [ ] Build + deploy stock module → `D:\FoundryData-Paizo\Data\modules\`, server bundle → installed location
- [ ] **You:** enable module in Foundry v14, restart Claude Desktop, confirm a stock tool works
- **Gate:** Stock upstream connects + works on v14. Known-good reference established.

### Phase 1 — Combat tracker read 🎯
**Goal:** Highest every-session value + validates the 4-file port pattern on v14.
- [ ] Port `combat.ts` across the 4 files; prettier + lint + tsc + build + deploy
- [ ] **You:** read initiative order / current turn / round in a combat
- **Gate:** Combat state returns correctly in v14.
- **Note:** If this goes smoothly, the clean-file phases (2, 4, 5) are mechanical repeats.

### Phase 2 — Chat / roll reading + send-to-chat 💬
- [ ] Port `chat.ts` (read-chat + send-chat-message + speaker/portrait resolution)
- [ ] **You:** read recent rolls/messages; have Claude post to chat
- **Gate:** Rolls readable; Claude's messages post with correct speaker/portrait.

### Phase 3 — Token distances + hidden-token visibility 📐
**Goal:** First shared-file re-port — highest v14 API-breakage risk (canvas/grid `measurePath`).
- [ ] Re-graft additions onto upstream's `token-manipulation.ts` + `scene.ts`
- [ ] **You:** confirm hidden tokens show in `get-current-scene`; request token distances
- **Gate:** Distances correct (feet); hidden tokens visible to GM.
- **Risk:** Budget 1–2 fix cycles here specifically.

### Phase 4 — Playlist control 🎵
- [ ] Port `playlist.ts` (list/play/stop + loop/volume/mode)
- [ ] **You:** play/stop a playlist; test loop & volume
- **Gate:** Audio control works from Claude.

### Phase 5 — Journal / handout display 📖
- [ ] Port `journal.ts` (show-journal-to-players, page-level targeting); check tool-name overlap vs upstream
- [ ] **You:** show a handout/journal page to players
- **Gate:** Correct page displays to players.

### Phase 6 — Simple Quest integration 📜
- [ ] Re-graft `quest-creation.ts` changes (set-quest-visibility, checklist, replaceContent) onto upstream
- [ ] **You:** test against Simple Quest module installed in the v14 world
- **Gate:** Quest visibility/checklist behave as before.

### Phase 7 — Promote & document 🏁
- [ ] Make `v14-port` the new `master` (archive old sf2e-era master as reference) — **confirm before running**
- [ ] Update `CLAUDE.md` → pf2e + v14 + upstream-synced architecture
- [ ] Refresh memory / vault session log
- **Gate:** You confirm. Only mildly-destructive git step in the whole plan.

### Deferred — sf2e adapter + sf2e creature index 🔮
~770 lines (`systems/sf2e/*` + `buildSF2eIndex`). Port "slowly, later" as its own mini-project,
only if sf2e one-shots need more than upstream's pf2e adapter provides.

---

## Open questions (decide before/at start)
1. **Order:** value-first (current), or pull risky Phase 3 earlier to de-risk sooner?
2. **Batching:** strict one-phase-per-test-cycle, or port clean-file group (1, 2, 4, 5) together
   and test in one pass to save round-trips?

## Deploy reminder (from CLAUDE.md)
Kill backend → copy bundle → restart Claude Desktop (it caches the tool list once per session).
```bash
taskkill //PID $(cat "$TEMP/foundry-mcp-backend.lock" 2>/dev/null) //F 2>/dev/null
npm run bundle:server && cp packages/mcp-server/dist/backend.bundle.cjs \
  "C:/Users/Franklin Figueroa/AppData/Local/FoundryMCPServer/foundry-mcp-server/packages/mcp-server/dist/backend.bundle.cjs"
# then restart Claude Desktop
```
