import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261213100000_product_codes.sql?raw";

// Product codes (migration 20261213100000; the owner's request of 2026-11-18): a store numbers
// its sizes' codes, a code is unique within the store, a new size takes the next number, and
// many codes are written at once. Run in a real Postgres (PGlite).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PURA = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000aa";

let db: PGlite;
let product: string;
let lulwa: string;

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
  CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT current_setting('app.brand', true) = b::text $$;
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT current_setting('app.permission', true) = p $$;
  CREATE TABLE public.brands (id uuid PRIMARY KEY);
  INSERT INTO public.brands VALUES ('${PURA}'), ('${OTHER}');
  CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL);
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid REFERENCES public.products(id),
    brand_id uuid, user_id uuid, sku text, barcode text, archived_at timestamptz
  );
  CREATE UNIQUE INDEX product_variants_user_barcode_uniq ON public.product_variants (user_id, barcode)
    WHERE barcode IS NOT NULL;
  CREATE TABLE public.incubator_inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, incubator_id uuid NOT NULL,
    variant_id uuid NOT NULL, external_code text, quantity integer NOT NULL DEFAULT 0
  );
`;

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
const asStaff = (brand = PURA, permission = "manage_inventory") =>
  db.exec(
    `SET app.uid = '${STAFF}'; SET app.brand = '${brand}'; SET app.permission = '${permission}'`,
  );
const size = async (sku: string | null, brand = PURA) =>
  await one<{ id: string; sku: string | null }>(
    "INSERT INTO public.product_variants (product_id, brand_id, user_id, sku) VALUES ($1, $2, $3, $4) RETURNING id, sku",
    [product, brand, STAFF, sku],
  );
const codeOf = async (id: string) =>
  (await one<{ sku: string | null }>("SELECT sku FROM public.product_variants WHERE id = $1", [id]))
    .sku;
const assign = (items: unknown[], fill = false) =>
  one<{ r: { codes: number; barcodes: number; partner_codes: number } }>(
    "SELECT public.assign_variant_codes($1::jsonb, $2) AS r",
    [JSON.stringify(items), fill],
  ).then((row) => row.r);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  product = (
    await one<{ id: string }>("INSERT INTO public.products (brand_id) VALUES ($1) RETURNING id", [
      PURA,
    ])
  ).id;
  // Before the migration: Pura's own 40xx codes, odd older ones, and a partner's codes.
  await size("4035");
  await size("S77-كحلي-50");
  lulwa = "00000000-0000-4000-8000-0000000000c1";
  const atLulwa = await size(null);
  await db.query(
    "INSERT INTO public.incubator_inventory (brand_id, incubator_id, variant_id, external_code, quantity) VALUES ($1, $2, $3, '4048', 1)",
    [PURA, lulwa, atLulwa.id],
  );
  await db.exec(migration);
});

describe("a new size", () => {
  it("takes the store's next number, after the highest it uses as its own or a partner's code", async () => {
    const fresh = await size(null);
    expect(fresh.sku).toBe("4049");
    expect((await size("")).sku).toBe("4050");
    // Another store counts on its own.
    expect((await size(null, OTHER)).sku).toBe("1");
  });

  it("keeps a code it was given", async () => {
    expect((await size("PL1-BLK")).sku).toBe("PL1-BLK");
  });
});

describe("a code", () => {
  it("is unique within the store however it is spelt, never across stores or for an archived size", async () => {
    await expect(size(" pl1-blk ")).rejects.toThrow(/product_variants_brand_code_uniq/);
    expect((await size("PL1-BLK", OTHER)).sku).toBe("PL1-BLK");
    const old = await size("ARCH-1");
    await db.query("UPDATE public.product_variants SET archived_at = now() WHERE id = $1", [
      old.id,
    ]);
    expect((await size("ARCH-1")).sku).toBe("ARCH-1");
  });
});

describe("numbering many sizes at once", () => {
  it("writes codes and missing barcodes, then gives partner pieces with no code the store's code", async () => {
    await asStaff();
    const a = await size("TEMP-A");
    const b = await size("TEMP-B");
    await db.query("UPDATE public.product_variants SET sku = NULL WHERE id IN ($1, $2)", [
      a.id,
      b.id,
    ]);
    await db.query(
      "INSERT INTO public.incubator_inventory (brand_id, incubator_id, variant_id, quantity) VALUES ($1, $2, $3, 1)",
      [PURA, lulwa, a.id],
    );
    const done = await assign(
      [
        { variant_id: a.id, sku: "4060", barcode: "2912345678901" },
        { variant_id: b.id, sku: " 4061 " },
      ],
      true,
    );
    expect(done).toEqual({ codes: 2, barcodes: 1, partner_codes: 1 });
    expect(await codeOf(b.id)).toBe("4061");
    const partner = await one<{ external_code: string }>(
      "SELECT external_code FROM public.incubator_inventory WHERE variant_id = $1",
      [a.id],
    );
    expect(partner.external_code).toBe("4060");
    // The next number moves past what was written.
    expect((await size(null)).sku).toBe("4062");
  });

  it("refuses a code already used and writes nothing of the batch", async () => {
    await asStaff();
    const a = await size("KEEP-A");
    const b = await size("KEEP-B");
    await expect(
      assign([
        { variant_id: a.id, sku: "9001" },
        { variant_id: b.id, sku: "4035" },
      ]),
    ).rejects.toThrow(`CODE_TAKEN:${b.id}`);
    expect(await codeOf(a.id)).toBe("KEEP-A");
  });

  it("refuses an unreadable code, and a caller who may not manage stock", async () => {
    await asStaff();
    const a = await size("X-1");
    await expect(assign([{ variant_id: a.id, sku: "كحلي" }])).rejects.toThrow(
      `INVALID_CODE:${a.id}`,
    );
    await asStaff(PURA, "manage_orders");
    await expect(assign([{ variant_id: a.id, sku: "4100" }])).rejects.toThrow("NOT_AUTHORIZED");
    await asStaff(OTHER);
    await expect(assign([{ variant_id: a.id, sku: "4100" }])).rejects.toThrow("NOT_AUTHORIZED");
  });

  it("says the next number before anything is written", async () => {
    await asStaff();
    const next = await one<{ r: { prefix: string; next_number: number } }>(
      "SELECT public.next_variant_code_number($1) AS r",
      [PURA],
    );
    expect(next.r.prefix).toBe("");
    expect(next.r.next_number).toBeGreaterThan(4061);
  });
});

describe("what a browser may do", () => {
  it("writes codes through the function, never the helpers or the numbering", async () => {
    const may = async (sql: string) => (await one<{ ok: boolean }>(`SELECT ${sql} AS ok`)).ok;
    expect(
      await may(
        "has_function_privilege('authenticated', 'public.take_variant_code(uuid)', 'EXECUTE')",
      ),
    ).toBe(false);
    expect(
      await may(
        "has_function_privilege('authenticated', 'public.assign_variant_codes(jsonb, boolean)', 'EXECUTE')",
      ),
    ).toBe(true);
    expect(
      await may(
        "has_function_privilege('anon', 'public.assign_variant_codes(jsonb, boolean)', 'EXECUTE')",
      ),
    ).toBe(false);
    expect(
      await may("has_table_privilege('authenticated', 'public.brand_code_numbering', 'UPDATE')"),
    ).toBe(false);
  });
});
