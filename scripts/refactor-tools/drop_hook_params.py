"""Remove unused params from a hook and from its call in the order route.

Usage: python drop_hook_params.py <HookName> <hook-file> <param> [<param>...]
"""
import re
import sys

ROUTE = "src/routes/_authenticated/admin.b.$slug.orders.$id.tsx"
hook, hook_file, params = sys.argv[1], sys.argv[2], sys.argv[3:]

r = open(ROUTE, encoding="utf-8").read()
i = r.index(hook + "({")
end = r.index("});", i)
seg = r[i:end]
for n in params:
    seg, c = re.subn(r"\n\s*" + re.escape(n) + r",", "", seg, count=1)
    assert c == 1, ("call", n)
r = r[:i] + seg + r[end:]
open(ROUTE, "w", encoding="utf-8", newline="").write(r)

t = open(hook_file, encoding="utf-8").read()
sig = t.index(f"export function {hook}(")
body = t.index(") {\n", sig)
head = t[sig:body]
for n in params:
    head, a = re.subn(r"\n  " + re.escape(n) + r",\n", "\n", head, count=1)
    head, b = re.subn(r"\n  " + re.escape(n) + r": [^\n]*;\n", "\n", head, count=1)
    assert (a, b) == (1, 1), (n, a, b)
t = t[:sig] + head + t[body:]
open(hook_file, "w", encoding="utf-8", newline="").write(t)
print(hook, "dropped", params)
