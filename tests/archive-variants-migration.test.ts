import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import keepOne from "../supabase/migrations/20261110100000_product_keeps_a_variant.sql?raw";
import migration from "../supabase/migrations/20261111100000_archive_variants_with_history.sql?raw";
import previous from "../supabase/migrations/20261028140000_store_seo.sql?raw";
import saleBefore from "../supabase/migrations/20261025100000_category_counts_and_support_optin.sql?raw";

// A size with history is archived, never deleted (migration 20261111100000), in a real Postgres
// (PGlite): `remove_product_variants` deletes a size with no history and archives one with a
// history, a direct delete of one is refused, a size with pieces is in use again, and a shopper
// never sees or orders an archived size.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-00000000b000";
let db: PGlite;
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

const product = async (itemKind = "product") => {
  const id = uuid();
  await db.query("INSERT INTO public.products (id, brand_id, item_kind) VALUES ($1, $2, $3)", [
    id,
    BRAND,
    itemKind,
  ]);
  return id;
};
const addVariant = async (productId: string, size: string | null, stock = 0) => {
  const id = uuid();
  await db.query(
    `INSERT INTO public.product_variants (id, brand_id, product_id, size, barcode, stock_main)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, BRAND, productId, size, `B-${id.slice(-4)}`, stock],
  );
  return id;
};
/** A sale of this size: an order line, as the order builder writes one. */
const sell = async (variantId: string, productId: string, channel = "admin") => {
  const order = uuid();
  await db.query("INSERT INTO public.orders (id, channel) VALUES ($1, $2)", [order, channel]);
  await db.query(
    "INSERT INTO public.order_items (order_id, product_id, variant_id) VALUES ($1, $2, $3)",
    [order, productId, variantId],
  );
};
const remove = async (ids: string[]) =>
  (
    await db.query<{ r: { deleted: number; archived: number } }>(
      "SELECT public.remove_product_variants($1::uuid[]) AS r",
      [ids],
    )
  ).rows[0].r;
const variant = async (id: string) =>
  (
    await db.query<{ archived: boolean; barcode: string | null }>(
      "SELECT archived_at IS NOT NULL AS archived, barcode FROM public.product_variants WHERE id = $1",
      [id],
    )
  ).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE TABLE public.app_settings (staff boolean NOT NULL DEFAULT true, inventory boolean NOT NULL DEFAULT true);
    INSERT INTO public.app_settings DEFAULT VALUES;
    CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql
      AS 'SELECT staff FROM public.app_settings';
    CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql
      AS 'SELECT inventory FROM public.app_settings';
    CREATE TABLE public.products (
      id uuid PRIMARY KEY, brand_id uuid, is_active boolean NOT NULL DEFAULT true,
      item_kind text NOT NULL DEFAULT 'product'
    );
    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid,
      product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      size text, barcode text, stock_main integer DEFAULT 0, stock_incubator integer DEFAULT 0
    );
    CREATE TABLE public.orders (id uuid PRIMARY KEY, channel text);
    CREATE TABLE public.order_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, product_id uuid,
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL
    );
    CREATE TABLE public.inventory_movements (
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE
    );
    CREATE TABLE public.purchase_order_items (variant_id uuid);
    CREATE TABLE public.purchase_order_receipts (variant_id uuid);
    CREATE TABLE public.return_items (variant_id uuid, replacement_variant_id uuid);
    CREATE TABLE public.booking_items (variant_id uuid);
    CREATE TABLE public.incubator_movements (variant_id uuid);
    CREATE TABLE public.incubator_sales (variant_id uuid);
    GRANT SELECT ON public.products, public.product_variants TO anon;
  `);
  await db.exec(keepOne);
  // The home page function names tables this test does not build; it is compared as text below.
  await db.exec("SET check_function_bodies = off");
  await db.exec(migration);
  await db.exec("ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY");
});

beforeEach(async () => {
  await db.query("UPDATE public.app_settings SET staff = true, inventory = true");
});

describe("removing a size from the inventory", () => {
  it("deletes a size with no history", async () => {
    const id = await product();
    await addVariant(id, "52");
    const unused = await addVariant(id, "54");
    expect(await remove([unused])).toEqual({ deleted: 1, archived: 0 });
    expect(await variant(unused)).toBeUndefined();
  });

  it("archives a size that sold, keeping its order line, and frees its barcode", async () => {
    const id = await product();
    await addVariant(id, "52");
    const sold = await addVariant(id, "54");
    await sell(sold, id);
    expect(await remove([sold])).toEqual({ deleted: 0, archived: 1 });
    expect(await variant(sold)).toEqual({ archived: true, barcode: null });
    const line = await db.query<{ variant_id: string }>(
      "SELECT variant_id FROM public.order_items WHERE variant_id = $1",
      [sold],
    );
    expect(line.rows).toHaveLength(1);
  });

  it("archives a size with stock history and keeps the ledger", async () => {
    const id = await product();
    await addVariant(id, "52");
    const moved = await addVariant(id, "54");
    await db.query("INSERT INTO public.inventory_movements (variant_id) VALUES ($1)", [moved]);
    expect(await remove([moved])).toEqual({ deleted: 0, archived: 1 });
    const ledger = await db.query(
      "SELECT 1 FROM public.inventory_movements WHERE variant_id = $1",
      [moved],
    );
    expect(ledger.rows).toHaveLength(1);
  });

  it("asks for a size's pieces to be recorded first", async () => {
    const id = await product();
    await addVariant(id, "52");
    const stocked = await addVariant(id, "54", 2);
    await expect(remove([stocked])).rejects.toThrow("VARIANT_HAS_STOCK");
  });

  it("keeps a product a size in use, archived ones not counting", async () => {
    const id = await product();
    const a = await addVariant(id, "52");
    const b = await addVariant(id, "54");
    await sell(a, id);
    await expect(remove([a, b])).rejects.toThrow("PRODUCT_NEEDS_A_VARIANT");
    await remove([a]);
    // Only an archived size would be left: the last size in use stays, by either path.
    await expect(remove([b])).rejects.toThrow("PRODUCT_NEEDS_A_VARIANT");
    await expect(
      db.query("DELETE FROM public.product_variants WHERE id = $1", [b]),
    ).rejects.toThrow("PRODUCT_NEEDS_A_VARIANT");
  });

  it("is for staff who may change the inventory", async () => {
    const id = await product();
    await addVariant(id, "52");
    const other = await addVariant(id, "54");
    await db.query("UPDATE public.app_settings SET inventory = false");
    await expect(remove([other])).rejects.toThrow("NOT_AUTHORIZED");
    await db.query("UPDATE public.app_settings SET inventory = true, staff = false");
    await expect(remove([other])).rejects.toThrow("NOT_AUTHORIZED");
  });
});

describe("a direct delete", () => {
  it("is refused for a size with history", async () => {
    const id = await product();
    await addVariant(id, "52");
    const sold = await addVariant(id, "54");
    await sell(sold, id);
    await expect(
      db.query("DELETE FROM public.product_variants WHERE id = $1", [sold]),
    ).rejects.toThrow("VARIANT_HAS_HISTORY");
  });

  it("still goes through for a size with none, a deleted product and a service", async () => {
    const id = await product();
    await addVariant(id, "52");
    const unused = await addVariant(id, "54");
    await db.query("DELETE FROM public.product_variants WHERE id = $1", [unused]);

    const gone = await product();
    const sold = await addVariant(gone, "52");
    await sell(sold, gone);
    await db.query("DELETE FROM public.products WHERE id = $1", [gone]);
    expect(await variant(sold)).toBeUndefined();

    const service = await product("service");
    const length = await addVariant(service, "3 hours");
    await sell(length, service);
    await db.query("DELETE FROM public.product_variants WHERE id = $1", [length]);
    expect(await variant(length)).toBeUndefined();
  });
});

describe("an archived size", () => {
  it("is in use again once it has pieces", async () => {
    const id = await product();
    await addVariant(id, "52");
    const sold = await addVariant(id, "54");
    await sell(sold, id);
    await remove([sold]);
    // A cancelled order gives its piece back.
    await db.query("UPDATE public.product_variants SET stock_main = 1 WHERE id = $1", [sold]);
    expect((await variant(sold)).archived).toBe(false);
  });

  it("cannot be ordered on the storefront, while staff orders go on", async () => {
    const id = await product();
    await addVariant(id, "52");
    const sold = await addVariant(id, "54");
    await sell(sold, id);
    await remove([sold]);
    await expect(sell(sold, id, "storefront")).rejects.toThrow(`PRODUCT_UNAVAILABLE:${id}`);
    await sell(sold, id, "admin");
  });

  it("is not read by a visitor", async () => {
    const id = await product();
    const kept = await addVariant(id, "52");
    const sold = await addVariant(id, "54");
    await sell(sold, id);
    await remove([sold]);
    await db.exec("SET ROLE anon");
    const seen = await db.query<{ id: string }>(
      "SELECT id FROM public.product_variants WHERE product_id = $1",
      [id],
    );
    await db.exec("RESET ROLE");
    expect(seen.rows.map((row) => row.id)).toEqual([kept]);
  });

  it("only some functions are the browser's to call", async () => {
    const can = async (fn: string) =>
      (
        await db.query<{ ok: boolean }>(
          `SELECT has_function_privilege('authenticated', '${fn}', 'EXECUTE') AS ok`,
        )
      ).rows[0].ok;
    expect(await can("public.remove_product_variants(uuid[])")).toBe(true);
    expect(await can("public.variant_has_history(uuid)")).toBe(false);
    expect(await can("public.variant_delete_keeps_history()")).toBe(false);
    expect(await can("public.refuse_storefront_line_archived_variant()")).toBe(false);
  });
});

/** The home page function's body, its whitespace and comments folded. */
const pageData = (sql: string) => {
  const start = sql.indexOf("FUNCTION public.get_storefront_page_data(");
  const open = sql.indexOf("$function$", start);
  const close = sql.indexOf("$function$", open + 1);
  return sql
    .slice(open, close)
    .replace(/--[^\n]*\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
};

describe("the home page's products", () => {
  it("carry their sizes in use only, and are otherwise built exactly as before", () => {
    const now = pageData(migration);
    expect(now).toContain("WHERE pv.product_id = p.id AND pv.archived_at IS NULL");
    expect(now.replace(" AND pv.archived_at IS NULL", "")).toBe(pageData(previous));
    expect(migration).toMatch(/STABLE SECURITY DEFINER/);
  });
});

/** The sale rule's body (dollar-quoted with $$), its whitespace folded. */
const saleRule = (sql: string) => {
  const start = sql.indexOf("FUNCTION public.category_product_on_sale(");
  const open = sql.indexOf("$$", start);
  const close = sql.indexOf("$$", open + 2);
  return sql.slice(open, close).replace(/\s+/g, " ").trim();
};

describe("the sale collection", () => {
  it("reads sizes in use only, and is otherwise the rule it was", () => {
    const now = saleRule(migration);
    expect(now).toContain("JOIN p ON p.id = pv.product_id WHERE pv.archived_at IS NULL");
    expect(now.replace(" WHERE pv.archived_at IS NULL", "")).toBe(saleRule(saleBefore));
  });
});
