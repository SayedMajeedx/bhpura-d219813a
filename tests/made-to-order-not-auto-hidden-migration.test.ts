import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import autoDeactivate from "../supabase/migrations/20260828003000_auto_deactivate_out_of_stock_products.sql?raw";
import preserveManual from "../supabase/migrations/20260904215000_fix_auto_deactivate_preserve_manual_hidden.sql?raw";
import fix from "../supabase/migrations/20261010100000_made_to_order_is_not_auto_hidden.sql?raw";

// The "hide a product whose stock is zero" trigger in a real Postgres (PGlite): it used to hide a
// made-to-order piece and a service too; after the fix it leaves them alone and still hides and
// shows a ready-made product as before.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
let counter = 0;

type Kind = { madeToOrder?: boolean; itemKind?: string };
const product = async ({ madeToOrder = false, itemKind = "product" }: Kind = {}) => {
  const id = `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
  await db.query(
    "INSERT INTO public.products (id, is_active, is_made_to_order, item_kind) VALUES ($1, true, $2, $3)",
    [id, madeToOrder, itemKind],
  );
  return id;
};
const addVariant = async (productId: string, stock: number) =>
  (
    await db.query<{ id: string }>(
      "INSERT INTO public.product_variants (product_id, stock_main) VALUES ($1, $2) RETURNING id",
      [productId, stock],
    )
  ).rows[0].id;
const setStock = (variantId: string, stock: number) =>
  db.query("UPDATE public.product_variants SET stock_main = $2 WHERE id = $1", [variantId, stock]);
const state = async (productId: string) =>
  (
    await db.query<{ is_active: boolean; auto_deactivated_out_of_stock: boolean }>(
      "SELECT is_active, auto_deactivated_out_of_stock FROM public.products WHERE id = $1",
      [productId],
    )
  ).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE public.products (
      id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true,
      is_made_to_order boolean NOT NULL DEFAULT false, item_kind text NOT NULL DEFAULT 'product'
    );
    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL,
      stock_main integer DEFAULT 0, stock_incubator integer DEFAULT 0
    );
  `);
  await db.exec(autoDeactivate);
  await db.exec(preserveManual);
});

describe("before the fix", () => {
  it("hid a made-to-order piece as soon as a variant with no stock was added", async () => {
    const id = await product({ madeToOrder: true });
    await addVariant(id, 0);
    expect((await state(id)).is_active).toBe(false);
  });
});

describe("after the fix", () => {
  let stale: string;

  beforeAll(async () => {
    // A made-to-order piece the old trigger hid and the merchant published again: visible, but
    // still marked as hidden by the system.
    stale = await product({ madeToOrder: true });
    await addVariant(stale, 0);
    await db.query("UPDATE public.products SET is_active = true WHERE id = $1", [stale]);
    await db.exec(fix);
  });

  it("leaves a made-to-order piece visible with no ready stock, and when a ready size sells out", async () => {
    const id = await product({ madeToOrder: true });
    const variant = await addVariant(id, 0);
    expect(await state(id)).toEqual({ is_active: true, auto_deactivated_out_of_stock: false });
    await setStock(variant, 2);
    await setStock(variant, 0);
    expect((await state(id)).is_active).toBe(true);
  });

  it("leaves a service visible", async () => {
    const id = await product({ itemKind: "service" });
    await addVariant(id, 0);
    expect((await state(id)).is_active).toBe(true);
  });

  it("does not show a made-to-order piece the merchant hid when stock arrives", async () => {
    const id = await product({ madeToOrder: true });
    const variant = await addVariant(id, 0);
    await db.query("UPDATE public.products SET is_active = false WHERE id = $1", [id]);
    await setStock(variant, 5);
    expect((await state(id)).is_active).toBe(false);
  });

  it("still hides a ready-made product at zero stock and shows it again when stock returns", async () => {
    const id = await product();
    const variant = await addVariant(id, 3);
    expect((await state(id)).is_active).toBe(true);
    await setStock(variant, 0);
    expect(await state(id)).toEqual({ is_active: false, auto_deactivated_out_of_stock: true });
    await setStock(variant, 1);
    expect(await state(id)).toEqual({ is_active: true, auto_deactivated_out_of_stock: false });
  });

  it("clears the stale 'hidden by the system' mark of a visible made-to-order piece", async () => {
    expect(await state(stale)).toEqual({ is_active: true, auto_deactivated_out_of_stock: false });
  });

  it("does not publish a made-to-order piece that is hidden", async () => {
    const id = await product({ madeToOrder: true });
    await db.query(
      "UPDATE public.products SET is_active = false, auto_deactivated_out_of_stock = true WHERE id = $1",
      [id],
    );
    await db.exec(fix);
    expect((await state(id)).is_active).toBe(false);
  });
});
