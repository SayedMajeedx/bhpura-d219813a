import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import previous from "../supabase/migrations/20261024140000_delivery_day_and_time.sql?raw";
import migration from "../supabase/migrations/20261027100000_store_offers.sql?raw";

// A store's automatic offers (migration 20261027100000) run in a real Postgres: the rule itself
// (which lines an offer reaches, what it takes off, buy X get Y, which offer wins against a
// promo code), the order builder that applies it (the live place_storefront_order with the offers
// added), the checkout's preview and what a visitor may read.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const ABAYA = "00000000-0000-4000-8000-00000000a001";
const ABAYA_2 = "00000000-0000-4000-8000-00000000a002";
const DRESS = "00000000-0000-4000-8000-00000000d001";
const SCARF = "00000000-0000-4000-8000-00000000f001";
const FOREIGN = "00000000-0000-4000-8000-00000000e001";
const variantOf = (product: string) => product.replace(/(.{8})$/, (tail) => `9${tail.slice(1)}`);

const builderOf = (sql: string) => {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.place_storefront_order(p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text, p_notes text DEFAULT NULL::text, p_fulfillment",
  );
  const open = sql.indexOf("$function$", start);
  const end = sql.indexOf("$function$", open + 1);
  return start < 0 ? "" : sql.slice(start, end + "$function$".length);
};
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
    CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, is_active boolean);
    INSERT INTO public.brands VALUES ('${BRAND}', 'store', true), ('${OTHER}', 'other', true);
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY,
      default_tax_rate numeric(5,2) NOT NULL DEFAULT 10, vat_inclusive boolean DEFAULT false,
      advance_allow_full_payment boolean DEFAULT true);
    INSERT INTO public.business_settings (brand_id) VALUES ('${BRAND}'), ('${OTHER}');
    CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid, category text);
    INSERT INTO public.products VALUES ('${ABAYA}', '${BRAND}', 'abayas'),
      ('${ABAYA_2}', '${BRAND}', 'abayas'), ('${DRESS}', '${BRAND}', 'dresses'),
      ('${SCARF}', '${BRAND}', NULL), ('${FOREIGN}', '${OTHER}', 'abayas');
    CREATE TABLE public.product_variants (id uuid PRIMARY KEY, brand_id uuid, product_id uuid,
      selling_price numeric(14,3), original_price numeric(14,3));
    INSERT INTO public.product_variants VALUES
      ('${variantOf(ABAYA)}', '${BRAND}', '${ABAYA}', 25, NULL),
      ('${variantOf(ABAYA_2)}', '${BRAND}', '${ABAYA_2}', 24, 30),
      ('${variantOf(DRESS)}', '${BRAND}', '${DRESS}', 8, NULL),
      ('${variantOf(SCARF)}', '${BRAND}', '${SCARF}', 5, NULL),
      ('${variantOf(FOREIGN)}', '${OTHER}', '${FOREIGN}', 99, NULL);
    CREATE TABLE public.pending_benefit_receipts (id uuid PRIMARY KEY, brand_id uuid,
      uploaded_at timestamptz, consumed_at timestamptz, expires_at timestamptz,
      public_url text, object_key text);
    CREATE TABLE public.idempotency_claims (brand_id uuid, idempotency_key text,
      request_hash text, order_id uuid, UNIQUE (brand_id, idempotency_key));
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, customer_id uuid,
      invoice_number integer, status text DEFAULT 'pending', payment_status text DEFAULT 'unpaid',
      subtotal numeric(14,3) NOT NULL DEFAULT 0, discount numeric(14,3) NOT NULL DEFAULT 0,
      shipping numeric(14,3) NOT NULL DEFAULT 0, tax_rate numeric(5,2) NOT NULL DEFAULT 0,
      tax_amount numeric(14,3) NOT NULL DEFAULT 0, total numeric(14,3) NOT NULL DEFAULT 0,
      promo_code text, promo_code_id uuid, idempotency_key text, request_hash text,
      advance_rules jsonb, destination_country text, delivery_address_snapshot jsonb,
      benefit_receipt_url text, benefit_receipt_key text,
      confirmation_email_token uuid DEFAULT gen_random_uuid());
    CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid REFERENCES public.orders(id), product_id uuid, variant_id uuid,
      quantity integer NOT NULL DEFAULT 1, line_total numeric(14,3) NOT NULL DEFAULT 0);
    CREATE TABLE public.customers (id uuid PRIMARY KEY, auth_user_id uuid);
    CREATE TABLE public.loyalty_accounts (brand_id uuid, customer_id uuid, current_tier_key text);
    CREATE TABLE public.brand_loyalty_tiers (brand_id uuid, tier_key text, free_shipping boolean);
    CREATE TABLE public.brand_loyalty_programs (brand_id uuid, is_enabled boolean);
    CREATE FUNCTION public.advance_full_payment_rules() RETURNS jsonb LANGUAGE sql
      AS $$ SELECT '[]'::jsonb $$;
    CREATE FUNCTION public.assign_order_pickup_partner(uuid, uuid) RETURNS void LANGUAGE sql
      AS $$ SELECT $$;
    CREATE FUNCTION public.set_order_requested_time(uuid, text, text) RETURNS void LANGUAGE sql
      AS $$ SELECT $$;
    -- The store's delivery fee: 2.000 wherever it goes.
    CREATE FUNCTION public.storefront_delivery_fee(uuid, text, text, integer) RETURNS numeric
      LANGUAGE sql AS $$ SELECT 2::numeric $$;
    -- A promo code is worth what the test says ('code_discount' in the customer).
    CREATE FUNCTION public.validate_promo_code(p_brand_slug text, p_code text, p_subtotal numeric,
      p_items jsonb DEFAULT NULL, p_customer_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql
      AS $$ SELECT CASE WHEN upper(p_code) = 'BAD' THEN jsonb_build_object('valid', false)
        ELSE jsonb_build_object('valid', true, 'discount_amount',
          least(p_subtotal, substring(p_code from '[0-9.]+')::numeric)) END $$;
    -- The order and its lines as the core builder leaves them: lines priced by the test, the
    -- promo code's discount applied.
    CREATE FUNCTION public.place_storefront_order_core(p_brand_slug text, p_customer jsonb,
      p_items jsonb, p_payment_method text, p_notes text, p_fulfillment text, p_branch_id uuid,
      p_digital_channel text, p_digital_contact text, p_promo_code text)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE v_id uuid; v_sub numeric; v_code numeric := 0;
    BEGIN
      SELECT COALESCE(sum((i->>'line_total')::numeric), 0) INTO v_sub
        FROM jsonb_array_elements(p_items) i;
      IF p_promo_code IS NOT NULL THEN
        v_code := (public.validate_promo_code(p_brand_slug, p_promo_code, v_sub) ->> 'discount_amount')::numeric;
      END IF;
      INSERT INTO public.orders (brand_id, subtotal, discount, promo_code, promo_code_id, total)
      VALUES ('${BRAND}', v_sub, v_code, p_promo_code,
        CASE WHEN p_promo_code IS NULL THEN NULL ELSE gen_random_uuid() END, v_sub - v_code)
      RETURNING id INTO v_id;
      INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, line_total)
      SELECT v_id, (i->>'product_id')::uuid, (i->>'variant_id')::uuid, (i->>'quantity')::int,
             (i->>'line_total')::numeric
        FROM jsonb_array_elements(p_items) i;
      RETURN jsonb_build_object('success', true, 'order_id', v_id, 'discount', v_code);
    END $$;
  `);
  await db.exec(migration);
});

type Offer = Record<string, unknown>;
type Line = { product: string; qty: number; price: number };

async function setOffers(offers: Offer[], mode = "best") {
  await db.query("DELETE FROM public.store_offers");
  await db.query("UPDATE public.business_settings SET offers_combine = $1", [mode]);
  let at = 0;
  for (const offer of offers) {
    at += 1;
    const columns = Object.keys(offer);
    await db.query(
      `INSERT INTO public.store_offers (brand_id, created_at, ${columns.join(", ")})
       VALUES ($1, now() - interval '${100 - at} minutes', ${columns.map((_, i) => `$${i + 2}`).join(", ")})`,
      [BRAND, ...columns.map((c) => offer[c])],
    );
  }
}

const linesJson = (lines: Line[]) =>
  lines.map((l) => ({
    product_id: l.product,
    variant_id: variantOf(l.product),
    quantity: l.qty,
    line_total: Number((l.price * l.qty).toFixed(3)),
  }));

type Outcome = {
  offer_discount: number;
  code_discount: number;
  code_kept: boolean;
  code_dropped: boolean;
  free_delivery: boolean;
  applied: Array<{ kind: string; amount: number; name_en: string }>;
};

/** What the checkout's preview says this cart gets. */
async function preview(
  lines: Line[],
  { code = null as string | null, fulfillment = "delivery", country = null as string | null } = {},
) {
  const result = await db.query<{ r: Outcome }>(
    "SELECT public.storefront_offers_preview('store', $1::jsonb, $2, $3, $4) AS r",
    [JSON.stringify(linesJson(lines)), code, fulfillment, country],
  );
  const r = result.rows[0].r;
  return { ...r, offer_discount: Number(r.offer_discount), code_discount: Number(r.code_discount) };
}

/** The order the real builder writes for this cart. */
async function place(lines: Line[], { code = null as string | null, country = "BH" } = {}) {
  const result = await db.query<{ r: Record<string, unknown> }>(
    `SELECT public.place_storefront_order('store', $1::jsonb, $2::jsonb, 'cod', NULL,
       'delivery', NULL, NULL, NULL, $3) AS r`,
    [JSON.stringify({ country_code: country }), JSON.stringify(linesJson(lines)), code],
  );
  const answer = result.rows[0].r;
  const order = (
    await db.query<Record<string, string>>(
      "SELECT subtotal, discount, offer_discount, shipping, tax_amount, total, promo_code, applied_offers FROM public.orders WHERE id = $1",
      [answer.order_id],
    )
  ).rows[0];
  return { answer, order };
}

const tenOff: Offer = {
  kind: "discount",
  name_en: "10% off",
  discount_type: "percentage",
  discount_value: 10,
};

describe("which lines an offer reaches and what it takes off", () => {
  it("takes a percentage off every line, with its cap and its least amount", async () => {
    await setOffers([{ ...tenOff, min_subtotal: 40, max_discount: 4.5 }]);
    expect((await preview([{ product: ABAYA, qty: 1, price: 25 }])).offer_discount).toBe(0);
    expect((await preview([{ product: ABAYA, qty: 2, price: 25 }])).offer_discount).toBe(4.5);
    expect((await preview([{ product: DRESS, qty: 5, price: 8 }])).offer_discount).toBe(4);
  });

  it("reaches only the products and categories it names, and may leave sale pieces out", async () => {
    await setOffers([{ ...tenOff, category_slugs: ["abayas"], exclude_sale_items: true }]);
    const cart = [
      { product: ABAYA, qty: 1, price: 25 },
      { product: ABAYA_2, qty: 1, price: 24 }, // on sale (30 → 24)
      { product: DRESS, qty: 1, price: 8 },
    ];
    expect((await preview(cart)).offer_discount).toBe(2.5);
    await setOffers([{ ...tenOff, product_ids: [DRESS] }]);
    expect((await preview(cart)).offer_discount).toBe(0.8);
  });

  it("asks its least number of pieces of the lines it reaches", async () => {
    await setOffers([{ ...tenOff, category_slugs: ["dresses"], min_items: 3 }]);
    expect((await preview([{ product: DRESS, qty: 2, price: 8 }])).offer_discount).toBe(0);
    expect((await preview([{ product: DRESS, qty: 3, price: 8 }])).offer_discount).toBe(2.4);
  });

  it("never takes off more than the lines it reaches cost", async () => {
    await setOffers([{ kind: "discount", discount_type: "fixed", discount_value: 50 }]);
    expect((await preview([{ product: DRESS, qty: 2, price: 8 }])).offer_discount).toBe(16);
  });

  it("is off before it starts, after it ends and while switched off", async () => {
    await setOffers([
      { ...tenOff, starts_at: new Date(Date.now() + 86_400_000).toISOString() },
      { ...tenOff, ends_at: new Date(Date.now() - 60_000).toISOString() },
      { ...tenOff, is_active: false },
    ]);
    expect((await preview([{ product: ABAYA, qty: 2, price: 25 }])).offer_discount).toBe(0);
  });
});

describe("buy X get Y", () => {
  const buyTwoGetOne: Offer = {
    kind: "buy_x_get_y",
    name_en: "Buy 2 get 1",
    buy_quantity: 2,
    get_quantity: 1,
    get_percent: 100,
  };

  it("gives the cheapest piece of a set, as many times as the cart allows", async () => {
    await setOffers([buyTwoGetOne]);
    const three = [
      { product: ABAYA, qty: 2, price: 25 },
      { product: DRESS, qty: 1, price: 8 },
    ];
    expect((await preview(three)).offer_discount).toBe(8);
    // Six pieces: two sets, the two cheapest given.
    const six = [
      { product: ABAYA, qty: 4, price: 25 },
      { product: DRESS, qty: 2, price: 8 },
    ];
    expect((await preview(six)).offer_discount).toBe(16);
    await setOffers([{ ...buyTwoGetOne, max_sets: 1 }]);
    expect((await preview(six)).offer_discount).toBe(8);
  });

  it("gives nothing until a whole set is in the cart", async () => {
    await setOffers([buyTwoGetOne]);
    expect((await preview([{ product: ABAYA, qty: 2, price: 25 }])).offer_discount).toBe(0);
  });

  it("gives a piece of its own lines at its percentage when it names them", async () => {
    // Buy an abaya, a dress at half price.
    await setOffers([
      {
        kind: "buy_x_get_y",
        buy_quantity: 1,
        get_quantity: 1,
        get_percent: 50,
        category_slugs: ["abayas"],
        get_category_slugs: ["dresses"],
      },
    ]);
    expect(
      (
        await preview([
          { product: ABAYA, qty: 1, price: 25 },
          { product: DRESS, qty: 2, price: 8 },
        ])
      ).offer_discount,
    ).toBe(4);
    // No abaya bought: no dress at half price.
    expect((await preview([{ product: DRESS, qty: 2, price: 8 }])).offer_discount).toBe(0);
    // Two abayas, two dresses: two sets.
    expect(
      (
        await preview([
          { product: ABAYA, qty: 2, price: 25 },
          { product: DRESS, qty: 2, price: 8 },
        ])
      ).offer_discount,
    ).toBe(8);
  });

  it("counts a piece once, as bought or as given", async () => {
    // Buy 1 get 1 on abayas, one abaya and one scarf that is not an abaya: no set.
    await setOffers([
      {
        kind: "buy_x_get_y",
        buy_quantity: 1,
        get_quantity: 1,
        get_percent: 100,
        category_slugs: ["abayas"],
      },
    ]);
    expect(
      (
        await preview([
          { product: ABAYA, qty: 1, price: 25 },
          { product: SCARF, qty: 1, price: 5 },
        ])
      ).offer_discount,
    ).toBe(0);
    expect((await preview([{ product: ABAYA, qty: 2, price: 25 }])).offer_discount).toBe(25);
  });
});

describe("which offer wins", () => {
  const cart = [{ product: ABAYA, qty: 2, price: 25 }]; // 50.000

  it("applies one price offer: the one that saves the most", async () => {
    await setOffers([
      { ...tenOff, name_en: "Ten" },
      { kind: "discount", name_en: "Seven", discount_type: "fixed", discount_value: 7 },
    ]);
    const out = await preview(cart);
    expect(out.offer_discount).toBe(7);
    expect(out.applied.map((a) => a.name_en)).toEqual(["Seven"]);
  });

  it("keeps whichever saves more against a code by default (the code on a tie)", async () => {
    await setOffers([tenOff]); // 5.000
    expect(await preview(cart, { code: "C3" })).toMatchObject({
      offer_discount: 5,
      code_discount: 0,
      code_dropped: true,
    });
    expect(await preview(cart, { code: "C8" })).toMatchObject({
      offer_discount: 0,
      code_discount: 8,
      code_kept: true,
    });
    expect(await preview(cart, { code: "C5" })).toMatchObject({
      offer_discount: 0,
      code_discount: 5,
    });
    // A code the store refuses is no code.
    expect(await preview(cart, { code: "BAD" })).toMatchObject({
      offer_discount: 5,
      code_dropped: false,
    });
  });

  it("keeps the code when the store puts codes first, and both when it lets them combine", async () => {
    await setOffers([tenOff], "code_first");
    expect(await preview(cart, { code: "C3" })).toMatchObject({
      offer_discount: 0,
      code_discount: 3,
    });
    expect(await preview(cart)).toMatchObject({ offer_discount: 5 });
    await setOffers([tenOff], "together");
    expect(await preview(cart, { code: "C3" })).toMatchObject({
      offer_discount: 5,
      code_discount: 3,
    });
    // Together they never take off more than the cart costs.
    expect(await preview(cart, { code: "C48" })).toMatchObject({
      offer_discount: 2,
      code_discount: 48,
    });
  });
});

describe("free delivery", () => {
  const freeOver30: Offer = { kind: "free_delivery", name_en: "Free delivery", min_subtotal: 30 };

  it("waives a delivery over its amount, alongside a code and a price offer", async () => {
    await setOffers([freeOver30, tenOff]);
    expect((await preview([{ product: DRESS, qty: 3, price: 8 }])).free_delivery).toBe(false);
    const out = await preview([{ product: ABAYA, qty: 2, price: 25 }], { code: "C8" });
    expect(out).toMatchObject({ free_delivery: true, code_discount: 8, offer_discount: 0 });
    expect(out.applied.map((a) => a.kind)).toEqual(["free_delivery"]);
  });

  it("is for a delivery, and for one at home unless the store says otherwise", async () => {
    await setOffers([freeOver30]);
    const cart = [{ product: ABAYA, qty: 2, price: 25 }];
    expect((await preview(cart, { fulfillment: "pickup" })).free_delivery).toBe(false);
    expect((await preview(cart, { country: "SA" })).free_delivery).toBe(false);
    expect((await preview(cart, { country: "BH" })).free_delivery).toBe(true);
    await setOffers([{ ...freeOver30, local_only: false }]);
    expect((await preview(cart, { country: "SA" })).free_delivery).toBe(true);
  });
});

describe("the order builder applies the same rule to the order it writes", () => {
  it("writes the offer into the order's discount and the tax follows it", async () => {
    await setOffers([tenOff]);
    const { answer, order } = await place([{ product: ABAYA, qty: 2, price: 25 }]);
    // 50.000 - 5.000 = 45.000, tax 4.500, delivery 2.000.
    expect(Number(order.discount)).toBe(5);
    expect(Number(order.offer_discount)).toBe(5);
    expect(Number(order.tax_amount)).toBe(4.5);
    expect(Number(order.total)).toBe(51.5);
    expect(answer).toMatchObject({ discount: 5, promo_code: null });
    expect(answer.offers).toEqual(order.applied_offers);
  });

  it("drops a code an offer beats, and keeps one that beats the offer", async () => {
    await setOffers([tenOff]);
    const beaten = await place([{ product: ABAYA, qty: 2, price: 25 }], { code: "C3" });
    expect(beaten.order).toMatchObject({ promo_code: null });
    expect(Number(beaten.order.discount)).toBe(5);
    const kept = await place([{ product: ABAYA, qty: 2, price: 25 }], { code: "C8" });
    expect(kept.order).toMatchObject({ promo_code: "C8" });
    expect(Number(kept.order.discount)).toBe(8);
    expect(Number(kept.order.offer_discount)).toBe(0);
    expect(kept.order.applied_offers).toEqual([]);
  });

  it("waives the delivery fee for a free-delivery offer, at home only", async () => {
    await setOffers([{ kind: "free_delivery", min_subtotal: 30 }]);
    const home = await place([{ product: ABAYA, qty: 2, price: 25 }]);
    expect(Number(home.order.shipping)).toBe(0);
    expect(Number(home.order.total)).toBe(55);
    const abroad = await place([{ product: ABAYA, qty: 2, price: 25 }], { country: "SA" });
    expect(Number(abroad.order.shipping)).toBe(2);
  });

  it("changes an order with no offer in nothing", async () => {
    await setOffers([]);
    const { order } = await place([{ product: ABAYA, qty: 2, price: 25 }], { code: "C3" });
    expect(order).toMatchObject({ promo_code: "C3", applied_offers: [] });
    expect([Number(order.discount), Number(order.shipping), Number(order.total)]).toEqual([
      3, 2, 53.7,
    ]);
  });
});

describe("what a visitor reaches", () => {
  it("previews only the store's own variants", async () => {
    await setOffers([tenOff]);
    const out = await preview([
      { product: ABAYA, qty: 2, price: 25 },
      { product: FOREIGN, qty: 1, price: 99 },
    ]);
    expect(out.offer_discount).toBe(5);
  });

  it("reads the live offers' terms, never another store's", async () => {
    await setOffers([tenOff, { ...tenOff, is_active: false, name_en: "Off" }]);
    const live = (
      await db.query<{ r: Array<{ name_en: string }> }>(
        "SELECT public.storefront_active_offers('store') AS r",
      )
    ).rows[0].r;
    expect(live.map((o) => o.name_en)).toEqual(["10% off"]);
    const other = (
      await db.query<{ r: unknown[] }>("SELECT public.storefront_active_offers('other') AS r")
    ).rows[0].r;
    expect(other).toEqual([]);
  });

  it("lets only the server apply offers to an order, and refuses a huge cart", async () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.apply_store_offers\(uuid, text, text\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(/REVOKE ALL ON public\.store_offers FROM anon;/);
    const many = Array.from({ length: 101 }, () => ({ product: DRESS, qty: 1, price: 8 }));
    await expect(preview(many)).rejects.toThrow(/INVALID_ITEMS/);
  });
});

describe("the checkout's entry point", () => {
  const ADDED = [
    `-- ADDED (20261027100000) v_offers jsonb;`,
    `-- ADDED (20261027100000): the store's automatic offers, worked out from the order's own lines -- against its promo code; a free-delivery offer waives the fee. The order's discount is read -- again for the tax below. v_offers := public.apply_store_offers( v_order_id, p_fulfillment, NULLIF(upper(btrim(COALESCE(p_customer ->> 'country_code', ''))), '') ); IF COALESCE((v_offers ->> 'free_delivery')::boolean, false) THEN v_shipping_fee := 0; END IF; SELECT * INTO v_order FROM public.orders WHERE id = v_order_id;`,
    `, -- ADDED (20261027100000) 'discount', v_order.discount, 'promo_code', v_order.promo_code, 'offers', COALESCE(v_offers -> 'applied', '[]'::jsonb)`,
  ];

  it("is the live builder with the offers added and nothing else changed", () => {
    let after = squash(builderOf(migration));
    for (const added of ADDED) {
      expect(after).toContain(added);
      after = after.replace(added, "");
    }
    expect(after.replace(/\s+/g, " ")).toBe(squash(builderOf(previous)));
  });
});
