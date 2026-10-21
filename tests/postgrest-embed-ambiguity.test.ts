import { describe, expect, it } from "vitest";
import types from "../src/integrations/supabase/types.ts?raw";

// A query that brings one table in under another ("lines with their customer's order") names
// how the two are joined only when they are joined more than one way. Two tables joined two ways
// make the API refuse the whole read ("more than one relationship was found", PGRST201): the
// supplier orders list stopped loading in every store the day a second link from a supplier
// order's line to an order line was added (`released_order_item_id`). Mocked screens cannot see
// it, so this reads the links from the generated types and every select written in the code.

const sources = import.meta.glob<string>("../src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** How many foreign keys join each pair of tables, either way: "a|b" sorted. */
function linkCounts(generated: string) {
  const tablesStart = generated.indexOf("    Tables: {");
  const tablesEnd = generated.indexOf("    Views: {", tablesStart);
  const lines = generated.slice(tablesStart, tablesEnd).split("\n");
  const counts = new Map<string, number>();
  let table = "";
  for (const line of lines) {
    const opened = /^ {6}(\w+): \{$/.exec(line);
    if (opened) table = opened[1];
    const ref = /referencedRelation: "(\w+)"/.exec(line);
    if (ref && table) {
      const key = [table, ref[1]].sort().join("|");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

type Embed = { relation: string; hinted: boolean; children: Embed[] };

/** The embeds of a PostgREST select, as a tree: `alias:table!hint(columns, child(...))`. */
export function selectEmbeds(select: string): Embed[] {
  let at = 0;
  const list = (): Embed[] => {
    const found: Embed[] = [];
    while (at < select.length && select[at] !== ")") {
      const start = at;
      while (at < select.length && !",()".includes(select[at])) at += 1;
      const head = select.slice(start, at).trim();
      if (select[at] === "(") {
        at += 1;
        const children = list();
        at += 1; // ")"
        const [named, ...hints] = head.split("!");
        const relation = named.includes(":") ? named.split(":").pop()!.trim() : named.trim();
        const hinted = hints.some((h) => !["inner", "left"].includes(h.trim()));
        found.push({ relation, hinted, children });
      }
      if (select[at] === ",") at += 1;
    }
    return found;
  };
  return list();
}

/** Every select in the code: its text and, when it is written after `.from(...)`, its table. */
function selectsInCode() {
  const found: Array<{ file: string; root: string | null; select: string }> = [];
  for (const [file, code] of Object.entries(sources)) {
    if (file.includes("integrations/supabase/types")) continue;
    const constants = new Map<string, string>();
    for (const m of code.matchAll(/const (\w+)\s*=\s*((?:"[^"\n]*"\s*\+?\s*)+);/g)) {
      constants.set(m[1], [...m[2].matchAll(/"([^"\n]*)"/g)].map((s) => s[1]).join(""));
    }
    const rooted = new Map<string, string>();
    for (const m of code.matchAll(/\.from\("(\w+)"\)\s*\.select\(\s*(?:"([^"\n]*)"|(\w+))/g)) {
      const select = m[2] ?? constants.get(m[3] ?? "");
      if (select) rooted.set(select, m[1]);
    }
    const literals = [...code.matchAll(/"([^"\n]*\([^"\n]*)"/g)].map((m) => m[1]);
    for (const select of new Set([...literals, ...constants.values(), ...rooted.keys()])) {
      if (!/^[\w\s,!:().*>-]+$/.test(select) || !select.includes("(")) continue;
      found.push({ file, root: rooted.get(select) ?? null, select });
    }
  }
  return found;
}

describe("a select that brings one table in under another", () => {
  const counts = linkCounts(types);
  const twoWays = (a: string, b: string) => (counts.get([a, b].sort().join("|")) ?? 0) > 1;

  it("reads the tables' links from the generated types", () => {
    expect(twoWays("purchase_order_items", "order_items")).toBe(true);
    expect(twoWays("purchase_order_items", "purchase_orders")).toBe(false);
  });

  it("reads a select's embeds, their aliases and hints", () => {
    expect(selectEmbeds("id, a:order_items!fk_x(id, orders(status)), vendors!inner(name)")).toEqual(
      [
        {
          relation: "order_items",
          hinted: true,
          children: [{ relation: "orders", hinted: false, children: [] }],
        },
        { relation: "vendors", hinted: false, children: [] },
      ],
    );
  });

  it("names the link wherever two tables are joined more than one way", () => {
    const unnamed: string[] = [];
    const walk = (parent: string | null, embeds: Embed[], where: string) => {
      for (const embed of embeds) {
        if (parent && !embed.hinted && twoWays(parent, embed.relation)) {
          unnamed.push(`${where}: ${parent} → ${embed.relation}`);
        }
        walk(embed.relation, embed.children, where);
      }
    };
    for (const { file, root, select } of selectsInCode()) {
      walk(root, selectEmbeds(select), file.replace("../", ""));
    }
    expect(unnamed).toEqual([]);
  });
});
