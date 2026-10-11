import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import previous from "../supabase/migrations/20261011100000_priced_options_charged.sql?raw";
import migration from "../supabase/migrations/20261012100000_storefront_order_owner_from_profiles.sql?raw";

// A storefront order needs the store's owner. For a store with no recorded creator the order
// builder looked the owner up in a table that does not exist, so every order of that store
// failed. The migration reads the store's staff instead, and must change nothing else.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const NAME = "place_storefront_order_internal_20260710";
const functionOf = (sql: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name()}(`);
  const open = sql.indexOf("$function$", start);
  const end = sql.indexOf("$function$", open + 1);
  return sql.slice(start, end + "$function$".length);
};
const name = () => NAME;
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

const OLD_LOOKUP =
  "SELECT user_id INTO v_owner FROM public.tenant_users WHERE brand_id = v_brand.id AND role = 'brand_owner' LIMIT 1;";
/** The new lookup as the migration writes it, comments removed. */
const newLookup = () => {
  const body = functionOf(migration);
  const start = body.indexOf("SELECT p.id INTO v_owner");
  const end = body.indexOf("LIMIT 1;", start) + "LIMIT 1;".length;
  return squash(body.slice(start, end));
};

describe("the migration that finds a store's owner among its staff", () => {
  it("no longer reads the table that does not exist", () => {
    expect(functionOf(previous)).toContain("public.tenant_users");
    expect(functionOf(migration)).not.toContain("tenant_users");
  });

  it("changes that lookup and nothing else", () => {
    const withoutComments = squash(
      functionOf(migration)
        .split("\n")
        .filter((line) => !/^\s*-- (The store's own staff|accounts last)/.test(line))
        .join("\n"),
    );
    expect(withoutComments.replace(newLookup(), OLD_LOOKUP)).toBe(squash(functionOf(previous)));
  });

  it("still takes the store's recorded creator first, and still refuses a store with nobody", () => {
    const body = squash(functionOf(migration));
    expect(body).toContain("v_owner := v_brand.created_by; IF v_owner IS NULL THEN");
    expect(body).toContain(
      "IF v_owner IS NULL THEN RAISE EXCEPTION 'BRAND_OWNER_NOT_FOUND'; END IF;",
    );
  });
});

describe("who the owner is, in a real Postgres", () => {
  const STORE = "00000000-0000-4000-8000-0000000000a1";
  const OTHER = "00000000-0000-4000-8000-0000000000a2";
  const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  let db: PGlite;

  const ownerOf = async (brand: string) => {
    const sql = newLookup().replace("INTO v_owner ", "").replace("v_brand.id", "$1");
    const { rows } = await db.query<{ id: string }>(sql, [brand]);
    return rows[0]?.id ?? null;
  };
  const staff = (rows: Array<[number, string, string, string, string?]>) =>
    db.exec(
      `TRUNCATE public.profiles; INSERT INTO public.profiles (id, brand_id, role, created_at, status) VALUES ${rows
        .map(
          ([n, brand, role, at, status]) =>
            `('${id(n)}', '${brand}', '${role}', '${at}', '${status ?? "active"}')`,
        )
        .join(", ")};`,
    );

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE TABLE public.profiles (
      id uuid PRIMARY KEY, brand_id uuid, role text, status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL
    );`);
  });

  it("the store's longest-standing member, ahead of a platform account that came first", async () => {
    await staff([
      [1, STORE, "super_admin", "2026-07-10"],
      [2, STORE, "admin", "2026-07-19"],
      [3, STORE, "brand_admin", "2026-09-09"],
    ]);
    expect(await ownerOf(STORE)).toBe(id(2));
  });

  it("a platform account when it is the only one the store has", async () => {
    await staff([[1, STORE, "super_admin", "2026-07-10"]]);
    expect(await ownerOf(STORE)).toBe(id(1));
  });

  it("never a courier, a member who is not active, or another store's staff", async () => {
    await staff([
      [1, STORE, "courier", "2026-01-01"],
      [2, STORE, "brand_admin", "2026-02-01", "suspended"],
      [3, OTHER, "brand_admin", "2026-03-01"],
      [4, STORE, "brand_admin", "2026-04-01"],
    ]);
    expect(await ownerOf(STORE)).toBe(id(4));
  });

  it("nobody for a store with no staff, so the order is refused with a clear error", async () => {
    await staff([[3, OTHER, "brand_admin", "2026-03-01"]]);
    expect(await ownerOf(STORE)).toBeNull();
  });
});
