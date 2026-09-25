"""Move top-level declarations out of a route into a new module (verbatim, exported).

Usage: python move_block.py <route> <target-file> <import-names-comma-separated> <start>-<end> [<start>-<end> ...]
Line ranges are 1-based and inclusive; they are moved in file order. The target
gets the route's whole import block (prune it afterwards) and the route imports
the given names from the target.
"""
import os
import sys

route, target, names = sys.argv[1], sys.argv[2], sys.argv[3].split(",")
ranges = sorted(tuple(map(int, r.split("-"))) for r in sys.argv[4:])
L = open(route, encoding="utf-8").read().split("\n")
end_imports = next(
    i for i, l in enumerate(L)
    if l.startswith(("type ", "export const Route", "function ", "const ", "export function ", "interface "))
)
import_block = "\n".join(L[:end_imports]).rstrip()


def export(block):
    return [("export " + l) if l.startswith(("function ", "async function ", "type ", "interface ", "const ")) else l for l in block]


moved = []
for a, b in ranges:
    moved += export(L[a - 1 : b]) + [""]
os.makedirs(os.path.dirname(target), exist_ok=True)
open(target, "w", encoding="utf-8", newline="").write(import_block + "\n\n" + "\n".join(moved).rstrip("\n") + "\n")

drop = set()
for a, b in ranges:
    drop.update(range(a - 1, b))
    if b < len(L) and L[b].strip() == "":
        drop.add(b)
out = [l for i, l in enumerate(L) if i not in drop]
spec = target.replace("src/", "@/", 1).rsplit(".", 1)[0]
out.insert(end_imports, f'import {{ {", ".join(names)} }} from "{spec}";')
open(route, "w", encoding="utf-8", newline="").write("\n".join(out))
print(target, "moved lines:", sum(b - a + 1 for a, b in ranges))
