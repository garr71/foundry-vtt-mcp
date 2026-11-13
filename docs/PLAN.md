# Current Plan

> **Living document.** It holds what is next and why. History and rationale for everything up to
> 2026-08-22 (the v14 migration and Phase 7) live in
> [`archive/V14_MIGRATION_PLAN.md`](archive/V14_MIGRATION_PLAN.md). The kickstart for this plan is a
> handoff note kept in the dev vault (`05 - Logs/HANDOFF_2026-11-13_checkup-and-second-gm.md`).
>
> **Status (2026-11-13):** planned, **nothing started**. Cadence stays one cycle per test loop
> (see CLAUDE.md § Workflow).

## Context snapshot (2026-11-13)

- **World:** the campaign world, Foundry **14.370** (core files dated 2026-11-03), PF2e **8.7.0**
  (updated 2026-11-13). Verified from the installed `package.json` / `system.json`.
- **Modules in the world** (installed versions, read from each `module.json` on 2026-11-13):

  | Module                     | Version                                            | Updated    |
  | -------------------------- | -------------------------------------------------- | ---------- |
  | `simple-quest`             | **5.4.5** (was 5.1.4 when the SQ tools were built) | 2026-11-13 |
  | `pf2e-toolbelt`            | 3.61.3                                             | 2026-11-13 |
  | `pf2e-monster-parts`       | 0.8.7                                              | 2026-11-13 |
  | `battlezoo-bestiary-pf2e`  | 2.9                                                | 2026-11-13 |
  | `hexplorer`                | 3.0.4                                              | 2026-11-13 |
  | `lib-wrapper`              | 1.13.5.1                                           | 2026-06-10 |
  | `pf2e-tokens-monster-core` | 14.1.0                                             | 2026-06-11 |

- **Repo:** `master` is v0.8.3, 59 tools, last gated 2026-08-22 against Foundry 14.366 / PF2e 8.4.1.
- **Upstream:** at **v0.8.6** (30 commits past our base). Notable: a query security fix (`d662fec`),
  conditions through the system API (`6cfc406`), packs with non-Latin1 labels (`052f107`), a new
  `create-chat-message` tool.
- **Second GM:** an Assistant GM does **build-phase** prep from their own PC, with their own Claude
  Code and MCP server, sometimes at the same time as the maintainer. **Never two GMs during live play**,
  so play-time features (roll buttons, chat roll state) are out of scope for two-GM work. They reach
  Foundry over the home LAN by the host's private IP (plain HTTP). They get the same write
  access as the maintainer.

## ⛔ Live breakage found 2026-11-13: the deployed module is stock upstream

`D:/FoundryData-Paizo/Data/modules/foundry-mcp-bridge/` holds **adambdooley's v0.8.6**, installed
2026-11-13 01:09 by Foundry's module updater. Cause: our `packages/foundry-module/module.json` still
carries upstream's `manifest` and `download` URLs, so Foundry saw 0.8.6 > 0.8.3 and "updated" it.

The matched-pair rule is therefore broken in production: our server talks to a stock module. Every
tool with module-side code of ours is suspect (the 8 Simple Quest tools, the ported combat, chat,
playlist and distance tools, the pf2e roll fixes). Workstream 1 fixes this first.

## Workstreams, in order

### 1. Restore the deployment and run the post-update checkup

1. Point `manifest` and `download` in `module.json` at the fork (or remove them) so Foundry's updater
   cannot replace the module again. Give the module a version that does not read as older than
   upstream's.
2. Rebuild, deploy module + `backend.bundle.cjs` + **both** stdio wrappers (CLAUDE.md § Deploy).
3. Verify on the control port: **59 tools**.
4. `npm run gates` against Foundry 14.370 / PF2e 8.7.0 / **Simple Quest 5.4.5** (never run on
   these versions). **Simple Quest is the highest risk:** 5.1.4 → 5.4.5 is three minor versions,
   and our 8 SQ tools copy its internal behaviour (containment rules, coercions, counter storage,
   enricher parsing), which is not a stable API. For any failing check, read the installed SQ
   source at the matching call site before changing our code.
5. Spot-check against the modules the gates do not cover (`pf2e-toolbelt` and `lib-wrapper` can
   wrap core methods our tools call).

Ship our v0.8.3 line first so play works today. The upstream 0.8.6 re-port is workstream 4.

### 2. Release tag for the second GM

- Tag the restored build and **push it (ask the maintainer first)**.
- Fill in "Current build" in the second GM's setup doc in the play vault.
- Correct that doc: updating the bridge from Foundry's module manager installs the wrong build for
  **The maintainer too**, not only the second GM (until step 1.1 lands, it is the cause of the breakage above).

**The second GM can start after this**, before workstream 3, with three interim rules: the maintainer uses one GM
browser window only, nobody touches the bridge settings, and the two split work by area (folders or
scenes) in the play vault.

### 3. Two-GM hardening (build phase)

#### Findings (from source, 2026-11-13; not yet reproduced live)

1. **One server serves one Foundry client, and a second one fails silently.** WebSocket path: the
   first client wins and a second is accepted but never used, while believing it is connected
   (`mcp-server/src/foundry-connector.ts` ~L122). WebRTC path: the last client wins and the first is
   orphaned (`handleWebRTCOfferHTTP`, ~L333). The server also has no record of which user is
   connected. Each GM has their own server, so this only bites if a second GM session reaches the
   same server.
2. **Servers listen on every interface, not only localhost.** Port 31415 (`httpServer.listen(port)`,
   no host) and 31416 (`0.0.0.0`). On a shared LAN, a world `serverHost` other than `localhost`
   would send the second GM's browser to the maintainer's server (finding 1). Any LAN device can also reach them.
3. **Every bridge setting is world-scoped**, including per-person state. One GM's failed reconnect
   writes `autoReconnectEnabled = false` for both (`foundry-module/src/main.ts` L379). Each GM's
   heartbeat writes `lastActivity` to the world database. Changing host, port or connection type
   restarts both bridges (`settings.ts` `onConnectionChange`). `mapGenAutoStart` applies to the second GM's
   machine. Foundry v14 supports `scope: 'user'` (`common/constants.mjs` `SETTING_SCOPES.USER`).
4. **Some housekeeping runs on every GM client.** Both clients invalidate (delete) and rebuild the
   shared `enhanced-creature-index.json` in the world folder (`data-access.ts` `registerFoundryHooks`,
   `invalidateIndex`). The `requestMessageUpdate` socket handler ignores `targetGM`, so every GM
   handles it (`main.ts` ~L519).
5. **Query handlers check the wrong user.** Handlers in `CONFIG.queries` are reachable by any
   connected user through `User#query`, and they check `game.user` (the GM client running them),
   not the sender. Upstream fixed it in `d662fec` (v0.8.5) with a registration-time guard.
6. **Edits can overwrite each other.** Foundry merges updates per field, but a journal page body,
   Simple Quest objective lists and block lists are replaced whole. Claude's read, think, write cycle
   spans minutes, so a concurrent change (by the other Claude or a human in the UI) is silently lost.
   Foundry already stamps `_stats.modifiedTime` and `_stats.lastModifiedBy` on every document; our
   module never reads them.
7. **No identity or awareness.** Neither Claude knows which user it acts as, whether the other GM is
   online, or what changed since it last looked.
8. **Permissions are fine on defaults.** In v14 an Assistant GM gets `SETTINGS_MODIFY`,
   `FILES_UPLOAD` and the create permissions by default. Only a customised permission matrix changes
   that.

**Explained, not a bug:** the handoff's "bridge disconnected while granting Assistant GM" happened
because creating a user means going to Setup, which shuts the world down. The second GM had not connected.

#### Cycles

| #   | Cycle                                                                                                                                                                                                                                                                                                                                                    | Fixes           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 3.1 | **Connection identity.** The module sends user, role and world on connect. The server refuses a client from a different user with a visible notice on both sides; a reload by the same user replaces the old connection. Bind the servers to `127.0.0.1`. `get-world-info` reports `connectedAs` and other active GMs. Touches both packages (protocol). | 1, 2, part of 7 |
| 3.2 | Port upstream's query guard (`d662fec`).                                                                                                                                                                                                                                                                                                                 | 5               |
| 3.3 | **Per-user settings.** Connection, heartbeat, reconnect, notification and map-gen settings move to `scope: 'user'`. Stop persisting heartbeat bookkeeping. Migration reads the old world values **explicitly**, never via a silent default.                                                                                                              | 3               |
| 3.4 | **Run once.** Index rebuild only on the designated GM (`game.users.activeGM?.isSelf`); socket handler respects `targetGM`.                                                                                                                                                                                                                               | 4               |
| 3.5 | **New tool `get-recent-changes`**: documents changed since a time, and by whom, from `_stats`.                                                                                                                                                                                                                                                           | rest of 7       |
| 3.6 | **Edit-conflict check.** Reads return `modifiedTime`; whole-field writers accept `expectedModifiedTime` and refuse with `modified-since-read` plus who changed it. Journal and Simple Quest writers first.                                                                                                                                               | 6               |
| 3.7 | **Two-GM test with the second GM.** A short script of simultaneous actions, each designed to be able to fail.                                                                                                                                                                                                                                            | proof           |

Note on 3.6: Foundry has no server-side compare-and-set, so a millisecond window remains between
check and write. Today the window is the whole of Claude's think time.

**Upstream PR candidate:** 3.1, 3.3 and 3.4 fix generic bugs any multi-GM table hits. Contributing
them would remove a permanent re-port cost. The maintainer's call; never push to `upstream` from here.

### 4. Re-port upstream v0.8.4 to v0.8.6

Re-fork and re-port per CLAUDE.md § Upstream Sync, never merge. Rebuild the inventory with
`scripts/port-audit/` first. If 3.2 has landed, its guard is already in place; reconcile rather than
duplicate.

### 5. Friction from the 2026-11-13 vault session

One cycle each:

- **List a compendium pack's contents.** `search-compendium` only matches names (2+ characters).
- **Rune item levels** in `get-compendium-item` compact mode.
- **Page or truncate `get-compendium-entry-full`.** The Battlezoo _Monster Parts Subsystem_ journal
  returned about 105k characters and overflowed the client.

### 6. New module capabilities

Read each module's installed source before designing anything (standing rule).

- **Hexplorer** (`hexplorer` 3.0.4): **its own project, after workstreams 1 to 5 are done.** The
  campaign the maintainer plans to run features hexploration, so this is the likeliest source of new
  tools. Three steps, in order, each signed off before the next:
  1. **Research.** Read the installed module source: what it stores (scene flags, documents,
     settings), what API it exposes, how the GM drives it, and what pf2e's hexploration rules need
     that it does or does not model.
  2. **Plan.** Propose tools from what the GM actually does at the table, with gate designs. Write
     it up here for the maintainer's review.
  3. **Execute.** One tool per cycle, gated live, as usual.
- **Battlezoo Monster Parts** (`pf2e-monster-parts` 0.8.7 + `battlezoo-bestiary-pf2e` 2.9
  compendiums): **its own project, same footing as Hexplorer.** The campaign uses the subsystem
  **reflavored**, on the **Hybrid** variant, so it will be in constant use: harvesting parts,
  refining and imbuing gear. Same three steps, each signed off before the next:
  1. **Research.** Read the installed `pf2e-monster-parts` source (what it stores on actors and
     items, what API it exposes, how harvesting, refining and imbuing are driven) and the Battlezoo
     _Monster Parts Subsystem_ rules journal. Pin down what the Hybrid variant changes, and where the
     reflavoring lives (in the module's data, or only at the table and in the vault).
  2. **Plan.** Propose tools from what the GM actually does during play and prep, with gate designs.
     Write it up here for the maintainer's review.
  3. **Execute.** One tool per cycle, gated live.

  **Depends on workstream 5.** Two of its friction fixes (listing a pack's contents, and paging
  `get-compendium-entry-full`) are what let the MCP read the Battlezoo content at all. The rules
  journal alone is about 105k characters.

Order between Hexplorer and Monster Parts is the maintainer's call when workstream 5 is done.

## Parked backlog (carried from the archived plan)

Nothing here is scheduled. Each line says why it waits.

- **Tool-list bloat.** 7 of 56 tools cannot fire on pf2e and cost 33.7% of the tool payload. No
  system gate exists because `allTools` is built before Foundry connects. Try the Claude Code
  client-side lever first. (Found 2026-08-20.)
- **Combat tracker manipulation** (start/end, advance turns, roll initiative). Read-only today.
- **`get-character` cannot reach an unlinked token's actor**; use `get-token-details`.
- **`get-character` exact-name match**: "Amiri" misses `Amiri (Level 1)`. Exact-first then substring
  would fix it. Candidate, not adopted.
- **`set-journal-visibility` does not manage `hidden` on block list items.**
- **7d: server-side roll-modifier hoist + pf2e adapter initiative.** Coupled; neither delivers
  behaviour alone. Parked 2026-08-15.
- **Simple Quest surface not covered:** `map` (fog, pins, waypoints in `MapImage.js`),
  `investigation` (mind-map), custom page templates from SQ's `storage/` folder.
- **7c: Exalted Scenes + Narrator's Jukebox.** ⛔ Neither module is installed. Confirm a module is
  installed before scheduling work against it.
- **sf2e adapter + sf2e creature index.** Deferred, not deleted. Do not start without the maintainer.

**Policy, not backlog:** `@time` stays **forbidden output** (Simple Timekeeping declined
2026-08-22). See CLAUDE.md § Enforced policy.

## Open questions

1. Offer the two-GM fixes (3.1, 3.3, 3.4) upstream as a PR?
2. After workstream 4, what version does our module carry so Foundry never sees an "update"?
