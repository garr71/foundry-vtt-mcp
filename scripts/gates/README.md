# Gates

Behavioural checks that run against a **live Foundry world** through the backend's control
port, not unit tests. They exist because most of what these tools do is a reproduction of
another module's internals.

```bash
node scripts/gates/run-all.cjs        # everything
node scripts/gates/gate-7b1-get-timeline.cjs   # one gate, full output
```

## Why these exist

The Simple Quest tools do not call a stable API. They reproduce decisions made inside Simple
Quest's own source: which era contains an event, that `null` compares as `0`, how era pixel
heights accumulate, where a counter is stored, how the body is parsed for `@COUNT`. None of
that is contract; it is behaviour read out of a module that changes.

This project already has the scar. Simple Quest moved quest state out of flags between 3.0.20
and 5.1.4, which is why two tools had to be rebuilt rather than re-ported. These gates are the
early-warning system for the next time that happens.

**Run them after:**

- a Simple Quest update (the main one)
- a Foundry version bump
- re-porting onto an upstream sync
- any change to `data-access.ts`

## Requirements

- the backend listening on `127.0.0.1:31414`
- Foundry open, connected, and running the **current** module build

⚠️ **A Foundry socket reconnect is not a module reload.** After copying
`packages/foundry-module/dist`, the browser keeps running the old JavaScript and reconnects on
the socket anyway, so the connection looks healthy while the new code is absent. Every gate
opens with a **freshness probe** that exits with status 2 rather than report a result on stale
code. Press F5 in Foundry after deploying.

## Fixtures

Gates build what they need and reuse it if present, so the suite runs on a freshly imported
world. Everything is named `MCP Gate … (safe to delete)` and lives in the `Timeline` or
`Quests` folders. Nothing touches real campaign content.

`fixtures.cjs` holds the shared ones. The timeline fixture is deliberately ugly, and it renders
wrong on purpose: adjacent eras so an inclusive start can be told from an exclusive end, an era
with no end so the negative-height path is exercised, a tail era that keeps the axis positive
so it still scrolls, and events sitting exactly on both boundaries.

Two gates hardcoded a journal id until 2026-08-22. That quietly turned them into one-off
verifications the moment the world was rebuilt — they would have failed on a fixture that no
longer existed and been read as broken tools. Fixtures are resolved by name and built on demand
now.

## Writing a new one

The house rules, each learned by shipping the mistake first:

- **A test that cannot fail is not a test.** Call a tool with _no arguments_ to prove a default
  changed; passing the value explicitly passes on the old code too.
- **Move a value away from its resting state, then back.** Setting a field to what it already
  holds is indistinguishable from the write being ignored.
- **A passing happy path does not test the branch it did not take.** Every gate here has at
  least one check that fails if the code becomes _too_ strict — a guard that refuses everything
  passes all the negative checks.
- **Prefer a fixture where the candidate explanations give different numbers.**
- **Match within one element, never across a joined collection.** A regex over warnings joined
  into a single string will pair fragments from different entries and report a flag nobody
  raised.
- **Make it idempotent.** Reset what you move at the start. A gate that only passes on a clean
  world is not a regression check.
- **Do the UI confirmation.** Three of the `get-timeline` findings were invisible in the tool
  response and only appeared on screen, after the API gate already read 15/15. If a tool
  describes something a person looks at, look at it.
