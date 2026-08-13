"""Diff a single method body between two revisions, by brace matching."""
import difflib
import re
import subprocess
import sys

BASE, HEAD, PATH = sys.argv[1], sys.argv[2], sys.argv[3]
NAMES = sys.argv[4:]


def show(rev):
    return subprocess.run(
        ["git", "show", f"{rev}:{PATH}"], capture_output=True, text=True, encoding="utf-8", errors="replace"
    ).stdout.splitlines()


def extract(lines, name):
    pat = re.compile(
        r"^(\s*)(?:export\s+)?(?:private|public|protected)?\s*(?:static\s+)?(?:async\s+)?"
        + re.escape(name)
        + r"\s*(?:<[^>]*>)?\s*\("
    )
    for i, line in enumerate(lines):
        if pat.match(line):
            depth, started, out = 0, False, []
            for j in range(i, min(i + 900, len(lines))):
                out.append(lines[j])
                depth += lines[j].count("{") - lines[j].count("}")
                if "{" in lines[j]:
                    started = True
                if started and depth <= 0:
                    break
            return out
    return None


o, n = show(BASE), show(HEAD)
for name in NAMES:
    a, b = extract(o, name), extract(n, name)
    print(f"================ {name} ================")
    if a is None or b is None:
        print(f"  (missing: base={a is not None} head={b is not None})")
        continue
    d = [
        l
        for l in difflib.unified_diff(a, b, "upstream", "ours", n=2, lineterm="")
        if not l.startswith(("---", "+++"))
    ]
    print("\n".join(d) if d else "  (identical)")
    print()
