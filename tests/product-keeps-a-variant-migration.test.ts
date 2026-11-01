import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261110100000_product_keeps_a_variant.sql?raw";

// A product that is not a service keeps at least one variant, in a real Postgres (PGlite): its
// last variant cannot be deleted, while deleting the product, replacing a variant in one
// transaction and a service's lengths still work.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
let counter = 0;

const product = async (itemKind = "product") => {
  const id = `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
  await db.query("INSERT INTO public.products (id, item_kind) VALUES ($1, $2)", [id, itemKind]);
  return id;
};
const addVariant = async (productId: string, size: string | null = null) =>
  (
    await db.query<{ id: string }>(
      "INSERT INTO public.product_variants (product_id, size) VALUES ($1, $2) RETURNING id",
      [productId, size],
    )
  ).rows[0].id;
const variantsOf = async (productId: string) =>
  (
    await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.product_variants WHERE product_id = $1",
      [productId],
    )
  ).rows[0].n;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE TABLE public.products (
      id uuid PRIMARY KEY, item_kind text NOT NULL DEFAULT 'product'
    );
    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      size text
    );
  `);
  await db.exec(migration);
});

describe("a product's last variant", () => {
  it("cannot be deleted", async () => {
    const id = await product();
    const only = await addVariant(id);
    await expect(
      db.query("DELETE FROM public.product_variants WHERE id = $1", [only]),
    ).rejects.toThrow("PRODUCT_NEEDS_A_VARIANT");
    expect(await variantsOf(id)).toBe(1);
  });

  it("cannot be deleted with the others in one go", async () => {
    const id = await product();
    await addVariant(id, "52");
    await addVariant(id, "54");
    await expect(
      db.query("DELETE FROM public.product_variants WHERE product_id = $1", [id]),
    ).rejects.toThrow("PRODUCT_NEEDS_A_VARIANT");
    expect(await variantsOf(id)).toBe(2);
  });

  it("leaves the other sizes free to delete", async () => {
    const id = await product();
    await addVariant(id, "52");
    const second = await addVariant(id, "54");
    await db.query("DELETE FROM public.product_variants WHERE id = $1", [second]);
    expect(await variantsOf(id)).toBe(1);
  });

  it("can be replaced by another in one transaction", async () => {
    const id = await product();
    const old = await addVariant(id);
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM public.product_variants WHERE id = $1", [old]);
      await tx.query("INSERT INTO public.product_variants (product_id, size) VALUES ($1, '52')", [
        id,
      ]);
    });
    expect(await variantsOf(id)).toBe(1);
  });
});

describe("what the rule leaves alone", () => {
  it("deleting the product still removes its variants", async () => {
    const id = await product();
    await addVariant(id, "52");
    await addVariant(id, "54");
    await db.query("DELETE FROM public.products WHERE id = $1", [id]);
    expect(await variantsOf(id)).toBe(0);
  });

  it("a service's lengths may all be replaced or removed", async () => {
    const id = await product("service");
    const only = await addVariant(id, "3 hours");
    await db.query("DELETE FROM public.product_variants WHERE id = $1", [only]);
    expect(await variantsOf(id)).toBe(0);
  });

  it("nobody can call the rule by hand", async () => {
    const grants = await db.query<{ granted: boolean }>(
      "SELECT has_function_privilege('authenticated', 'public.product_keeps_a_variant()', 'EXECUTE') AS granted",
    );
    expect(grants.rows[0].granted).toBe(false);
  });
});
