import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import keepOne from "../supabase/migrations/20261110100000_product_keeps_a_variant.sql?raw";
import archiveSizes from "../supabase/migrations/20261111100000_archive_variants_with_history.sql?raw";
import migration from "../supabase/migrations/20261112100000_archive_products_with_history.sql?raw";
import restoreSize from "../supabase/migrations/20261114100000_restore_product_variant.sql?raw";

// A product with history is archived, never deleted (migration 20261112100000), in a real
// Postgres (PGlite): `remove_products` deletes a product with no history and archives one with a
// history, a member of staff cannot delete one directly, an archived product stays hidden until
// restored, pieces coming back bring it back, and a shopper cannot order it.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-00000000b000";
let db: PGlite;
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

const product = async (itemKind = "product") => {
  const id = uuid();
  await db.query(
    "INSERT INTO public.products (id, brand_id, item_kind, is_active) VALUES ($1, $2, $3, true)",
    [id, BRAND, itemKind],
  );
  return id;
};
const addVariant = async (productId: string, size: string | null, stock = 0) => {
  const id = uuid();
  await db.query(
    `INSERT INTO public.product_variants (id, brand_id, product_id, size, stock_main)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, BRAND, productId, size, stock],
  );
  return id;
};
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
    await db.query<{ r: { deleted: string[]; archived: string[] } }>(
      "SELECT public.remove_products($1::uuid[]) AS r",
      [ids],
    )
  ).rows[0].r;
const state = async (id: string) =>
  (
    await db.query<{ archived: boolean; is_active: boolean }>(
      "SELECT archived_at IS NOT NULL AS archived, is_active FROM public.products WHERE id = $1",
      [id],
    )
  ).rows[0];
/** Runs as a member of staff acting through the API. */
const asStaff = async <T>(run: () => Promise<T>) => {
  await db.exec("SET ROLE authenticated");
  try {
    return await run();
  } finally {
    await db.exec("RESET ROLE");
  }
};

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
      item_kind text NOT NULL DEFAULT 'product',
      auto_deactivated_out_of_stock boolean NOT NULL DEFAULT false
    );
    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid,
      product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      size text, barcode text, stock_main integer DEFAULT 0, stock_incubator integer DEFAULT 0
    );
    CREATE TABLE public.orders (id uuid PRIMARY KEY, channel text);
    CREATE TABLE public.order_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid,
      product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL
    );
    CREATE TABLE public.inventory_movements (
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE
    );
    CREATE TABLE public.purchase_order_items (
      product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL
    );
    CREATE TABLE public.purchase_order_receipts (variant_id uuid);
    CREATE TABLE public.return_items (
      product_id uuid, replacement_product_id uuid, variant_id uuid, replacement_variant_id uuid
    );
    CREATE TABLE public.booking_items (product_id uuid, variant_id uuid);
    CREATE TABLE public.incubator_movements (variant_id uuid);
    CREATE TABLE public.incubator_sales (variant_id uuid);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
  `);
  await db.exec(keepOne);
  // The home page function names tables this test does not build.
  await db.exec("SET check_function_bodies = off");
  await db.exec(archiveSizes);
  await db.exec(migration);
  await db.exec(restoreSize);
});

beforeEach(async () => {
  await db.query("UPDATE public.app_settings SET staff = true, inventory = true");
});

describe("removing a product from the inventory", () => {
  it("deletes a product with no history, sizes and all", async () => {
    const id = await product();
    await addVariant(id, "52");
    expect(await remove([id])).toEqual({ deleted: [id], archived: [] });
    expect(await state(id)).toBeUndefined();
  });

  it("archives a product that sold, keeping it and its order line, hidden", async () => {
    const id = await product();
    const v = await addVariant(id, "52");
    await sell(v, id);
    expect(await remove([id])).toEqual({ deleted: [], archived: [id] });
    expect(await state(id)).toEqual({ archived: true, is_active: false });
    const line = await db.query("SELECT 1 FROM public.order_items WHERE product_id = $1", [id]);
    expect(line.rows).toHaveLength(1);
  });

  it("archives a product received from a supplier and counted out again", async () => {
    // Pura's case: pieces received (a supplier line, ledger rows), then counted back to zero.
    const id = await product();
    const v = await addVariant(id, "56");
    await db.query("INSERT INTO public.inventory_movements (variant_id) VALUES ($1)", [v]);
    await db.query(
      "INSERT INTO public.purchase_order_items (product_id, variant_id) VALUES ($1, $2)",
      [id, v],
    );
    expect(await remove([id])).toEqual({ deleted: [], archived: [id] });
  });

  it("asks for the pieces to be recorded first", async () => {
    const id = await product();
    await addVariant(id, "52", 3);
    await expect(remove([id])).rejects.toThrow("PRODUCT_HAS_STOCK");
  });

  it("is for staff who may change the inventory", async () => {
    const id = await product();
    await addVariant(id, "52");
    await db.query("UPDATE public.app_settings SET inventory = false");
    await expect(remove([id])).rejects.toThrow("NOT_AUTHORIZED");
  });
});

describe("a member of staff acting directly", () => {
  it("cannot delete a product with history, and can delete one with none", async () => {
    const sold = await product();
    const v = await addVariant(sold, "52");
    await sell(v, sold);
    await expect(
      asStaff(() => db.query("DELETE FROM public.products WHERE id = $1", [sold])),
    ).rejects.toThrow("PRODUCT_HAS_HISTORY");

    const fresh = await product();
    await addVariant(fresh, "52");
    await asStaff(() => db.query("DELETE FROM public.products WHERE id = $1", [fresh]));
    expect(await state(fresh)).toBeUndefined();
  });

  it("cannot archive by hand, nor show an archived product", async () => {
    const id = await product();
    await expect(
      asStaff(() => db.query("UPDATE public.products SET archived_at = now() WHERE id = $1", [id])),
    ).rejects.toThrow("PRODUCT_ARCHIVE_IS_THE_DATABASES");

    const v = await addVariant(id, "52");
    await sell(v, id);
    await remove([id]);
    await asStaff(() =>
      db.query("UPDATE public.products SET is_active = true WHERE id = $1", [id]),
    );
    expect(await state(id)).toEqual({ archived: true, is_active: false });
  });
});

describe("an archived product", () => {
  const archived = async () => {
    const id = await product();
    const v = await addVariant(id, "52");
    await sell(v, id);
    await remove([id]);
    return { id, v };
  };

  it("comes back with restore, still hidden until shown", async () => {
    const { id } = await archived();
    await db.query("SELECT public.restore_product($1)", [id]);
    expect(await state(id)).toEqual({ archived: false, is_active: false });
  });

  it("comes back when pieces return to one of its sizes", async () => {
    const { id, v } = await archived();
    await db.query("UPDATE public.product_variants SET stock_main = 1 WHERE id = $1", [v]);
    expect(await state(id)).toEqual({ archived: false, is_active: false });
  });

  it("cannot be ordered on the storefront, while staff orders go on", async () => {
    const { id, v } = await archived();
    await expect(sell(v, id, "storefront")).rejects.toThrow(`PRODUCT_UNAVAILABLE:${id}`);
    await sell(v, id, "admin");
  });

  it("answers no history for a store the caller does not work in", async () => {
    const { id } = await archived();
    await db.query("UPDATE public.app_settings SET staff = false");
    const r = await db.query<{ h: boolean }>("SELECT public.product_has_history($1) AS h", [id]);
    expect(r.rows[0].h).toBe(false);
  });

  it("only the right functions are the browser's to call", async () => {
    const can = async (fn: string) =>
      (
        await db.query<{ ok: boolean }>(
          `SELECT has_function_privilege('authenticated', '${fn}', 'EXECUTE') AS ok`,
        )
      ).rows[0].ok;
    expect(await can("public.remove_products(uuid[])")).toBe(true);
    expect(await can("public.restore_product(uuid)")).toBe(true);
    expect(await can("public.product_has_history(uuid)")).toBe(true);
    expect(await can("public.product_delete_keeps_history()")).toBe(false);
    expect(await can("public.products_archive_rules()")).toBe(false);
    expect(await can("public.variant_with_pieces_is_in_use()")).toBe(false);
  });
});

describe("bringing an archived size back (migration 20261114100000)", () => {
  const archived = async (table: "products" | "product_variants", id: string) =>
    (
      await db.query<{ archived: boolean }>(
        `SELECT archived_at IS NOT NULL AS archived FROM public.${table} WHERE id = $1`,
        [id],
      )
    ).rows[0].archived;
  const restore = (id: string) =>
    asStaff(() => db.query("SELECT public.restore_product_variant($1)", [id]));
  const removeSizes = (ids: string[]) =>
    asStaff(() => db.query("SELECT public.remove_product_variants($1::uuid[])", [ids]));

  it("puts a size that sold back in use, with its history", async () => {
    const id = await product();
    await addVariant(id, "52");
    const old = await addVariant(id, "54");
    await sell(old, id);
    await removeSizes([old]);
    expect(await archived("product_variants", old)).toBe(true);
    await restore(old);
    expect(await archived("product_variants", old)).toBe(false);
    const line = await db.query("SELECT 1 FROM public.order_items WHERE variant_id = $1", [old]);
    expect(line.rows).toHaveLength(1);
  });

  it("brings its archived product back too, still hidden from the store", async () => {
    const id = await product();
    const v = await addVariant(id, "52");
    await sell(v, id);
    await remove([id]);
    await db.query("UPDATE public.product_variants SET archived_at = now() WHERE id = $1", [v]);
    await restore(v);
    expect(await archived("products", id)).toBe(false);
    expect(await state(id)).toEqual({ archived: false, is_active: false });
  });

  it("is for staff who manage the stock", async () => {
    const id = await product();
    const v = await addVariant(id, "52");
    await db.query("UPDATE public.app_settings SET inventory = false");
    await expect(restore(v)).rejects.toThrow("NOT_AUTHORIZED");
    await expect(restore(uuid())).rejects.toThrow("VARIANT_NOT_FOUND");
  });
});
