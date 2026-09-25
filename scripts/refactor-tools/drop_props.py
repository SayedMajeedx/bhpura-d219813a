"""Drop unused props from a component and from every `<Component ... />` usage.

Usage: python drop_props.py <component-file> <Name> <prop> [<prop>...] -- <usage-file> [<usage-file>...]
"""
import re
import sys

args = sys.argv[1:]
sep = args.index("--")
comp_file, name, props = args[0], args[1], args[2:sep]
usage_files = args[sep + 1:]

s = open(comp_file, encoding="utf-8").read()
sig = s.index(f"export function {name}(")
body = s.index(") {\n", sig)
head = s[sig:body]
for p in props:
    head, a = re.subn(r"\n  " + re.escape(p) + r",\n", "\n", head, count=1)
    head, b = re.subn(r"\n  " + re.escape(p) + r": [^\n]*;\n", "\n", head, count=1)
    assert (a, b) == (1, 1), (name, p, a, b)
s = s[:sig] + head + s[body:]
open(comp_file, "w", encoding="utf-8", newline="").write(s)

for uf in usage_files:
    t = open(uf, encoding="utf-8").read()
    out, pos, n = [], 0, 0
    for m in re.finditer(r"<" + name + r"\b", t):
        j = t.index("/>", m.start())
        tag = t[m.start():j]
        for p in props:
            tag = re.sub(r"\s+" + re.escape(p) + r"=\{" + re.escape(p) + r"\}", "", tag)
        out.append(t[pos:m.start()] + tag)
        pos = j
        n += 1
    out.append(t[pos:])
    assert n > 0, (uf, name)
    open(uf, "w", encoding="utf-8", newline="").write("".join(out))
print(name, "dropped", props)
