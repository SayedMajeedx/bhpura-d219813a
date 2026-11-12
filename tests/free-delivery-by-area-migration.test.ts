import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import storeOffers from "../supabase/migrations/20261027100000_store_offers.sql?raw";
import migration from "../supabase/migrations/20261205100000_free_delivery_by_area.sql?raw";

// Free delivery for chosen areas (migration 20261205100000) in a real Postgres, over the store
// offers engine (20261027100000) and its order builder: an offer that names areas waives the fee
// of a delivery in Bahrain to one of them (read from the order's own address), and nothing else;
// the checkout's preview says the same for the area the shopper chose; old pages that call the
// preview with five arguments still reach it; a visitor reads the areas with the offer.
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
  await db.exec(migration);
});

type Offer = Record<string, unknown>;

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

const CART = [{ product_id: ABAYA, variant_id: variantOf(ABAYA), quantity: 1, line_total: 25 }];

const SADAD_AND_AROUND = [
  "sadad",
  "dumistan",
  "malikiya",
  "shahrakan",
  "karzakan",
  "dar_kulaib",
  "hamad_town",
];
const areaOffer: Offer = {
  kind: "free_delivery",
  name_en: "Sadad week",
  regions: SADAD_AND_AROUND,
};

type Outcome = { free_delivery: boolean; offer_discount: number; applied: Array<{ kind: string }> };

async function preview(
  region: string | null,
  country: string | null = "BH",
  fulfillment = "delivery",
) {
  const r = await db.query<{ r: Outcome }>(
    "SELECT public.storefront_offers_preview('store', $1::jsonb, NULL, $2, $3, $4) AS r",
    [JSON.stringify(CART), fulfillment, country, region],
  );
  return r.rows[0].r;
}

/** The order the builder writes for a delivery to this address. */
async function place(customer: Record<string, unknown>) {
  const result = await db.query<{ r: Record<string, unknown> }>(
    `SELECT public.place_storefront_order('store', $1::jsonb, $2::jsonb, 'cod', NULL,
       'delivery', NULL, NULL, NULL, NULL) AS r`,
    [JSON.stringify(customer), JSON.stringify(CART)],
  );
  const id = result.rows[0].r.order_id;
  return (
    await db.query<{ shipping: string; applied_offers: Array<{ kind: string }> }>(
      "SELECT shipping, applied_offers FROM public.orders WHERE id = $1",
      [id],
    )
  ).rows[0];
}

describe("an offer for chosen areas", () => {
  it("waives the delivery fee of an order to one of its areas, read from the order's address", async () => {
    await setOffers([areaOffer]);
    const sadad = await place({ country_code: "BH", region: "sadad" });
    expect(Number(sadad.shipping)).toBe(0);
    expect(sadad.applied_offers.map((o) => o.kind)).toEqual(["free_delivery"]);
    expect(Number((await place({ country_code: "BH", region: "hamad_town" })).shipping)).toBe(0);
  });

  it("leaves the fee of every other area, of an address with no area and of a delivery abroad", async () => {
    await setOffers([areaOffer]);
    expect(Number((await place({ country_code: "BH", region: "manama" })).shipping)).toBe(2);
    expect(Number((await place({ country_code: "BH" })).shipping)).toBe(2);
    // An address abroad that happens to carry an area value is not in Bahrain's areas.
    expect(Number((await place({ country_code: "SA", region: "sadad" })).shipping)).toBe(2);
  });

  it("keeps an offer with no areas for every area, beside an area offer", async () => {
    await setOffers([areaOffer, { kind: "free_delivery", min_subtotal: 20 }]);
    expect(Number((await place({ country_code: "BH", region: "manama" })).shipping)).toBe(0);
  });

  it("previews the same for the area the shopper chose", async () => {
    await setOffers([
      areaOffer,
      { kind: "discount", discount_type: "percentage", discount_value: 10 },
    ]);
    expect((await preview("sadad")).free_delivery).toBe(true);
    expect((await preview("karzakan")).free_delivery).toBe(true);
    expect((await preview("manama")).free_delivery).toBe(false);
    expect((await preview(null)).free_delivery).toBe(false);
    expect((await preview("sadad", "SA")).free_delivery).toBe(false);
    expect((await preview("sadad", "BH", "pickup")).free_delivery).toBe(false);
    // The price offer goes on whatever the area.
    expect(Number((await preview("manama")).offer_discount)).toBe(2.5);
  });

  it("answers a page that still calls the preview with five arguments", async () => {
    await setOffers([areaOffer]);
    const r = await db.query<{ r: Outcome }>(
      "SELECT public.storefront_offers_preview(p_brand_slug => 'store', p_items => $1::jsonb, p_promo_code => NULL, p_fulfillment => 'delivery', p_country => 'BH') AS r",
      [JSON.stringify(CART)],
    );
    expect(r.rows[0].r.free_delivery).toBe(false);
    const count = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'storefront_offers_preview'",
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("is a visitor's to read, with its areas", async () => {
    await setOffers([areaOffer]);
    const r = await db.query<{ r: Array<{ regions: string[] }> }>(
      "SELECT public.storefront_active_offers('store') AS r",
    );
    expect(r.rows[0].r[0].regions).toEqual(SADAD_AND_AROUND);
    const grant = await db.query<{ ok: boolean }>(
      "SELECT has_function_privilege('anon', 'public.storefront_offers_preview(text, jsonb, text, text, text, text)', 'EXECUTE') AS ok",
    );
    expect(grant.rows[0].ok).toBe(true);
  });
});

describe("what the table holds", () => {
  it("keeps areas to free-delivery offers, and bounded", async () => {
    await expect(
      setOffers([
        { kind: "discount", discount_type: "percentage", discount_value: 5, regions: ["sadad"] },
      ]),
    ).rejects.toThrow(/store_offers_regions_shape/);
    await expect(
      setOffers([
        { kind: "free_delivery", regions: Array.from({ length: 151 }, (_, i) => `a${i}`) },
      ]),
    ).rejects.toThrow(/store_offers_regions_shape/);
  });

  it("is not for a browser to filter by itself", async () => {
    const r = await db.query<{ ok: boolean }>(
      "SELECT has_function_privilege('anon', 'public.store_offers_for_area(jsonb, text, text)', 'EXECUTE') AS ok",
    );
    expect(r.rows[0].ok).toBe(false);
  });
});
