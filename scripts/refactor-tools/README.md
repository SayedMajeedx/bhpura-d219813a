# Refactor tools

Small Python helpers used for the Phase 4 (data layer) and Phase 5 (giant
file) refactors. They move code **verbatim** so refactors stay
behaviour-preserving, and let the type checker and ESLint find what is left
to fix. Run them from the repo root (`python scripts/refactor-tools/<tool>.py`).
Nothing here runs in CI or the app.

Always follow a run with:

```bash
npx prettier --write <touched files>
npx eslint <touched files> -f json -o eslint.json
python scripts/refactor-tools/rm_imports.py eslint.json   # drops unused imports
npx prettier --write <touched files>
npx tsc --noEmit
npx eslint <touched files>
```

## Tools

| Tool                  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extract_lib.py`      | Library used by the others. Configured with env vars: `ROUTE` (file), `FUNC` (the component's opening line), `RET_AFTER` (a statement just before its main `return (`), `ANCHOR` (an import line to add new imports after), `COMP_DIR`, `TYPES_JSON` (prop name → TypeScript type), `EXTRA_IMPORTS_FILE`. `scope_names()` lists the component's local names; `used()` finds which of them a JSX block uses; `write_component()` writes a component file with typed props. |
| `frag_extract.py`     | Moves sibling JSX (start marker to a line-anchored end marker) into a component that returns a fragment.                                                                                                                                                                                                                                                                                                                                                                  |
| `hook_extract.py`     | Moves named top-level `const`s of a component into a custom hook (written for the order editor; adapt the constants at the top).                                                                                                                                                                                                                                                                                                                                          |
| `move_block.py`       | Moves top-level declarations (by line range) into a new module, exported.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `drop_props.py`       | Removes props ESLint reports unused from a component and every `<Component … />` usage.                                                                                                                                                                                                                                                                                                                                                                                   |
| `drop_hook_params.py` | Same for a hook's parameters (written for the order editor; adapt `ROUTE`).                                                                                                                                                                                                                                                                                                                                                                                               |
| `rm_imports.py`       | Removes import specifiers that ESLint reports as unused (reads `eslint -f json` output).                                                                                                                                                                                                                                                                                                                                                                                  |

## Examples (real drivers from merged PRs)

- `examples/split_checkout_sections.py`: moved 10 JSX sections of the checkout into components, typing each prop from the hook that owns it (`ReturnType<typeof useX>["name"]`). PR #57.
- `examples/split_dashboard_logic.py`: moved queries into a data hook and `useMemo` bodies into pure, tested functions (adding a `now` parameter for tests). PR #58.
- `examples/orders_writes_to_mutations.py`: replaced direct `supabase.from("orders").update(… as any)` calls with typed mutations and hand-built keys with key factories. PR #64.

They ran against the files as they were then; read them as patterns, don't re-run them.

## Pitfalls (learned the hard way)

- **Anchor end markers to line starts** (`"\n" + marker`): `"        </div>"` also matches a deeper-indented line.
- **`take(start, "")` removes nothing** (the empty end matches at `start`). Pass the line itself as the end marker to cut a single line.
- **The Bash tool mangles `\n` and `\\` inside heredocs.** Write code that contains escapes (e.g. `.join("\n")`) with a file-writing tool, or `chr(92)`, and grep the result.
- **`used()` has false positives from JSX text** ("Your cart has been saved" matches `cart`): ESLint then reports the prop unused and `drop_props.py` removes it.
- **Files over 1000 lines may not grow** (ratchet). An added import can push a frozen file over its budget: prefer an existing import (e.g. `queryKeys.products.all` instead of importing `catalogKeys`), or leave that file for its own domain's PR.
