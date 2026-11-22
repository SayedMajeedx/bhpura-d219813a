import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import keepOne from "../supabase/migrations/20261110100000_product_keeps_a_variant.sql?raw";
import archiveSizes from "../supabase/migrations/20261111100000_archive_variants_with_history.sql?raw";
import archiveProducts from "../supabase/migrations/20261112100000_archive_products_with_history.sql?raw";
import oldPurge from "../supabase/migrations/20260810223000_delete_orphaned_auth_users.sql?raw";
import migration from "../supabase/migrations/20261217100000_brand_purge_parents_first.sql?raw";

// Deleting a store with all its data (migration 20261217100000), in a real Postgres (PGlite) with
// the real rules that keep a size's, a product's and an order line's history: the super admin's
// "delete everything" stopped with VARIANT_HAS_HISTORY on ZH Abayas (2026-11-22), because the
// purge deleted the sizes before their products. It now deletes parents first, and the rules
// still hold for a member of staff.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

// The alteration rule as it is live (migration 20261117100000).
const ALTERATION_RULE = `
  CREATE FUNCTION public.order_items_keep_alteration_lines() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $f$
  BEGIN
    IF EXISTS (
         SELECT 1 FROM public.order_alterations
          WHERE (source_item_id = OLD.id OR charge_item_id = OLD.id) AND status <> 'cancelled')
       AND EXISTS (SELECT 1 FROM public.orders WHERE id = OLD.order_id) THEN
      RAISE EXCEPTION 'ORDER_LINE_HAS_ALTERATION' USING ERRCODE = '23503';
    END IF;
    RETURN OLD;
  END;
  $f$;
  CREATE TRIGGER trg_order_items_keep_alteration_lines BEFORE DELETE ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION public.order_items_keep_alteration_lines();
`;

/** A store with a product sold once, its ledger, and optionally an alteration and a partner. */
async function seedStore(options: { alteration?: boolean; partner?: boolean } = {}) {
  const brand = uuid();
  const owner = uuid();
  const product = uuid();
  const variant = uuid();
  const order = uuid();
  const line = uuid();
  await db.query("INSERT INTO public.brands (id, slug) VALUES ($1, $2)", [brand, `s${counter}`]);
  await db.query("INSERT INTO auth.users (id) VALUES ($1)", [owner]);
  await db.query("INSERT INTO public.profiles (id, brand_id, role) VALUES ($1, $2, 'admin')", [
    owner,
    brand,
  ]);
  await db.query("INSERT INTO public.products (id, brand_id) VALUES ($1, $2)", [product, brand]);
  await db.query(
    "INSERT INTO public.product_variants (id, brand_id, product_id, size) VALUES ($1, $2, $3, '54')",
    [variant, brand, product],
  );
  await db.query("INSERT INTO public.inventory_movements (brand_id, variant_id) VALUES ($1, $2)", [
    brand,
    variant,
  ]);
  await db.query("INSERT INTO public.orders (id, brand_id) VALUES ($1, $2)", [order, brand]);
  await db.query(
    `INSERT INTO public.order_items (id, brand_id, order_id, product_id, variant_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [line, brand, order, product, variant],
  );
  if (options.alteration) {
    await db.query(
      `INSERT INTO public.order_alterations (brand_id, source_item_id, status)
       VALUES ($1, $2, 'at_workshop')`,
      [brand, line],
    );
  }
  if (options.partner) {
    const partner = uuid();
    const other = uuid();
    const sale = uuid();
    const payment = uuid();
    const transfer = uuid();
    await db.query("INSERT INTO public.incubators (id, brand_id) VALUES ($1, $2), ($3, $2)", [
      partner,
      brand,
      other,
    ]);
    await db.query(
      "INSERT INTO public.incubator_inventory (brand_id, incubator_id, variant_id) VALUES ($1, $2, $3)",
      [brand, partner, variant],
    );
    await db.query(
      "INSERT INTO public.incubator_movements (brand_id, incubator_id, variant_id) VALUES ($1, $2, $3)",
      [brand, partner, variant],
    );
    await db.query(
      "INSERT INTO public.incubator_sales (id, brand_id, incubator_id, variant_id) VALUES ($1, $2, $3, $4)",
      [sale, brand, partner, variant],
    );
    await db.query(
      "INSERT INTO public.incubator_payments (id, brand_id, incubator_id) VALUES ($1, $2, $3)",
      [payment, brand, partner],
    );
    await db.query(
      "INSERT INTO public.incubator_payment_allocations (payment_id, sale_id) VALUES ($1, $2)",
      [payment, sale],
    );
    await db.query(
      `INSERT INTO public.incubator_transfers (id, brand_id, from_incubator_id, to_incubator_id)
       VALUES ($1, $2, $3, $4)`,
      [transfer, brand, partner, other],
    );
    await db.query(
      `INSERT INTO public.incubator_transfer_items (brand_id, transfer_id, variant_id)
       VALUES ($1, $2, $3)`,
      [brand, transfer, variant],
    );
  }
  return { brand, owner, product, variant, line };
}

/** The super admin's call, through the API (the function runs as its owner). */
const purge = async (brand: string) => {
  await db.exec("SET ROLE authenticated");
  try {
    return (
      await db.query<{ r: { deleted: boolean; mode: string } }>(
        "SELECT public.delete_brand($1, true) AS r",
        [brand],
      )
    ).rows[0].r;
  } finally {
    await db.exec("RESET ROLE");
  }
};

const BRAND_TABLES = [
  "brands",
  "products",
  "product_variants",
  "orders",
  "order_items",
  "order_alterations",
  "inventory_movements",
  "incubators",
  "incubator_inventory",
  "incubator_movements",
  "incubator_sales",
  "incubator_payments",
  "incubator_transfers",
  "incubator_transfer_items",
];
/** How many rows of the store are left in each table that has any. */
async function leftOf(brand: string) {
  const left: Record<string, number> = {};
  for (const table of BRAND_TABLES) {
    const column = table === "brands" ? "id" : "brand_id";
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.${table} WHERE ${column} = $1`,
      [brand],
    );
    if (rows[0].n > 0) left[table] = rows[0].n;
  }
  const allocations = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM public.incubator_payment_allocations",
  );
  if (allocations.rows[0].n > 0) left.incubator_payment_allocations = allocations.rows[0].n;
  return left;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.app_settings (staff boolean NOT NULL DEFAULT true, inventory boolean NOT NULL DEFAULT true);
    INSERT INTO public.app_settings DEFAULT VALUES;
    CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql
      AS 'SELECT staff FROM public.app_settings';
    CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql
      AS 'SELECT inventory FROM public.app_settings';
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, is_active boolean DEFAULT true);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, brand_id uuid, role text);
    CREATE TABLE public.customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, auth_user_id uuid);
    CREATE TABLE public.customer_addresses (brand_id uuid);
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
    CREATE TABLE public.orders (id uuid PRIMARY KEY, brand_id uuid, channel text);
    CREATE TABLE public.order_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid,
      order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
      product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL
    );
    CREATE TABLE public.order_alterations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid,
      source_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
      charge_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
      status text NOT NULL
    );
    CREATE TABLE public.inventory_movements (
      brand_id uuid, variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE
    );
    CREATE TABLE public.purchase_order_items (product_id uuid, variant_id uuid);
    CREATE TABLE public.purchase_order_receipts (variant_id uuid);
    CREATE TABLE public.return_items (
      product_id uuid, replacement_product_id uuid, variant_id uuid, replacement_variant_id uuid
    );
    CREATE TABLE public.booking_items (product_id uuid, variant_id uuid);
    -- A partner's rows hold the store's sizes and the partner, as live (ON DELETE RESTRICT).
    CREATE TABLE public.incubators (id uuid PRIMARY KEY, brand_id uuid);
    CREATE TABLE public.incubator_inventory (
      brand_id uuid,
      incubator_id uuid REFERENCES public.incubators(id) ON DELETE RESTRICT,
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT
    );
    CREATE TABLE public.incubator_movements (
      brand_id uuid,
      incubator_id uuid REFERENCES public.incubators(id) ON DELETE RESTRICT,
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT
    );
    CREATE TABLE public.incubator_sales (
      id uuid PRIMARY KEY, brand_id uuid,
      incubator_id uuid REFERENCES public.incubators(id) ON DELETE RESTRICT,
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT
    );
    CREATE TABLE public.incubator_payments (
      id uuid PRIMARY KEY, brand_id uuid,
      incubator_id uuid REFERENCES public.incubators(id) ON DELETE RESTRICT
    );
    CREATE TABLE public.incubator_payment_allocations (
      payment_id uuid REFERENCES public.incubator_payments(id) ON DELETE RESTRICT,
      sale_id uuid REFERENCES public.incubator_sales(id) ON DELETE RESTRICT
    );
    CREATE TABLE public.incubator_transfers (
      id uuid PRIMARY KEY, brand_id uuid,
      from_incubator_id uuid REFERENCES public.incubators(id) ON DELETE RESTRICT,
      to_incubator_id uuid REFERENCES public.incubators(id) ON DELETE RESTRICT
    );
    CREATE TABLE public.incubator_transfer_items (
      brand_id uuid,
      transfer_id uuid REFERENCES public.incubator_transfers(id) ON DELETE CASCADE,
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT
    );
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
  `);
  await db.exec(keepOne);
  // The home page function in these migrations names tables this test does not build.
  await db.exec("SET check_function_bodies = off");
  await db.exec(archiveSizes);
  await db.exec(archiveProducts);
  await db.exec(ALTERATION_RULE);
  await db.exec(oldPurge);
});

describe("deleting a store with all its data", () => {
  it("stopped on a size with a history before the fix, as ZH Abayas did", async () => {
    const store = await seedStore();
    await expect(purge(store.brand)).rejects.toThrow("VARIANT_HAS_HISTORY");
    // Nothing was deleted: the call is one transaction.
    expect(await leftOf(store.brand)).toMatchObject({ brands: 1, products: 1 });
  });

  it("stopped on an order line with an alteration before the fix", async () => {
    const store = await seedStore({ alteration: true });
    await expect(purge(store.brand)).rejects.toThrow("ORDER_LINE_HAS_ALTERATION");
  });

  describe("after the fix", () => {
    beforeAll(async () => {
      await db.exec(migration);
    });

    it("deletes a store whose sizes have orders and a ledger", async () => {
      const store = await seedStore();
      expect(await purge(store.brand)).toMatchObject({ deleted: true, mode: "hard" });
      expect(await leftOf(store.brand)).toEqual({});
      const owner = await db.query("SELECT 1 FROM auth.users WHERE id = $1", [store.owner]);
      expect(owner.rows).toHaveLength(0);
    });

    it("deletes a store with an alteration on an order line", async () => {
      const store = await seedStore({ alteration: true });
      await purge(store.brand);
      expect(await leftOf(store.brand)).toEqual({});
    });

    it("deletes a store with partners: their stock, sales, payments, allocations and transfers", async () => {
      const store = await seedStore({ partner: true, alteration: true });
      await purge(store.brand);
      expect(await leftOf(store.brand)).toEqual({});
    });

    it("leaves every other store as it was", async () => {
      const kept = await seedStore({ partner: true });
      const gone = await seedStore({ partner: true });
      await purge(gone.brand);
      expect(await leftOf(kept.brand)).toEqual({
        brands: 1,
        products: 1,
        product_variants: 1,
        orders: 1,
        order_items: 1,
        inventory_movements: 1,
        incubators: 2,
        incubator_inventory: 1,
        incubator_movements: 1,
        incubator_sales: 1,
        incubator_payments: 1,
        incubator_transfers: 1,
        incubator_transfer_items: 1,
        incubator_payment_allocations: 1,
      });
    });

    it("still keeps a size's history from a member of staff", async () => {
      const store = await seedStore();
      await db.exec("SET ROLE authenticated");
      try {
        await expect(
          db.query("DELETE FROM public.product_variants WHERE id = $1", [store.variant]),
        ).rejects.toThrow("VARIANT_HAS_HISTORY");
        await expect(
          db.query("DELETE FROM public.order_items WHERE id = $1", [store.line]),
        ).resolves.toBeDefined();
      } finally {
        await db.exec("RESET ROLE");
      }
    });

    it("answers a retry once the store is gone", async () => {
      const store = await seedStore();
      await purge(store.brand);
      expect(await purge(store.brand)).toMatchObject({ deleted: true, already_absent: true });
    });
  });
});

describe("what the super admin reads when it fails", () => {
  it("says why in words, that nothing was deleted, and keeps the code", async () => {
    const { brandDeleteFailure } =
      await import("../src/components/super-admin/brand-delete-failure");
    expect(brandDeleteFailure("VARIANT_HAS_HISTORY", true)).toBe(
      "تعذّر حذف المتجر: منتج له سجل (طلبات أو حركة مخزون) منع الحذف. لم يُحذف شيء. (VARIANT_HAS_HISTORY)",
    );
    expect(brandDeleteFailure("something else", false)).toBe(
      "The store could not be deleted, and nothing was deleted. (something else)",
    );
  });
});
