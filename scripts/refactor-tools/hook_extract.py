"""Move named top-level statements of OrderDetail into a custom hook.

Usage: python hook_extract.py <HookName> <file-stem> "<doc>" name1 name2 ...
Each name is a const declared at 2-space indent (`const name =` or `const [name, setName] =`).
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import extract_lib as X  # noqa: E402  (reads the route; we re-read below)

ROUTE = X.ROUTE
hook, stem, doc, names = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
s = open(ROUTE, encoding="utf-8").read()
A = s.index(X.FUNC)


def stmt_span(name):
    m = re.search(r"^  const (?:" + re.escape(name) + r"\b|\[" + re.escape(name) + r"\b[^\]]*\]|\{[^}]*\b" + re.escape(name) + r"\b[^}]*\})\s*[=:]", s[A:], re.M)
    assert m, name
    i = A + m.start()
    depth, k = 0, i
    while True:
        ch = s[k]
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        elif ch == ";" and depth == 0:
            end = s.index("\n", k) + 1
            return i, end
        k += 1


spans = sorted({stmt_span(n) for n in names})
stmts = [s[i:j] for i, j in spans]
declared = set()
for t in stmts:
    for m in re.finditer(r"^  const (\w+)\s*[=:]", t, re.M):
        declared.add(m.group(1))
    for m in re.finditer(r"^  const \[([^\]]*)\]", t, re.M):
        declared.update(x.strip() for x in m.group(1).split(",") if x.strip())
text = "".join(stmts)
scope = X.scope_names() if False else None  # placeholder to keep import side effects explicit

# Recompute the scope from the current file.
X.s = s
scope = X.scope_names()
deps = [n for n in X.used(text, scope) if n not in declared]
missing = [n for n in deps if n not in X.TYPES]
assert not missing, ("add types", missing)

first = spans[0][0]
for d in deps:
    m = re.search(r"^  const (?:" + re.escape(d) + r"\b|\[[^\]]*\b" + re.escape(d) + r"\b|\{[^}]*\b" + re.escape(d) + r"\b)", s[A:], re.M)
    assert m and A + m.start() < first, ("dependency declared after the hook call", d)

# Remove statements (back to front), insert the hook call at the first position.
for i, j in reversed(spans):
    s = s[:i] + s[j:]
returns = sorted(declared)
call = "  const {\n" + "".join(f"    {n},\n" for n in returns) + f"  }} = {hook}({{\n" + "".join(f"    {n},\n" for n in deps) + "  });\n"
s = s[:first] + call + s[first:]

anchor = X.ANCHOR
assert s.count(anchor) == 1
s = s.replace(anchor, anchor + f'\nimport {{ {hook} }} from "@/features/orders/hooks/{stem}";')
open(ROUTE, "w", encoding="utf-8", newline="").write(s)

params = ",\n".join(f"  {n}" for n in deps)
types = "\n".join(f"  {n}: {X.TYPES[n]};" for n in deps)
open(f"src/features/orders/hooks/{stem}.ts", "w", encoding="utf-8", newline="").write(
    X.IMPORTS + "\n" + X.EXTRA_IMPORTS + "\n\n"
    + f"/** {doc} */\nexport function {hook}({{\n{params},\n}}: {{\n{types}\n}}) {{\n"
    + "".join(stmts).rstrip("\n") + "\n\n  return {\n" + "".join(f"    {n},\n" for n in returns) + "  };\n}\n"
)
print(hook, "deps", deps, "returns", returns)
