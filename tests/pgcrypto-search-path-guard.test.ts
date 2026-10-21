import { describe, expect, it } from "vitest";

// pgcrypto lives in the `extensions` schema. A function that sets its own search_path without
// `extensions` and calls gen_random_bytes() (or another pgcrypto function) unqualified fails
// on every call: migration 20260905090000 did this to the cart recording function, and no new
// abandoned cart was recorded for six weeks (fixed by 20261021130000). This reads every
// migration (through the bundler, not the file system) and holds the latest definition of each
// function to the rule: qualify the call (`extensions.gen_random_bytes`) or put `extensions`
// on the path. gen_random_uuid() is core Postgres and needs neither.

const migrations = import.meta.glob("../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const PGCRYPTO_CALL =
  /(?<![\w.])(gen_random_bytes|digest|hmac|crypt|gen_salt|pgp_sym_encrypt|pgp_sym_decrypt|pgp_pub_encrypt|pgp_pub_decrypt|armor|dearmor)\s*\(/i;

type FunctionDefinition = {
  file: string;
  name: string;
  /** Everything outside the body: arguments, options (SET search_path ...). */
  options: string;
  body: string;
};

const withoutComments = (sql: string) =>
  sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

/** Every CREATE FUNCTION in a migration, with its body and its options. */
function functionDefinitions(file: string, sql: string): FunctionDefinition[] {
  const found: FunctionDefinition[] = [];
  const header = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?(\w+)"?\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = header.exec(sql))) {
    const rest = sql.slice(match.index);
    const tag = /AS\s+(\$[\w]*\$)/i.exec(rest);
    if (!tag) continue;
    const bodyStart = tag.index + tag[0].length;
    const bodyEnd = rest.indexOf(tag[1], bodyStart);
    if (bodyEnd < 0) continue;
    const after = rest.slice(bodyEnd + tag[1].length);
    const end = after.indexOf(";");
    found.push({
      file,
      name: match[1].toLowerCase(),
      options: rest.slice(0, tag.index) + (end >= 0 ? after.slice(0, end) : after),
      body: rest.slice(bodyStart, bodyEnd),
    });
    header.lastIndex = match.index + bodyEnd + tag[1].length;
  }
  return found;
}

/** Whether a definition calls pgcrypto in a way its own search_path cannot resolve. */
function pgcryptoUnreachable(definition: FunctionDefinition): boolean {
  if (!PGCRYPTO_CALL.test(withoutComments(definition.body))) return false;
  const path = /SET\s+search_path\s*(?:TO|=)\s*([^\n]+)/i.exec(definition.options);
  if (!path) return false;
  return !/extensions/i.test(path[1]);
}

/** The newest definition of each function, by name. */
function latestDefinitions(): FunctionDefinition[] {
  const latest = new Map<string, FunctionDefinition>();
  for (const file of Object.keys(migrations).sort()) {
    for (const definition of functionDefinitions(file, migrations[file])) {
      latest.set(definition.name, definition);
    }
  }
  return [...latest.values()];
}

describe("pgcrypto under a search_path", () => {
  it("is reachable from the latest definition of every function", () => {
    expect(Object.keys(migrations).length).toBeGreaterThan(300);
    const offenders = latestDefinitions()
      .filter(pgcryptoUnreachable)
      .map((d) => `${d.name} (${d.file.split("/").pop()})`);
    expect(offenders).toEqual([]);
  });

  it("catches the definition that broke cart recording, and accepts the ways to fix it", () => {
    const broken = `
      CREATE OR REPLACE FUNCTION public.rpc_record_or_update_cart_activity(p_brand_id uuid)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public
      AS $$ BEGIN PERFORM encode(gen_random_bytes(16), 'hex'); END; $$;`;
    const qualified = broken.replace("gen_random_bytes", "extensions.gen_random_bytes");
    const onThePath = broken.replace("search_path = public", "search_path = public, extensions");
    const trailing = `
      CREATE FUNCTION public.token() RETURNS text AS $fn$ SELECT encode(gen_random_bytes(8), 'hex') $fn$
      LANGUAGE sql SECURITY DEFINER SET search_path TO 'public';`;
    const commented = broken.replace(
      "PERFORM encode(gen_random_bytes(16), 'hex');",
      "-- gen_random_bytes(16) is not used\n NULL;",
    );
    const check = (sql: string) => functionDefinitions("x.sql", sql).map(pgcryptoUnreachable);
    expect(check(broken)).toEqual([true]);
    expect(check(qualified)).toEqual([false]);
    expect(check(onThePath)).toEqual([false]);
    expect(check(trailing)).toEqual([true]);
    expect(check(commented)).toEqual([false]);
  });

  it("reads the cart recording function's latest definition from the fix", () => {
    const recording = latestDefinitions().find(
      (d) => d.name === "rpc_record_or_update_cart_activity",
    );
    expect(recording?.file).toMatch(/20261021130000_abandoned_cart_recording_restored\.sql$/);
  });
});
