import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import storeOffers from "../supabase/migrations/20261027100000_store_offers.sql?raw";
import area from "../supabase/migrations/20261205100000_free_delivery_by_area.sql?raw";
import migration from "../supabase/migrations/20261208100000_offers_by_kind_of_piece.sql?raw";
import wording from "../supabase/migrations/20261209100000_offer_own_wording.sql?raw";

// Offers by the kind of piece, and each piece's best offer (migration 20261208100000), in a real
// Postgres over the offers engine (20261027100000, 20261205100000): an offer on ready pieces never
// reaches a piece tailored to the customer, and the reverse; each piece takes the best percentage
// that reaches it, each offer capped on its own pieces; a fixed amount or buy X get Y still stands
// alone and wins when it saves more; a typed code is weighed against the total as before; the
// order builder's step reads the line's own mark (location 'custom') and the checkout's preview
// works it out from the cart as the builder does (tailored: false is a ready size).
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const ABAYA = "00000000-0000-4000-8000-00000000a001";
const ABAYA_2 = "00000000-0000-4000-8000-00000000a002";
const DRESS = "00000000-0000-4000-8000-00000000d001";
const SCARF = "00000000-0000-4000-8000-00000000f001";
const FOREIGN = "00000000-0000-4000-8000-00000000e001";
const variantOf = (product: string) => product.replace(/(.{8})$/, (tail) => `9${tail.slice(1)}`);

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
    CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid, category text,
      is_made_to_order boolean NOT NULL DEFAULT false);
    INSERT INTO public.products VALUES ('${ABAYA}', '${BRAND}', 'abayas', true),
      ('${ABAYA_2}', '${BRAND}', 'abayas', true), ('${DRESS}', '${BRAND}', 'dresses', false),
      ('${SCARF}', '${BRAND}', NULL, false), ('${FOREIGN}', '${OTHER}', 'abayas', false);
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
      quantity integer NOT NULL DEFAULT 1, line_total numeric(14,3) NOT NULL DEFAULT 0,
      location text);
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
      -- The address as the snapshot trigger copies it onto the order: its area.
      INSERT INTO public.orders (brand_id, subtotal, discount, promo_code, promo_code_id, total,
        delivery_address_snapshot)
      VALUES ('${BRAND}', v_sub, v_code, p_promo_code,
        CASE WHEN p_promo_code IS NULL THEN NULL ELSE gen_random_uuid() END, v_sub - v_code,
        CASE WHEN p_customer ? 'region' THEN jsonb_build_object('region', p_customer ->> 'region') END)
      RETURNING id INTO v_id;
      INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, line_total)
      SELECT v_id, (i->>'product_id')::uuid, (i->>'variant_id')::uuid, (i->>'quantity')::int,
             (i->>'line_total')::numeric
        FROM jsonb_array_elements(p_items) i;
      RETURN jsonb_build_object('success', true, 'order_id', v_id, 'discount', v_code);
    END $$;
  `);
  await db.exec(storeOffers);
  await db.exec(area);
  await db.exec(migration);
  await db.exec(wording);
});

type Offer = Record<string, unknown>;
type Applied = { id: string; kind: string; name_en: string; amount: number };
type Outcome = {
  offer_discount: number;
  code_discount: number;
  code_kept: boolean;
  free_delivery: boolean;
  applied: Applied[];
};

async function setOffers(offers: Offer[]) {
  await db.query("DELETE FROM public.store_offers");
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

type Line = { product: string; total: number; madeToOrder?: boolean };
const lines = (list: Line[]) =>
  JSON.stringify(
    list.map((l) => ({
      product_id: l.product,
      category: l.product === DRESS ? "dresses" : "abayas",
      quantity: 1,
      line_total: l.total,
      on_sale: false,
      made_to_order: l.madeToOrder ?? false,
    })),
  );

async function outcome(list: Line[], code = 0, mode = "best") {
  const r = await db.query<{ r: Outcome }>(
    `SELECT public.store_offers_outcome(public.store_offers_live($1), $2::jsonb, $3, $4,
       'delivery', 'BH') AS r`,
    [BRAND, lines(list), mode, code],
  );
  const out = r.rows[0].r;
  return {
    ...out,
    offer_discount: Number(out.offer_discount),
    code_discount: Number(out.code_discount),
    applied: out.applied.map((a) => ({ ...a, amount: Number(a.amount) })),
  };
}

const launch: Offer = {
  kind: "discount",
  name_en: "Launch",
  discount_type: "percentage",
  discount_value: 20,
};
const partner: Offer = {
  kind: "discount",
  name_en: "Partner shop sale",
  discount_type: "percentage",
  discount_value: 30,
  product_ids: [ABAYA],
  pieces: "ready",
};
const mixedCart: Line[] = [
  { product: ABAYA, total: 25 },
  { product: ABAYA_2, total: 30, madeToOrder: true },
];

describe("an offer for one kind of piece", () => {
  it("on ready pieces reaches a ready piece and never one tailored to the customer", async () => {
    await setOffers([partner]);
    expect((await outcome([{ product: ABAYA, total: 25 }])).offer_discount).toBe(7.5);
    expect((await outcome([{ product: ABAYA, total: 25, madeToOrder: true }])).offer_discount).toBe(
      0,
    );
  });

  it("on made-to-order pieces reaches only those", async () => {
    await setOffers([{ ...launch, name_en: "Tailoring week", pieces: "made_to_order" }]);
    expect((await outcome([{ product: ABAYA, total: 25, madeToOrder: true }])).offer_discount).toBe(
      5,
    );
    expect((await outcome([{ product: ABAYA, total: 25 }])).offer_discount).toBe(0);
  });

  it("asks its minimum of the pieces it reaches only", async () => {
    await setOffers([{ ...partner, product_ids: [], min_subtotal: 30 }]);
    // 25 ready and 20 tailored: only the 25 counts toward the 30.
    const cart: Line[] = [
      { product: ABAYA, total: 25 },
      { product: ABAYA_2, total: 20, madeToOrder: true },
    ];
    expect((await outcome(cart)).offer_discount).toBe(0);
    expect((await outcome([...cart, { product: DRESS, total: 8 }])).offer_discount).toBe(9.9);
  });

  it("reaches any piece unless it says otherwise, as offers made before do", async () => {
    await setOffers([launch]);
    const r = await db.query<{ pieces: string }>("SELECT pieces FROM public.store_offers");
    expect(r.rows[0].pieces).toBe("any");
    expect((await outcome([{ product: ABAYA, total: 25, madeToOrder: true }])).offer_discount).toBe(
      5,
    );
  });

  it("refuses a kind it does not know", async () => {
    await expect(setOffers([{ ...launch, pieces: "partner" }])).rejects.toThrow();
  });
});

describe("each piece takes its best offer", () => {
  it("gives the partner piece 30% and the tailored abaya the store's 20%, together", async () => {
    await setOffers([launch, partner]);
    const out = await outcome(mixedCart);
    // 30% of 25 and 20% of 30: one offer per order gave 6 + 5 = 11 or 7.5 alone.
    expect(out.offer_discount).toBe(13.5);
    expect(out.applied.map((a) => [a.name_en, a.amount])).toEqual([
      ["Launch", 6],
      ["Partner shop sale", 7.5],
    ]);
  });

  it("caps each offer on the pieces it took", async () => {
    await setOffers([{ ...launch, max_discount: 3 }, partner]);
    expect((await outcome(mixedCart)).offer_discount).toBe(10.5);
  });

  it("gives a piece the older offer on a tie", async () => {
    await setOffers([launch, { ...partner, discount_value: 20, name_en: "Same" }]);
    const out = await outcome([
      { product: ABAYA, total: 25 },
      { product: DRESS, total: 10 },
    ]);
    expect(out.applied).toEqual([expect.objectContaining({ name_en: "Launch", amount: 7 })]);
  });

  it("lets a fixed amount off stand alone, and win when it saves more", async () => {
    await setOffers([
      launch,
      partner,
      { kind: "discount", name_en: "Big", discount_type: "fixed", discount_value: 15 },
    ]);
    const out = await outcome(mixedCart);
    expect(out.offer_discount).toBe(15);
    expect(out.applied.map((a) => a.name_en)).toEqual(["Big"]);
  });

  it("weighs a typed code against the offers' total, as before", async () => {
    await setOffers([launch, partner]);
    expect(await outcome(mixedCart, 14)).toMatchObject({ offer_discount: 0, code_kept: true });
    expect(await outcome(mixedCart, 10)).toMatchObject({ offer_discount: 13.5, code_kept: false });
    // Together, the offers fill what the code leaves of the 55, the last ones trimmed first.
    const together = await outcome(mixedCart, 50, "together");
    expect(together.offer_discount).toBe(5);
    expect(together.applied.map((a) => [a.name_en, a.amount])).toEqual([["Launch", 5]]);
  });
});

describe("the order builder's step and the checkout's preview", () => {
  it("reads an order line's own mark", async () => {
    await setOffers([launch, partner]);
    const order = await db.query<{ id: string }>(
      "INSERT INTO public.orders (brand_id, subtotal, total) VALUES ($1, 55, 55) RETURNING id",
      [BRAND],
    );
    const id = order.rows[0].id;
    await db.query(
      `INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, line_total, location)
       VALUES ($1, $2, $3, 1, 25, 'main'), ($1, $4, $5, 1, 30, 'custom')`,
      [id, ABAYA, variantOf(ABAYA), ABAYA_2, variantOf(ABAYA_2)],
    );
    await db.query("SELECT public.apply_store_offers($1, 'delivery', 'BH')", [id]);
    const row = await db.query<{ offer_discount: string; applied_offers: Applied[] }>(
      "SELECT offer_discount, applied_offers FROM public.orders WHERE id = $1",
      [id],
    );
    expect(Number(row.rows[0].offer_discount)).toBe(13.5);
    expect(row.rows[0].applied_offers).toHaveLength(2);
  });

  it("works a cart line out as the builder will write it", async () => {
    await setOffers([partner]);
    const preview = async (item: Record<string, unknown>) => {
      const r = await db.query<{ r: Outcome }>(
        "SELECT public.storefront_offers_preview('store', $1::jsonb, NULL, 'delivery', 'BH', NULL) AS r",
        [JSON.stringify([{ variant_id: variantOf(ABAYA), quantity: 1, line_total: 25, ...item }])],
      );
      return Number(r.rows[0].r.offer_discount);
    };
    // A made-to-order product's ready size, and the same tailored (an older page sends nothing,
    // read as tailored, as the builder reads it).
    expect(await preview({ tailored: false })).toBe(7.5);
    expect(await preview({ tailored: true })).toBe(0);
    expect(await preview({})).toBe(0);
  });

  it("tells a visitor which pieces an offer is for", async () => {
    await setOffers([partner]);
    const r = await db.query<{ r: Array<{ pieces: string }> }>(
      "SELECT public.storefront_active_offers('store') AS r",
    );
    expect(r.rows[0].r[0].pieces).toBe("ready");
  });
});

describe("an offer's own wording (20261209100000)", () => {
  it("is what a visitor reads, empty until written, and kept short", async () => {
    await setOffers([{ ...partner, terms_en: "Dar Lulwa week: 30% off the abayas on the shelf" }]);
    const r = await db.query<{ r: Array<{ terms_ar: string; terms_en: string; pieces: string }> }>(
      "SELECT public.storefront_active_offers('store') AS r",
    );
    expect(r.rows[0].r[0]).toMatchObject({
      terms_ar: "",
      terms_en: "Dar Lulwa week: 30% off the abayas on the shelf",
      pieces: "ready",
    });
    await expect(setOffers([{ ...partner, terms_ar: "x".repeat(141) }])).rejects.toThrow();
  });
});
