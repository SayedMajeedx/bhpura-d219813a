"""Remove unused import specifiers reported by ESLint (no-unused-vars)."""
import json
import os
import re
import sys

# Usage: npx eslint <files> -f json -o eslint.json && python rm_imports.py eslint.json
data = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "eslint.json", encoding="utf-8"))

IMPORT_RE = re.compile(
    r"^import\s+(?P<type>type\s+)?(?P<clause>[^;]*?)\s+from\s+(?P<src>['\"][^'\"]+['\"])\s*;?[ \t]*\n?",
    re.M | re.S,
)
NAME_RE = re.compile(r"'([^']+)' is (?:defined|assigned a value) but never used")

handled = 0
leftovers = []
for f in data:
    msgs = [m for m in f["messages"] if m.get("ruleId") == "@typescript-eslint/no-unused-vars"]
    if not msgs:
        continue
    path = f["filePath"]
    src = open(path, encoding="utf-8").read()
    line_starts = [0]
    for i, ch in enumerate(src):
        if ch == "\n":
            line_starts.append(i + 1)

    targets = []
    for m in msgs:
        nm = NAME_RE.search(m["message"])
        if not nm:
            leftovers.append((path, m["line"], m["message"]))
            continue
        targets.append((nm.group(1), line_starts[m["line"] - 1] + m["column"] - 1, m))

    edits = []  # (start, end, replacement)
    remaining = []
    for name, offset, m in targets:
        stmt = None
        for im in IMPORT_RE.finditer(src):
            if im.start() <= offset < im.end():
                stmt = im
                break
        if not stmt:
            remaining.append((path, m["line"], m["message"]))
            continue
        edits.append((stmt, name))

    # Group removals per statement.
    by_stmt = {}
    for stmt, name in edits:
        by_stmt.setdefault(stmt.start(), (stmt, set()))[1].add(name)

    for start in sorted(by_stmt, reverse=True):
        stmt, names = by_stmt[start]
        clause = stmt.group("clause").strip()
        default = None
        named = []
        m_named = re.search(r"\{(.*)\}", clause, re.S)
        if m_named:
            named = [s.strip() for s in m_named.group(1).split(",") if s.strip()]
            before = clause[: m_named.start()].strip().rstrip(",").strip()
            default = before or None
        else:
            if clause.startswith("*"):
                remaining.append((path, "ns", clause))
                continue
            default = clause

        def local(spec: str) -> str:
            spec = re.sub(r"^type\s+", "", spec)
            return spec.split(" as ")[-1].strip()

        kept = [s for s in named if local(s) not in names]
        if default and default in names:
            default = None
        handled += len(names)
        if not kept and not default:
            new = ""
        else:
            parts = []
            if default:
                parts.append(default)
            if kept:
                parts.append("{ " + ", ".join(kept) + " }")
            new = f"import {stmt.group('type') or ''}{', '.join(parts)} from {stmt.group('src')};\n"
        src = src[: stmt.start()] + new + src[stmt.end():]

    open(path, "w", encoding="utf-8", newline="").write(src)
    leftovers.extend(remaining)

print("removed import specifiers:", handled)
print("left for manual review:", len(leftovers))
for p, line, msg in leftovers:
    print(f"  {os.path.relpath(p)}:{line} {str(msg)[:80]}")
