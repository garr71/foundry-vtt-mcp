# Port audit

Tooling for rebuilding the fork's port inventory from the diff instead of from commit messages.

## Why this exists

Our fork is a thin layer of custom tools over a large upstream codebase, and the migration plan
tracks what has to be re-ported after each re-fork. Revision 3 of that plan built its inventory by
reading commit messages. It listed three shared-file changes. A method-level audit found **eight**.

The four it missed were all the same shape: **small in-place edits to existing upstream methods**,
buried inside a file that also gained ~978 lines of new code. One of them (`buildRollFormula`)
reached production as a silent correctness bug — pf2e skill checks rolled `1d20 + 0`.

Git cannot help here on its own. Its default hunk-header regex does not recognise TypeScript
methods, so `git diff` labels every hunk in a large class with the bare class declaration:

```
@@ -5788,7 +5788,20 @@ export class FoundryDataAccess {
```

Fifteen hunks, one label, no way to tell a new method from a surgical edit to an upstream one.

## Usage

```bash
# 1. Which upstream methods did we edit in place, and which did we add?
python scripts/port-audit/audit.py <base> <head> <path>

# 2. What exactly changed inside one of them?
python scripts/port-audit/mdiff.py <base> <head> <path> <method> [<method>...]
```

`<base>` is the fork point (`git merge-base <ours> upstream/master`), `<head>` is our branch.

Example, the run that found the missing rows:

```bash
python scripts/port-audit/audit.py 62cd3fb master packages/foundry-module/src/data-access.ts
#   MODIFIED upstream methods
#     attachRollButtonHandlers   1 edited hunk(s)     <- was missing from the plan
#     buildEnhancedIndex         1 edited hunk(s)     <- sf2e, correctly deferred
#     buildRollFormula           7 edited hunk(s)     <- was missing; shipped as a live bug
#     getTokenDetails            1 edited hunk(s)     <- was missing; would have broken Phase 4
#     requestPlayerRolls         1 edited hunk(s)     <- was missing from the plan
```

`audit.py` maps each hunk to its enclosing method **in the old file** and separates:

- **NEW methods** — ours alone, safe to port as a block, hard to lose because they are additions
- **MODIFIED upstream methods** — in-place edits, the ones that disappear
- **REMOVED** — upstream code we deleted, which is a re-sync conflict waiting to happen

`mdiff.py` extracts a single method from both revisions by brace matching and prints a unified
diff, which works regardless of how far the method has moved between revisions.

## Process

Run this over **every shared file** after a re-fork, before trusting any phase list:

1. `git merge-base <ours> upstream/master` for the base
2. `audit.py` over each shared file
3. `mdiff.py` on every MODIFIED method, and classify each: port / defer / already upstream
4. Check each "port" item against the current stock tree — upstream may have fixed it since
5. Reconcile against the plan, and schedule anything unlisted

Step 4 matters in both directions. It proved `2eb4d39` (preserve `effects[]`/`flags{}`) redundant,
since upstream landed the same fix in `eef5e60` — and proved the four missing rows were still
genuinely absent from stock.

## Notes

- Python only, no dependencies. Use `python`, not `python3`.
- On Windows set `PYTHONIOENCODING=utf-8` if piping output through a non-UTF-8 console.
- The method regex targets class members at indent ≤ 4 and skips control-flow keywords. It is a
  heuristic: sanity-check the "new methods" list, since odd formatting can produce a stray entry.
