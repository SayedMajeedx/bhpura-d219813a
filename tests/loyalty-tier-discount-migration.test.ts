import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import storeOffers from "../supabase/migrations/20261027100000_store_offers.sql?raw";
import area from "../supabase/migrations/20261205100000_free_delivery_by_area.sql?raw";
import byKind from "../supabase/migrations/20261208100000_offers_by_kind_of_piece.sql?raw";
import wording from "../supabase/migrations/20261209100000_offer_own_wording.sql?raw";
import migration from "../supabase/migrations/20261227100000_loyalty_tier_discount.sql?raw";
import { memberTierDiscount } from "../src/lib/loyalty-tier-discount";

// A loyalty tier's discount (migration 20261227100000), in a real Postgres over the offers engine:
// the signed-in member gets the larger of their tier's discount and what the code and the offers
// take off (the owner's decision of 2026-11-27), never both; a free-delivery offer still stands.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const ABAYA = "00000000-0000-4000-8000-00000000a001";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const SHOPPER = "00000000-0000-4000-8000-0000000000a1";
const STRANGER = "00000000-0000-4000-8000-0000000000a2";
const ORDER = "00000000-0000-4000-8000-0000000000d1";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql
      AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
    CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, is_active boolean);
    INSERT INTO public.brands VALUES ('${BRAND}', 'store', true);
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY,
      default_tax_rate numeric(5,2) NOT NULL DEFAULT 10, vat_inclusive boolean DEFAULT false,
      advance_allow_full_payment boolean DEFAULT true);
    INSERT INTO public.business_settings (brand_id) VALUES ('${BRAND}');
    CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid, category text,
      is_made_to_order boolean NOT NULL DEFAULT false);
    INSERT INTO public.products VALUES ('${ABAYA}', '${BRAND}', 'abayas', false);
    CREATE TABLE public.product_variants (id uuid PRIMARY KEY, brand_id uuid, product_id uuid,
      selling_price numeric(14,3), original_price numeric(14,3));
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
    INSERT INTO public.customers VALUES ('${CUSTOMER}', '${SHOPPER}');
    CREATE TABLE public.loyalty_accounts (brand_id uuid, customer_id uuid, current_tier_key text);
    INSERT INTO public.loyalty_accounts VALUES ('${BRAND}', '${CUSTOMER}', 'gold');
    CREATE TABLE public.brand_loyalty_tiers (brand_id uuid, tier_key text, name_ar text,
      name_en text, free_shipping boolean DEFAULT false, discount_percent numeric DEFAULT 0);
    INSERT INTO public.brand_loyalty_tiers (brand_id, tier_key, name_ar, name_en, discount_percent)
      VALUES ('${BRAND}', 'gold', 'ذهبي', 'Gold', 10);
    CREATE TABLE public.brand_loyalty_programs (brand_id uuid, is_enabled boolean);
    INSERT INTO public.brand_loyalty_programs VALUES ('${BRAND}', true);
    CREATE FUNCTION public.advance_full_payment_rules() RETURNS jsonb LANGUAGE sql
      AS $$ SELECT '[]'::jsonb $$;
    CREATE FUNCTION public.assign_order_pickup_partner(uuid, uuid) RETURNS void LANGUAGE sql
      AS $$ SELECT $$;
    CREATE FUNCTION public.set_order_requested_time(uuid, text, text) RETURNS void LANGUAGE sql
      AS $$ SELECT $$;
    CREATE FUNCTION public.storefront_delivery_fee(uuid, text, text, integer) RETURNS numeric
      LANGUAGE sql AS $$ SELECT 2::numeric $$;
    CREATE FUNCTION public.validate_promo_code(p_brand_slug text, p_code text, p_subtotal numeric,
      p_items jsonb DEFAULT NULL, p_customer_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql
      AS $$ SELECT jsonb_build_object('valid', true, 'discount_amount', 0) $$;
    CREATE FUNCTION public.place_storefront_order_core(p_brand_slug text, p_customer jsonb,
      p_items jsonb, p_payment_method text, p_notes text, p_fulfillment text, p_branch_id uuid,
      p_digital_channel text, p_digital_contact text, p_promo_code text)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
  `);
  await db.exec(storeOffers);
  await db.exec(area);
  await db.exec(byKind);
  await db.exec(wording);
  await db.exec(migration);
});

beforeEach(async () => {
  await db.exec(`
    DELETE FROM public.store_offers; DELETE FROM public.order_items; DELETE FROM public.orders;
    UPDATE public.brand_loyalty_programs SET is_enabled = true;
    SELECT set_config('test.uid', '${SHOPPER}', false);
    SELECT set_config('boutq.booking_order', 'off', false);
  `);
});

/** An order of 50.000 of abayas for the customer, with a typed code worth `code`. */
async function order(code = 0) {
  await db.query(
    `INSERT INTO public.orders (id, brand_id, customer_id, subtotal, discount, promo_code, promo_code_id, total)
     VALUES ($1, $2, $3, 50, $4::numeric, $5, $6, 50 - $4::numeric)`,
    [
      ORDER,
      BRAND,
      CUSTOMER,
      code,
      code > 0 ? `C${code}` : null,
      code > 0 ? "00000000-0000-4000-8000-0000000000e9" : null,
    ],
  );
  await db.query(
    `INSERT INTO public.order_items (order_id, product_id, quantity, line_total) VALUES ($1, $2, 2, 50)`,
    [ORDER, ABAYA],
  );
}
async function offer(values: Record<string, unknown>) {
  const columns = Object.keys(values);
  await db.query(
    `INSERT INTO public.store_offers (brand_id, created_at, ${columns.join(", ")})
     VALUES ($1, now() - interval '1 hour', ${columns.map((_, i) => `$${i + 2}`).join(", ")})`,
    [BRAND, ...columns.map((c) => values[c])],
  );
}
async function apply() {
  const out = (
    await db.query<{ r: Record<string, unknown> }>(
      `SELECT public.apply_store_offers($1, 'delivery', 'BH') AS r`,
      [ORDER],
    )
  ).rows[0].r;
  const row = (
    await db.query<Record<string, string | null>>(
      `SELECT discount, offer_discount, tier_discount, promo_code, applied_offers::text AS applied
         FROM public.orders WHERE id = $1`,
      [ORDER],
    )
  ).rows[0];
  return {
    out,
    discount: Number(row.discount),
    offer: Number(row.offer_discount),
    tier: Number(row.tier_discount),
    code: row.promo_code,
    applied: JSON.parse(row.applied ?? "[]") as Array<{ kind: string }>,
  };
}

describe("a member's tier discount", () => {
  it("is taken when nothing else is", async () => {
    await order();
    const r = await apply();
    expect(r).toMatchObject({ discount: 5, tier: 5, offer: 0 });
    expect(r.out).toMatchObject({ tier_discount: 5 });
  });

  it("replaces a code that saves less, leaving the code unused", async () => {
    await order(3);
    expect(await apply()).toMatchObject({ discount: 5, tier: 5, code: null });
  });

  it("gives way to a code that saves more", async () => {
    await order(8);
    expect(await apply()).toMatchObject({ discount: 8, tier: 0, code: "C8" });
  });

  it("gives way to the store's offer when it saves more, and replaces it when it saves less", async () => {
    await offer({
      kind: "discount",
      name_en: "Eid",
      discount_type: "percentage",
      discount_value: 20,
    });
    await order();
    expect(await apply()).toMatchObject({ discount: 10, offer: 10, tier: 0 });

    await db.exec(
      `DELETE FROM public.order_items; DELETE FROM public.orders; DELETE FROM public.store_offers;`,
    );
    await offer({
      kind: "discount",
      name_en: "Small",
      discount_type: "percentage",
      discount_value: 4,
    });
    await order();
    const r = await apply();
    expect(r).toMatchObject({ discount: 5, offer: 0, tier: 5 });
    expect(r.applied).toEqual([]);
  });

  it("keeps a free-delivery offer when it replaces the rest", async () => {
    await offer({ kind: "free_delivery", name_en: "Free delivery", min_subtotal: 30 });
    await offer({
      kind: "discount",
      name_en: "Small",
      discount_type: "percentage",
      discount_value: 4,
    });
    await order();
    const r = await apply();
    expect(r).toMatchObject({ discount: 5, tier: 5 });
    expect(r.applied.map((a) => a.kind)).toEqual(["free_delivery"]);
    expect(r.out.free_delivery).toBe(true);
  });

  it("is only the signed-in member's own, while the programme is on, and never a booking's", async () => {
    await order();
    await db.exec(`SELECT set_config('test.uid', '', false)`);
    expect((await apply()).tier).toBe(0);

    await db.exec(`UPDATE public.orders SET discount = 0, tier_discount = 0`);
    await db.exec(`SELECT set_config('test.uid', '${STRANGER}', false)`);
    expect((await apply()).tier).toBe(0);

    await db.exec(`UPDATE public.orders SET discount = 0, tier_discount = 0`);
    await db.exec(`SELECT set_config('test.uid', '${SHOPPER}', false)`);
    await db.exec(`UPDATE public.brand_loyalty_programs SET is_enabled = false`);
    expect((await apply()).tier).toBe(0);

    await db.exec(`UPDATE public.brand_loyalty_programs SET is_enabled = true`);
    await db.exec(`SELECT set_config('boutq.booking_order', 'on', false)`);
    expect((await apply()).tier).toBe(0);
  });

  it("is worked out the same way by the checkout's preview", async () => {
    for (const [subtotal, percent, code, offers] of [
      [50, 10, 0, 0],
      [50, 10, 3, 0],
      [50, 10, 8, 0],
      [33.333, 7.5, 0, 2],
      [12.345, 15, 1, 0.5],
    ]) {
      const row = (
        await db.query<{ amount: string }>(`SELECT round($1::numeric * $2 / 100, 3) AS amount`, [
          subtotal,
          percent,
        ])
      ).rows[0];
      const sql = Number(row.amount);
      const preview = memberTierDiscount({ subtotal, percent, code, offers });
      if (sql > code + offers) {
        expect(preview).toEqual({ code: 0, offers: 0, tier: sql });
      } else {
        expect(preview).toEqual({ code, offers, tier: 0 });
      }
    }
  });
});

describe("who may call it", () => {
  it("is the order builder's, never a browser's", async () => {
    const rights = await db.query(
      `SELECT 1 FROM information_schema.routine_privileges
        WHERE grantee IN ('anon', 'authenticated', 'PUBLIC')
          AND routine_name IN ('member_tier_discount', 'apply_store_offers')`,
    );
    expect(rights.rows).toEqual([]);
  });
});
