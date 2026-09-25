"""Move sibling JSX (start marker .. line-anchored end marker, inclusive) into a component returning a fragment.

Usage: python frag_extract.py <Name> "<doc>" <start_marker> <end_marker> <indent_in_route>
Env: same as extract_lib (ROUTE, FUNC, RET_AFTER, ANCHOR, COMP_DIR, TYPES_JSON, EXTRA_IMPORTS_FILE).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import extract_lib as X  # noqa: E402

name, doc, start, end, indent = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
s = open(X.ROUTE, encoding="utf-8").read()
X.s = s
i = s.index(start)
j = s.index("\n" + end, i) + 1 + len(end)
segment = s[i:j]
names = X.used(segment, X.scope_names())
missing = [n for n in names if n not in X.TYPES]
assert not missing, ("add types", missing)
jsx = "    <>\n" + X.reindent(segment, indent - 6) + "\n    </>"
X.write_component(name, doc, names, "", jsx)
pad = " " * indent
usage = f"{pad}<{name}" + "".join(f"\n{pad}  {n}={{{n}}}" for n in names) + f"\n{pad}/>\n"
s = s[:i] + usage + s[j:]
assert s.count(X.ANCHOR) == 1
s = s.replace(X.ANCHOR, X.ANCHOR + f'\nimport {{ {name} }} from "{X.C.replace("src/", "@/", 1)}{name}";')
open(X.ROUTE, "w", encoding="utf-8", newline="").write(s)
print(name, names)
