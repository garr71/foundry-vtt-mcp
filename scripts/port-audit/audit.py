"""Map every diff hunk to the enclosing method of the OLD (upstream) file.

Distinguishes:
  NEW      - method exists only in ours (pure addition, safe to port as a block)
  MODIFIED - upstream method we edited in place (the dangerous kind; easy to miss)
"""
import re
import subprocess
import sys

BASE, HEAD, PATH = sys.argv[1], sys.argv[2], sys.argv[3]


def run(args):
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace").stdout


old = run(["git", "show", f"{BASE}:{PATH}"]).splitlines()
new = run(["git", "show", f"{HEAD}:{PATH}"]).splitlines()

# Method definitions at class-member indentation, plus top-level functions.
MDEF = re.compile(
    r"^(\s*)(?:export\s+)?(?:private|public|protected)?\s*(?:static\s+)?(?:async\s+)?"
    r"([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:<[^>]*>)?\s*\("
)
SKIP = {"if", "for", "while", "switch", "catch", "return", "function", "constructor", "super"}


def methods(lines):
    out = []
    for i, line in enumerate(lines, start=1):
        m = MDEF.match(line)
        if m and m.group(2) not in SKIP and len(m.group(1)) <= 4:
            out.append((i, m.group(2)))
    return out


old_m = methods(old)
new_names = {n for _, n in methods(new)}
old_names = {n for _, n in old_m}


def enclosing(line_no):
    best = None
    for start, name in old_m:
        if start <= line_no:
            best = name
        else:
            break
    return best or "<file top>"


hunks = run(["git", "diff", "-U0", BASE, HEAD, "--", PATH]).splitlines()
touched = {}
for h in hunks:
    m = re.match(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", h)
    if not m:
        continue
    old_start = int(m.group(1))
    old_len = int(m.group(2)) if m.group(2) is not None else 1
    kind = "edited" if old_len > 0 else "inserted-after"
    name = enclosing(old_start)
    touched.setdefault(name, {"edited": 0, "inserted-after": 0})
    touched[name][kind] += 1

print(f"### {PATH}")
print(f"    old methods: {len(old_names)}   new-only methods: {len(new_names - old_names)}\n")

print("--- MODIFIED upstream methods (in-place edits — these are the easy ones to miss) ---")
any_mod = False
for name, counts in sorted(touched.items()):
    if counts["edited"] > 0 and name in old_names:
        print(f"  {name:<42} {counts['edited']} edited hunk(s)")
        any_mod = True
if not any_mod:
    print("  (none)")

print("\n--- NEW methods added by us ---")
for n in sorted(new_names - old_names):
    print(f"  {n}")

print("\n--- REMOVED from upstream by us ---")
for n in sorted(old_names - new_names):
    print(f"  {n}")
