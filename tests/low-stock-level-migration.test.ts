import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261012180000_store_low_stock_level.sql?raw";

// The store's own low-stock level in a real Postgres (PGlite): the column and its range, and the
// phone alert, which read the number 5 and spoke for made-to-order pieces and services too.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

// The function as it was live before this migration.
const LIVE_BEFORE = `
CREATE OR REPLACE FUNCTION public.enqueue_mobile_low_stock_push()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_stock numeric; v_old_stock numeric; v_name text; v_brand uuid;
BEGIN
  v_stock := COALESCE(NEW.stock_main, NEW.stock, 0); v_old_stock := COALESCE(OLD.stock_main, OLD.stock, 0);
  IF v_stock <= 5 AND (v_old_stock > 5 OR v_old_stock IS NULL) THEN
    SELECT p.brand_id, p.name INTO v_brand, v_name FROM public.products p WHERE p.id = NEW.product_id;
    INSERT INTO public.push_notification_events (brand_id,event_type,entity_type,entity_id,dedupe_key,title,body,target_url,payload)
    VALUES (v_brand,'low_stock','variant',NEW.id,'low-stock:'||NEW.id||':'||v_stock,'تنبيه انخفاض المخزون',
      COALESCE(v_name,NULLIF(NEW.sku,''),'منتج')||' — المتبقي '||v_stock,'/inventory',jsonb_build_object('variant_id',NEW.id,'stock',v_stock))
    ON CONFLICT DO NOTHING;
  END IF; RETURN NEW;
END; $function$;
CREATE TRIGGER enqueue_mobile_low_stock_push AFTER UPDATE OF stock_main, stock
  ON public.product_variants FOR EACH ROW EXECUTE FUNCTION enqueue_mobile_low_stock_push();
`;

const store = async (level?: number) => {
  const brand = uuid();
  if (level !== undefined) {
    await db.query(
      "INSERT INTO public.business_settings (brand_id, low_stock_threshold) VALUES ($1, $2)",
      [brand, level],
    );
  }
  return brand;
};

type Kind = { madeToOrder?: boolean; itemKind?: string };
/** A variant holding `stock` pieces, of a new product in the store. */
const piece = async (
  brand: string,
  stock: number,
  { madeToOrder = false, itemKind = "product" }: Kind = {},
) => {
  const productId = uuid();
  await db.query(
    "INSERT INTO public.products (id, brand_id, name, is_made_to_order, item_kind) VALUES ($1, $2, 'Abaya', $3, $4)",
    [productId, brand, madeToOrder, itemKind],
  );
  const id = uuid();
  await db.query(
    "INSERT INTO public.product_variants (id, product_id, brand_id, stock_main) VALUES ($1, $2, $3, $4)",
    [id, productId, brand, stock],
  );
  return id;
};
const setStock = (variantId: string, stock: number) =>
  db.query("UPDATE public.product_variants SET stock_main = $2 WHERE id = $1", [variantId, stock]);
const alerts = async (variantId: string) =>
  (
    await db.query<{ body: string }>(
      "SELECT body FROM public.push_notification_events WHERE entity_id = $1 ORDER BY created_at, body",
      [variantId],
    )
  ).rows.map((row) => row.body);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY);
    CREATE TABLE public.products (
      id uuid PRIMARY KEY, brand_id uuid NOT NULL, name text,
      is_made_to_order boolean DEFAULT false, item_kind text DEFAULT 'product'
    );
    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY, product_id uuid NOT NULL, brand_id uuid NOT NULL, sku text,
      stock_main integer DEFAULT 0, stock integer
    );
    CREATE TABLE public.push_notification_events (
      brand_id uuid, event_type text, entity_type text, entity_id uuid, dedupe_key text UNIQUE,
      title text, body text, target_url text, payload jsonb, created_at timestamptz DEFAULT now()
    );
  `);
  await db.exec(LIVE_BEFORE);
});

describe("before the migration", () => {
  it("alerted for a made-to-order piece whose ready sizes ran down", async () => {
    const brand = uuid();
    const tailored = await piece(brand, 8, { madeToOrder: true });
    await setStock(tailored, 3);
    expect(await alerts(tailored)).toHaveLength(1);
  });
});

describe("after the migration", () => {
  beforeAll(async () => {
    // A store that existed before: its row gets the default.
    await db.query("INSERT INTO public.business_settings (brand_id) VALUES ($1)", [uuid()]);
    await db.exec(migration);
  });

  it("gives every store the level it had, 5, and keeps the level in range", async () => {
    const levels = await db.query<{ low_stock_threshold: number }>(
      "SELECT low_stock_threshold FROM public.business_settings",
    );
    expect(levels.rows.map((row) => row.low_stock_threshold)).toEqual([5]);
    for (const bad of [-1, 1001]) {
      await expect(store(bad)).rejects.toThrow(/business_settings_low_stock_threshold_range/);
    }
    await store(0);
    await store(1000);
  });

  it("alerts once when a variant crosses the default level", async () => {
    const brand = await store(5);
    const id = await piece(brand, 8);
    await setStock(id, 6);
    expect(await alerts(id)).toEqual([]);
    await setStock(id, 5);
    expect(await alerts(id)).toEqual(["Abaya — المتبقي 5"]);
    // Already low: going lower is not a new alert.
    await setStock(id, 4);
    expect(await alerts(id)).toHaveLength(1);
  });

  it("alerts at the store's own level", async () => {
    const boutique = await store(2);
    const one = await piece(boutique, 8);
    await setStock(one, 4);
    expect(await alerts(one)).toEqual([]);
    await setStock(one, 2);
    expect(await alerts(one)).toEqual(["Abaya — المتبقي 2"]);

    const roastery = await store(20);
    const bags = await piece(roastery, 40);
    await setStock(bags, 18);
    expect(await alerts(bags)).toEqual(["Abaya — المتبقي 18"]);
  });

  it("with the warning off, speaks only when the last piece goes", async () => {
    const brand = await store(0);
    const id = await piece(brand, 3);
    await setStock(id, 1);
    expect(await alerts(id)).toEqual([]);
    await setStock(id, 0);
    expect(await alerts(id)).toEqual(["Abaya — المتبقي 0"]);
  });

  it("uses 5 for a store with no settings row", async () => {
    const brand = await store();
    const id = await piece(brand, 8);
    await setStock(id, 5);
    expect(await alerts(id)).toHaveLength(1);
  });

  it("stays silent for a made-to-order piece and a service", async () => {
    const brand = await store(5);
    const tailored = await piece(brand, 8, { madeToOrder: true });
    const service = await piece(brand, 8, { itemKind: "service" });
    await setStock(tailored, 1);
    await setStock(service, 0);
    expect(await alerts(tailored)).toEqual([]);
    expect(await alerts(service)).toEqual([]);
  });

  it("does not alert when stock arrives, and alerts again the next time it runs down", async () => {
    const brand = await store(5);
    const id = await piece(brand, 2);
    await setStock(id, 9);
    expect(await alerts(id)).toEqual([]);
    await setStock(id, 3);
    expect(await alerts(id)).toEqual(["Abaya — المتبقي 3"]);
  });

  it("is not callable by a browser", async () => {
    const grants = await db.query<{ anon: boolean; member: boolean }>(
      `SELECT has_function_privilege('anon', 'public.enqueue_mobile_low_stock_push()', 'EXECUTE') AS anon,
              has_function_privilege('authenticated', 'public.enqueue_mobile_low_stock_push()', 'EXECUTE') AS member`,
    );
    expect(grants.rows[0]).toEqual({ anon: false, member: false });
  });
});
