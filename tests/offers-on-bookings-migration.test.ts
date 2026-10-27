import { beforeAll, describe, expect, it, vi } from "vitest";
import depositMigration from "../supabase/migrations/20261023100000_booking_transfer_deposit.sql?raw";
import lineNames from "../supabase/migrations/20261025120000_order_line_names.sql?raw";
import storeOffers from "../supabase/migrations/20261027100000_store_offers.sql?raw";
import migration from "../supabase/migrations/20261028120000_offers_on_bookings.sql?raw";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";
import { PAYMENTS, syncTrigger } from "./helpers/booking-checkout-db";
import { betterBookingOffer, bookingWithCode } from "../src/lib/bookings/booking-offer";

// A store's automatic offers reach a shopper's booking (migration 20261028120000, the owner's
// decision of 2026-10-27), run for real in Postgres (PGlite) through the booking engine's own
// hold and order functions: the better of the booking offers and the automatic offers is the
// booking's discount (a booking offer on a tie), the order builder does not apply them again, and
// a store offer meets a typed code by the store's rule. The twins on screen are checked beside.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let db: EngineDb;

/** The offers' table, columns and rule as migration 20261027100000 made them. */
function offersEngine(): string {
  const table = storeOffers.slice(
    storeOffers.indexOf("CREATE TABLE IF NOT EXISTS public.store_offers ("),
    storeOffers.indexOf("CREATE INDEX IF NOT EXISTS store_offers_brand_idx"),
  );
  const columns = storeOffers.slice(
    storeOffers.indexOf("ALTER TABLE public.business_settings"),
    storeOffers.indexOf("-- ── The rule"),
  );
  const rule = storeOffers.slice(
    storeOffers.indexOf("-- ── The rule"),
    storeOffers.indexOf("CREATE OR REPLACE FUNCTION public.apply_store_offers"),
  );
  return table + columns + rule;
}

beforeAll(async () => {
  db = await createEngineDb();
  await db.pg.exec(PAYMENTS);
  await db.pg.exec(syncTrigger());
  await db.pg.exec(depositMigration);
  await db.pg.exec(lineNames);
  await db.pg.exec(`
    ALTER TABLE public.orders ADD COLUMN promo_code text, ADD COLUMN promo_code_id uuid;
    ALTER TABLE public.products ADD COLUMN category text;
    ALTER TABLE public.product_variants ADD COLUMN original_price numeric;
  `);
  await db.pg.exec(offersEngine());
  // The order builder with a promo code: CODE<n> takes n off (the real one checks the code).
  await db.pg.exec(`
    CREATE OR REPLACE FUNCTION public.place_storefront_order(
      p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text,
      p_notes text DEFAULT NULL, p_fulfillment text DEFAULT 'delivery', p_branch_id uuid DEFAULT NULL,
      p_digital_channel text DEFAULT NULL, p_digital_contact text DEFAULT NULL,
      p_promo_code text DEFAULT NULL, p_benefit_receipt_id uuid DEFAULT NULL,
      p_shipping_fee numeric DEFAULT NULL, p_shipping_zone text DEFAULT NULL,
      p_idempotency_key text DEFAULT NULL
    ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
    DECLARE v_brand uuid; v_order uuid; v_sum numeric := 0; v_line jsonb; v_variant record;
      v_code numeric := COALESCE(NULLIF(substring(p_promo_code from 'CODE([0-9]+)'), '')::numeric, 0);
    BEGIN
      SELECT id INTO v_brand FROM public.brands WHERE slug = p_brand_slug;
      INSERT INTO public.orders (brand_id, status, fulfillment_method, customer_name_snapshot,
        customer_phone_snapshot, invoice_number, channel, payment_method)
      VALUES (v_brand, 'pending', 'appointment', p_customer ->> 'name', p_customer ->> 'phone', 0,
        'storefront', p_payment_method)
      RETURNING id INTO v_order;
      FOR v_line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT v.id, v.product_id, v.selling_price, p.name INTO v_variant
          FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
         WHERE v.id = (v_line ->> 'variant_id')::uuid;
        INSERT INTO public.order_items (order_id, brand_id, product_id, variant_id, description,
          quantity, unit_price, line_total)
        VALUES (v_order, v_brand, v_variant.product_id, v_variant.id, v_variant.name,
          (v_line ->> 'quantity')::integer, v_variant.selling_price,
          v_variant.selling_price * (v_line ->> 'quantity')::integer);
        v_sum := v_sum + v_variant.selling_price * (v_line ->> 'quantity')::integer;
      END LOOP;
      UPDATE public.orders SET subtotal = v_sum, discount = LEAST(v_code, v_sum),
        total = v_sum - LEAST(v_code, v_sum),
        promo_code = CASE WHEN v_code > 0 THEN p_promo_code END
       WHERE id = v_order;
      -- As the real builder: the store's automatic offers on the order's lines.
      PERFORM public.apply_store_offers(v_order, p_fulfillment, NULL);
      RETURN jsonb_build_object('order_id', v_order, 'total', v_sum);
    END $function$;
  `);
  // The live apply_store_offers before this migration, then the migration.
  await db.pg.exec(
    storeOffers.slice(
      storeOffers.indexOf("CREATE OR REPLACE FUNCTION public.apply_store_offers"),
      storeOffers.indexOf("REVOKE ALL ON FUNCTION public.apply_store_offers"),
    ),
  );
  await db.pg.exec(migration);
});

/** A store with a 100 BHD booth and a last-minute booking offer of `ruleOff`%. */
async function store(ruleOff = 0) {
  const brand = await db.store({ dailyCapacity: 5, leadDays: 0, holdMinutes: 15 });
  const slug = await db.slugOf(brand);
  await db.pg.query("update business_settings set storefront_mode = 'shop' where brand_id = $1", [
    brand,
  ]);
  const booth = await db.service(brand, { name: "Booth", price: 100 });
  if (ruleOff > 0) {
    await db.pg.query(
      `insert into booking_discount_rules (brand_id, name_en, name_ar, kind, value, min_days, max_days)
       values ($1, 'Last minute', 'اللحظة الأخيرة', 'percent', $2, 0, 14)`,
      [brand, ruleOff],
    );
  }
  return { brand, slug, booth };
}

async function offer(brand: string, percent: number, fields: Record<string, unknown> = {}) {
  const row = await db.one<{ id: string }>(
    `insert into store_offers (brand_id, kind, name_en, name_ar, discount_type, discount_value,
       starts_at, product_ids)
     values ($1, 'discount', $3, $4, 'percentage', $2, now() - interval '1 hour', $5::uuid[])
     returning id`,
    [brand, percent, fields.name_en ?? "", fields.name_ar ?? "", fields.product_ids ?? []],
  );
  return row.id;
}

type Held = {
  booking_id: string;
  hold_token: string;
  discount: number;
  total: number;
  discount_label_en: string | null;
  discount_label_ar: string | null;
  discount_from_offer: boolean;
  offers_combine: string;
};

async function hold(s: Awaited<ReturnType<typeof store>>) {
  const row = await db.one<{ hold_booking: Held }>(
    `select hold_booking($1, $2::date, '12:00'::time, 120, $3::jsonb, $4::jsonb, '{}'::jsonb, null)`,
    [
      s.brand,
      db.day(3),
      JSON.stringify([{ product_id: s.booth.id, variant_id: s.booth.variantId }]),
      JSON.stringify({ name: "Sara", phone: "39990017" }),
    ],
  );
  return row.hold_booking;
}

async function place(s: Awaited<ReturnType<typeof store>>, held: Held, code: string | null = null) {
  const row = await db.one<{ place_booking_order: { order_id: string } }>(
    `select place_booking_order($1, $2::uuid, $3, $4::jsonb, $5::jsonb, 'cod', null, 'delivery',
       null, null, null, $6)`,
    [
      held.booking_id,
      held.hold_token,
      s.slug,
      JSON.stringify({ name: "Sara", phone: "39990017" }),
      JSON.stringify([{ variant_id: s.booth.variantId, quantity: 1 }]),
      code,
    ],
  );
  return db.one<{
    discount: string;
    offer_discount: string;
    applied_offers: Array<{ id: string; amount: number; name_en: string }>;
    promo_code: string | null;
    total: string;
  }>(
    "select discount, offer_discount, applied_offers, promo_code, total from orders where id = $1",
    [row.place_booking_order.order_id],
  );
}

const bookingRow = (id: string) =>
  db.one<{ discount_amount: string; discount_offer_id: string | null; total: string }>(
    "select discount_amount, discount_offer_id, total from bookings where id = $1",
    [id],
  );

describe("a shopper's booking and the store's automatic offers", () => {
  it("takes the store's offer on a service, named, when no booking offer fits", async () => {
    const s = await store();
    const id = await offer(s.brand, 26, { product_ids: [s.booth.id], name_en: "Opening week" });
    const held = await hold(s);
    expect(Number(held.discount)).toBe(26);
    expect(Number(held.total)).toBe(74);
    expect(held).toMatchObject({
      discount_from_offer: true,
      discount_label_en: "Opening week",
      discount_label_ar: "عرض المتجر",
      offers_combine: "best",
    });
    expect((await bookingRow(held.booking_id)).discount_offer_id).toBe(id);

    // The order carries it once (the builder does not add it again) and says which offer it was.
    const order = await place(s, held);
    expect(Number(order.discount)).toBe(26);
    expect(Number(order.offer_discount)).toBe(26);
    expect(order.applied_offers).toEqual([
      expect.objectContaining({ id, amount: 26, name_en: "Opening week" }),
    ]);
    expect(Number(order.total)).toBe(74);
  });

  it("keeps the booking offer when it saves more, or the same", async () => {
    const more = await store(30);
    await offer(more.brand, 26);
    const heldMore = await hold(more);
    expect(Number(heldMore.discount)).toBe(30);
    expect(heldMore).toMatchObject({
      discount_from_offer: false,
      discount_label_en: "Last minute",
    });
    // The order takes the booking offer only: before, the builder added the store's on top (56).
    expect(Number((await place(more, heldMore)).discount)).toBe(30);

    const tie = await store(26);
    await offer(tie.brand, 26);
    const heldTie = await hold(tie);
    expect(heldTie.discount_from_offer).toBe(false);
  });

  it("leaves an offer that does not reach the booked service, and one not live yet", async () => {
    const s = await store();
    const other = await db.service(s.brand, { name: "Pool", price: 50 });
    await offer(s.brand, 40, { product_ids: [other.id] });
    await db.pg.query(
      `insert into store_offers (brand_id, kind, discount_type, discount_value, starts_at)
       values ($1, 'discount', 'percentage', 50, now() + interval '1 day')`,
      [s.brand],
    );
    expect(Number((await hold(s)).discount)).toBe(0);
  });

  it("does not touch a booking staff make", async () => {
    const s = await store();
    await offer(s.brand, 26);
    const made = await db.staff(s.brand, db.day(4), "12:00", 120, [
      { product_id: s.booth.id, name_en: "Booth" },
    ]);
    expect(Number((await bookingRow(made.id)).discount_amount)).toBe(0);
  });
});

describe("a store offer on a booking against a typed code", () => {
  it("keeps whichever saves more by default: the offer over a smaller code", async () => {
    const s = await store();
    await offer(s.brand, 26);
    const held = await hold(s);
    const order = await place(s, held, "CODE10");
    expect(Number(order.discount)).toBe(26);
    expect(order.promo_code).toBeNull();
    expect(Number((await bookingRow(held.booking_id)).discount_amount)).toBe(26);
  });

  it("keeps a code that saves more, and the booking gives up the offer", async () => {
    const s = await store();
    await offer(s.brand, 26);
    const held = await hold(s);
    const order = await place(s, held, "CODE40");
    expect(Number(order.discount)).toBe(40);
    expect(order.promo_code).toBe("CODE40");
    expect(Number(order.offer_discount)).toBe(0);
    const booking = await bookingRow(held.booking_id);
    expect(Number(booking.discount_amount)).toBe(0);
    expect(booking.discount_offer_id).toBeNull();
    expect(Number(booking.total)).toBe(100);
  });

  it("follows the store's rule: the code first, or both together", async () => {
    const first = await store();
    await offer(first.brand, 26);
    await db.pg.query(
      "update business_settings set offers_combine = 'code_first' where brand_id = $1",
      [first.brand],
    );
    expect(Number((await place(first, await hold(first), "CODE10")).discount)).toBe(10);

    const both = await store();
    await offer(both.brand, 26);
    await db.pg.query(
      "update business_settings set offers_combine = 'together' where brand_id = $1",
      [both.brand],
    );
    expect(Number((await place(both, await hold(both), "CODE10")).discount)).toBe(36);
  });

  it("adds a booking offer to a code, as before", async () => {
    const s = await store(30);
    const order = await place(s, await hold(s), "CODE10");
    expect(Number(order.discount)).toBe(40);
  });
});

describe("the twins on screen", () => {
  const rule = (amount: number) =>
    ({ amount, rule: { name_en: "Last minute" }, rules: [{ name_en: "Last minute" }] }) as never;

  it("shows the better of the two, a booking offer on a tie", () => {
    expect(betterBookingOffer(rule(30), { amount: 26, name: "Opening" }, false)).toMatchObject({
      amount: 30,
      fromStoreOffer: false,
    });
    expect(betterBookingOffer(rule(26), { amount: 26, name: "Opening" }, false)).toMatchObject({
      fromStoreOffer: false,
    });
    expect(betterBookingOffer(null, { amount: 26, name: "" }, true)).toEqual({
      amount: 26,
      label: "عرض المتجر",
      fromStoreOffer: true,
    });
    expect(betterBookingOffer(null, null, false)).toBeNull();
  });

  it("weighs a code as place_booking_order does", () => {
    const base = { booking: 26, fromStoreOffer: true, code: 10 };
    expect(bookingWithCode({ ...base, mode: "best" })).toEqual({
      booking: 26,
      code: 0,
      codeDropped: true,
    });
    expect(bookingWithCode({ ...base, code: 40, mode: "best" })).toEqual({
      booking: 0,
      code: 40,
      codeDropped: false,
    });
    expect(bookingWithCode({ ...base, code: 26, mode: "best" }).code).toBe(26);
    expect(bookingWithCode({ ...base, mode: "code_first" })).toMatchObject({
      booking: 0,
      code: 10,
    });
    expect(bookingWithCode({ ...base, mode: "together" })).toMatchObject({ booking: 26, code: 10 });
    expect(bookingWithCode({ ...base, fromStoreOffer: false, mode: "best" })).toMatchObject({
      booking: 26,
      code: 10,
    });
  });
});
