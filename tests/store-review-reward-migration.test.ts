import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import reviewsOnStore from "../supabase/migrations/20261022100000_product_reviews_on_store.sql?raw";
import migration from "../supabase/migrations/20261022110000_store_review_reward.sql?raw";
import reviewPageNumber from "../supabase/migrations/20261027170000_review_page_order_number.sql?raw";

// Each store's own thank-you discount for a review (bug #41), run in a real Postgres (PGlite):
// the live review page function, then migrations 20261022100000 and 20261022110000. Every store
// used to hand out THANKU10, a code only one store has. Now a review gets the store's own code
// while anyone can use it, or none, and the page is told what it takes off.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PURA = "00000000-0000-4000-8000-000000000001";
const ROASTERY = "00000000-0000-4000-8000-000000000002";
const PURA_CODE = "00000000-0000-4000-8000-0000000000c1";
const SPENT_CODE = "00000000-0000-4000-8000-0000000000c2";
const ONE_USE = "00000000-0000-4000-8000-0000000000c3";
const ROASTERY_CODE = "00000000-0000-4000-8000-0000000000c4";

const order = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
const token = (n: number) => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`;

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

  CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, name_ar text, name_en text, logo_url text,
    is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY, business_name text, logo_url text,
    whatsapp_number text, currency text);
  CREATE TABLE public.promo_codes (
    id uuid PRIMARY KEY, brand_id uuid NOT NULL, code text NOT NULL, discount_type text NOT NULL,
    discount_value numeric NOT NULL, is_active boolean NOT NULL DEFAULT true,
    start_date timestamptz, end_date timestamptz, max_redemptions integer
  );
  CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.orders (id uuid PRIMARY KEY, brand_id uuid NOT NULL, invoice_number integer,
    customer_name_snapshot text, customer_phone_snapshot text);
  CREATE TABLE public.order_items (order_id uuid NOT NULL, product_id uuid);
  CREATE TABLE public.order_review_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, order_id uuid NOT NULL,
    public_token uuid UNIQUE, eligible_at timestamptz NOT NULL DEFAULT now() - interval '1 day',
    status text NOT NULL DEFAULT 'scheduled', completed_at timestamptz, sent_at timestamptz,
    updated_at timestamptz
  );
  CREATE TABLE public.order_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
    brand_id uuid NOT NULL, order_id uuid NOT NULL, rating smallint NOT NULL,
    highlights text[] NOT NULL DEFAULT '{}', comment text,
    reward_code text NOT NULL DEFAULT 'THANKU10', created_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO public.brands (id, slug, name_en) VALUES ('${PURA}', 'pura', 'Pura'), ('${ROASTERY}', 'beans', 'Beans');
  INSERT INTO public.business_settings VALUES ('${PURA}', 'Pura Line', NULL, '+97339950016', 'BHD'),
    ('${ROASTERY}', 'Beans', NULL, '+966500000000', 'SAR');
  INSERT INTO public.promo_codes (id, brand_id, code, discount_type, discount_value, end_date, max_redemptions) VALUES
    ('${PURA_CODE}', '${PURA}', 'THANKU10', 'percentage', 10, NULL, NULL),
    ('${SPENT_CODE}', '${ROASTERY}', 'OLD5', 'fixed', 5, now() - interval '1 day', NULL),
    ('${ONE_USE}', '${ROASTERY}', 'CART-ABC', 'percentage', 20, NULL, 1),
    ('${ROASTERY_CODE}', '${ROASTERY}', 'THANKS15', 'percentage', 15, NULL, NULL);
`;

// The review page's function as it was live (pg_get_functiondef, 2026-10-22).
const LIVE_PAGE = `
CREATE OR REPLACE FUNCTION public.get_public_order_review(p_token uuid)
 RETURNS TABLE(state text, brand_name text, brand_logo_url text, invoice_number integer, customer_name text, brand_whatsapp_number text, reward_code text)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    CASE WHEN r.status = 'completed' THEN 'completed' ELSE 'ready' END,
    COALESCE(NULLIF(bs.business_name, ''), b.name_ar, b.name_en, b.slug),
    COALESCE(bs.logo_url, b.logo_url),
    o.invoice_number,
    COALESCE(NULLIF(split_part(o.customer_name_snapshot, ' ', 1), ''), 'عميلنا'),
    bs.whatsapp_number,
    CASE WHEN r.status = 'completed' THEN COALESCE(rv.reward_code, 'THANKU10') ELSE NULL END
  FROM public.order_review_requests r
  JOIN public.orders o ON o.id = r.order_id
  JOIN public.brands b ON b.id = r.brand_id AND b.is_active = true
  LEFT JOIN public.business_settings bs ON bs.brand_id = r.brand_id
  LEFT JOIN public.order_reviews rv ON rv.request_id = r.id
  WHERE r.public_token = p_token AND r.eligible_at <= now();
$function$;
GRANT EXECUTE ON FUNCTION public.get_public_order_review(uuid) TO anon, authenticated;
`;

let db: PGlite;

async function requestFor(n: number, brand: string) {
  await db.exec(`
    INSERT INTO public.orders VALUES ('${order(n)}', '${brand}', ${n}, 'Fatima Ali', '+97333000000');
    INSERT INTO public.order_review_requests (brand_id, order_id, public_token)
      VALUES ('${brand}', '${order(n)}', '${token(n)}');
  `);
}

async function asVisitor<T>(sql: string, params: unknown[] = []) {
  await db.exec("SET ROLE anon;");
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("RESET ROLE;");
  }
}

type Page = {
  state: string;
  reward_code: string | null;
  reward_discount_type: string | null;
  reward_discount_value: string | number | null;
  currency: string;
};
const page = async (n: number) =>
  (await asVisitor<Page>("SELECT * FROM public.get_public_order_review($1)", [token(n)]))[0];
const submit = async (n: number) =>
  (
    await asVisitor<{ code: string | null }>(
      "SELECT public.submit_public_order_review($1, 5) AS code",
      [token(n)],
    )
  )[0].code;
const setReward = (brand: string, promo: string | null) =>
  db.query("UPDATE public.business_settings SET review_reward_promo_id = $1 WHERE brand_id = $2", [
    promo,
    brand,
  ]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(LIVE_PAGE);
  await db.exec(reviewsOnStore);
  await db.exec(migration);
});

describe("each store's own review reward", () => {
  it("keeps THANKU10 for the store that has it, and tells the page what it takes off", async () => {
    await requestFor(1, PURA);
    expect(await page(1)).toMatchObject({
      state: "ready",
      reward_code: null,
      reward_discount_type: "percentage",
      currency: "BHD",
    });
    expect(Number((await page(1)).reward_discount_value)).toBe(10);
    expect(await submit(1)).toBe("THANKU10");
    expect(await page(1)).toMatchObject({ state: "completed", reward_code: "THANKU10" });
  });

  it("promises and gives nothing in a store that chose no reward", async () => {
    await requestFor(2, ROASTERY);
    expect(await page(2)).toMatchObject({ reward_discount_type: null, reward_code: null });
    expect(await submit(2)).toBeNull();
    const done = await page(2);
    expect(done).toMatchObject({
      state: "completed",
      reward_code: null,
      reward_discount_type: null,
    });
  });

  it("gives a store's own code, in its currency", async () => {
    await setReward(ROASTERY, ROASTERY_CODE);
    await requestFor(3, ROASTERY);
    expect(await page(3)).toMatchObject({ reward_discount_type: "percentage", currency: "SAR" });
    expect(await submit(3)).toBe("THANKS15");
  });

  it("never hands out a code nobody can use: ended, switched off, or for one shopper", async () => {
    for (const [n, promo] of [
      [4, SPENT_CODE],
      [5, ONE_USE],
    ] as const) {
      await setReward(ROASTERY, promo);
      await requestFor(n, ROASTERY);
      expect((await page(n)).reward_discount_type).toBeNull();
      expect(await submit(n)).toBeNull();
    }
    await setReward(ROASTERY, ROASTERY_CODE);
    await db.query("UPDATE public.promo_codes SET is_active = false WHERE id = $1", [
      ROASTERY_CODE,
    ]);
    await requestFor(6, ROASTERY);
    expect(await submit(6)).toBeNull();
  });

  it("never gives another store's code, even when named", async () => {
    await setReward(ROASTERY, PURA_CODE);
    await requestFor(7, ROASTERY);
    expect(await submit(7)).toBeNull();
  });

  it("answers a second submission with the code the review was given", async () => {
    expect(await submit(1)).toBe("THANKU10");
  });

  it("is a rule no browser can call on its own", async () => {
    await expect(asVisitor("SELECT * FROM public.store_review_reward($1)", [PURA])).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("the review page's order number (migration 20261027170000)", () => {
  it("tells the page how the store writes its order numbers, keeping everything else", async () => {
    await db.exec(`
      ALTER TABLE public.business_settings ADD COLUMN order_number_prefix text,
        ADD COLUMN order_number_digits smallint;
      UPDATE public.business_settings SET order_number_prefix = 'PL-', order_number_digits = 5
       WHERE brand_id = '${PURA}';
    `);
    await db.exec(reviewPageNumber);
    expect(await page(1)).toMatchObject({
      state: "completed",
      reward_code: "THANKU10",
      currency: "BHD",
      order_number_prefix: "PL-",
      order_number_digits: 5,
    });
    expect(await page(2)).toMatchObject({ order_number_prefix: null, order_number_digits: null });
  });
});
