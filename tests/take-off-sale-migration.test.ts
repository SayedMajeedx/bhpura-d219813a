import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import previous from "../supabase/migrations/20261024130000_page_data_product_details.sql?raw";
import migration from "../supabase/migrations/20261027120000_take_off_sale.sql?raw";

// Taking a product or a category off sale until a time (migration 20261027120000) in a real
// Postgres: a product carries its category's moment, written by the database alone; it keeps its
// own when the category comes back; a storefront order line for a product off sale is refused,
// a staff one is not; and the home page's products carry both moments.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const A = "00000000-0000-4000-8000-00000000a001";
const B = "00000000-0000-4000-8000-00000000a002";
const C = "00000000-0000-4000-8000-00000000a003";

const pageDataOf = (sql: string) => {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.get_storefront_page_data");
  const open = sql.indexOf("$function$", start);
  const end = sql.indexOf("$function$", open + 1);
  return sql.slice(start, end + "$function$".length);
};
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid,
      slug text);
    INSERT INTO public.categories (brand_id, slug) VALUES ('${BRAND}', 'abayas'), ('${BRAND}', 'dresses');
    CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid, category text);
    CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel text);
    CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid, product_id uuid);
  `);
  await db.exec(
    migration.slice(
      0,
      migration.indexOf("CREATE OR REPLACE FUNCTION public.get_storefront_page_data"),
    ),
  );
  await db.exec(`
    INSERT INTO public.products VALUES ('${A}', '${BRAND}', 'abayas'), ('${B}', '${BRAND}', 'abayas'),
      ('${C}', '${BRAND}', 'dresses');
  `);
});

type Row = {
  id: string;
  unavailable_until: string | null;
  category_unavailable_until: string | null;
};
const products = async () =>
  Object.fromEntries(
    (
      await db.query<Row>(
        "SELECT id, unavailable_until::text, category_unavailable_until::text FROM public.products",
      )
    ).rows.map((row) => [row.id, row]),
  );
const line = async (channel: string, product: string) => {
  const order = (
    await db.query<{ id: string }>("INSERT INTO public.orders (channel) VALUES ($1) RETURNING id", [
      channel,
    ])
  ).rows[0].id;
  return db.query("INSERT INTO public.order_items (order_id, product_id) VALUES ($1, $2)", [
    order,
    product,
  ]);
};

describe("a category off sale", () => {
  it("reaches every product filed under it, and only those", async () => {
    await db.query(
      "UPDATE public.categories SET unavailable_until = 'infinity' WHERE slug = 'abayas'",
    );
    const rows = await products();
    expect(rows[A].category_unavailable_until).toBe("infinity");
    expect(rows[B].category_unavailable_until).toBe("infinity");
    expect(rows[C].category_unavailable_until).toBeNull();
  });

  it("is never a product's own: a form cannot write it, and a product moved follows its new category", async () => {
    await db.query(
      `UPDATE public.products SET category_unavailable_until = NULL WHERE id = '${A}'`,
    );
    expect((await products())[A].category_unavailable_until).toBe("infinity");
    await db.query(`UPDATE public.products SET category = 'dresses' WHERE id = '${B}'`);
    expect((await products())[B].category_unavailable_until).toBeNull();
    await db.query(`UPDATE public.products SET category = 'abayas' WHERE id = '${B}'`);
  });

  it("gives a product back as it was when the category comes back", async () => {
    await db.query(`UPDATE public.products SET unavailable_until = 'infinity' WHERE id = '${A}'`);
    await db.query("UPDATE public.categories SET unavailable_until = NULL WHERE slug = 'abayas'");
    const rows = await products();
    expect(rows[A]).toMatchObject({
      unavailable_until: "infinity",
      category_unavailable_until: null,
    });
    expect(rows[B]).toMatchObject({ unavailable_until: null, category_unavailable_until: null });
    await db.query(`UPDATE public.products SET unavailable_until = NULL WHERE id = '${A}'`);
  });
});

describe("an order for a product off sale", () => {
  it("is refused from the storefront, never from staff, and taken once it is back", async () => {
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    await db.query(`UPDATE public.products SET unavailable_until = $1 WHERE id = '${C}'`, [soon]);
    await expect(line("storefront", C)).rejects.toThrow(new RegExp(`PRODUCT_UNAVAILABLE:${C}`));
    await expect(line("admin", C)).resolves.toBeTruthy();
    await expect(line("storefront", A)).resolves.toBeTruthy();
    const past = new Date(Date.now() - 60_000).toISOString();
    await db.query(`UPDATE public.products SET unavailable_until = $1 WHERE id = '${C}'`, [past]);
    await expect(line("storefront", C)).resolves.toBeTruthy();
  });

  it("is refused while its category is off sale", async () => {
    await db.query(
      "UPDATE public.categories SET unavailable_until = 'infinity' WHERE slug = 'dresses'",
    );
    await expect(line("storefront", C)).rejects.toThrow(/PRODUCT_UNAVAILABLE/);
    await db.query("UPDATE public.categories SET unavailable_until = NULL WHERE slug = 'dresses'");
  });
});

describe("what the migration changes", () => {
  it("adds the two moments to the home page's products and nothing else", () => {
    const added = squash(`-- ADDED (20261027120000): off sale until (its own, and its category's).
      'unavailable_until', p.unavailable_until,
      'category_unavailable_until', p.category_unavailable_until,`);
    const after = squash(pageDataOf(migration));
    expect(after).toContain(added);
    expect(after.replace(added, "").replace(/\s+/g, " ")).toBe(squash(pageDataOf(previous)));
  });

  it("lets visitors read the moments, staff set a product's own, and no browser call the triggers", () => {
    expect(migration).toMatch(
      /GRANT SELECT \(unavailable_until, category_unavailable_until\) ON public\.products TO anon;/,
    );
    expect(migration).toMatch(
      /GRANT INSERT \(unavailable_until\), UPDATE \(unavailable_until\) ON public\.products TO authenticated;/,
    );
    for (const fn of [
      "products_off_sale_from_category",
      "categories_off_sale_to_products",
      "refuse_storefront_line_off_sale",
    ]) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.${fn}() FROM PUBLIC, anon, authenticated;`,
      );
    }
  });
});
