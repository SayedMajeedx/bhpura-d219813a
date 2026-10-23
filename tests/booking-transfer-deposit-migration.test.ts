import { beforeAll, describe, expect, it, vi } from "vitest";
import depositMigration from "../supabase/migrations/20261023100000_booking_transfer_deposit.sql?raw";
import bookingDeposits from "../supabase/migrations/20260930160000_booking_deposits.sql?raw";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";

// A booking's deposit paid by BenefitPay, and no cash for a booking under a deposit
// (migration 20261023100000), run for real in Postgres (PGlite) through the booking
// engine's own hold, order and approval functions.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: EngineDb;

// What the engine's test database lacks for paying an order: the payment columns, the store's
// payment switches, the admin check, the advance rule (a fixed amount per order, set by a test)
// and the trigger that moves a booking with its order's payment, as in the live database.
const PAYMENTS = `
  ALTER TABLE public.orders
    ADD COLUMN payment_method text,
    ADD COLUMN benefit_verified_at timestamptz,
    ADD COLUMN benefit_verified_by uuid,
    ADD COLUMN benefit_receipt_key text,
    ADD COLUMN benefit_receipt_delete_after timestamptz,
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN test_advance numeric;
  ALTER TABLE public.business_settings
    ADD COLUMN card_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN benefit_enabled boolean NOT NULL DEFAULT false;
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE FUNCTION public.order_advance_due(p_order_id uuid) RETURNS numeric LANGUAGE sql AS $$
    SELECT test_advance FROM public.orders WHERE id = p_order_id
  $$;
  CREATE OR REPLACE FUNCTION public.place_storefront_order(
    p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text,
    p_notes text DEFAULT NULL, p_fulfillment text DEFAULT 'delivery', p_branch_id uuid DEFAULT NULL,
    p_digital_channel text DEFAULT NULL, p_digital_contact text DEFAULT NULL,
    p_promo_code text DEFAULT NULL, p_benefit_receipt_id uuid DEFAULT NULL,
    p_shipping_fee numeric DEFAULT NULL, p_shipping_zone text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL
  ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
  DECLARE v_brand uuid; v_order uuid; v_sum numeric := 0; v_line jsonb; v_variant record;
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
    UPDATE public.orders SET subtotal = v_sum, total = v_sum WHERE id = v_order;
    RETURN jsonb_build_object('order_id', v_order, 'total', v_sum);
  END $function$;
`;

/** The live sync_bookings_with_order (migration 20260930160000) and its trigger. */
function syncTrigger(): string {
  const start = bookingDeposits.indexOf(
    "CREATE OR REPLACE FUNCTION public.sync_bookings_with_order",
  );
  const end = bookingDeposits.indexOf("$function$;", start) + "$function$;".length;
  return `${bookingDeposits.slice(start, end)}
    CREATE TRIGGER trg_orders_sync_bookings AFTER UPDATE OF status, payment_status ON public.orders
      FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status
        OR old.payment_status IS DISTINCT FROM new.payment_status)
      EXECUTE FUNCTION public.sync_bookings_with_order();`;
}

beforeAll(async () => {
  db = await createEngineDb();
  await db.pg.exec(PAYMENTS);
  await db.pg.exec(syncTrigger());
  await db.pg.exec(depositMigration);
});

type Store = { deposit?: number; card?: boolean; benefit?: boolean };

/** A store with a 70 BHD service, its deposit and payment switches. */
async function store(options: Store = {}) {
  const brand = await db.store({ dailyCapacity: 3, leadDays: 0, holdMinutes: 15 });
  const slug = await db.slugOf(brand);
  await db.pg.query(
    "update business_settings set storefront_mode = 'shop', card_enabled = $2, benefit_enabled = $3 where brand_id = $1",
    [brand, options.card ?? true, options.benefit ?? true],
  );
  await db.pg.query("update booking_settings set deposit_percent = $2 where brand_id = $1", [
    brand,
    options.deposit ?? 25,
  ]);
  const svc = await db.service(brand, { name: "Booth", price: 70 });
  return { brand, slug, svc };
}

/** Holds a day for the service and places its order with a payment method. */
async function place(s: Awaited<ReturnType<typeof store>>, method: string) {
  const held = await db.one<{ hold_booking: { booking_id: string; hold_token: string } }>(
    `select hold_booking($1, $2::date, '12:00'::time, 120, $3::jsonb, $4::jsonb, '{}'::jsonb, null)`,
    [
      s.brand,
      db.day(5),
      JSON.stringify([{ product_id: s.svc.id, variant_id: s.svc.variantId }]),
      JSON.stringify({ name: "Sara", phone: "39990017" }),
    ],
  );
  const bookingId = held.hold_booking.booking_id;
  const placed = () =>
    db.one<{ place_booking_order: { order_id: string; deposit_amount: string | null } }>(
      `select place_booking_order($1, $2::uuid, $3, $4::jsonb, $5::jsonb, $6)`,
      [
        bookingId,
        held.hold_booking.hold_token,
        s.slug,
        JSON.stringify({ name: "Sara", phone: "39990017" }),
        JSON.stringify([{ variant_id: s.svc.variantId, quantity: 1 }]),
        method,
      ],
    );
  return { bookingId, placed };
}

const booking = (id: string) =>
  db.one<{ status: string; deposit_amount: string | null; order_id: string | null }>(
    "select status, deposit_amount, order_id from bookings where id = $1",
    [id],
  );
const order = (id: string) =>
  db.one<{ payment_status: string; advance_paid: string; total: string }>(
    "select payment_status, advance_paid, total from orders where id = $1",
    [id],
  );

describe("a booking's deposit paid by BenefitPay", () => {
  it("is written for a transfer as for a card", async () => {
    const s = await store({ deposit: 25 });
    const transfer = await place(s, "benefit");
    expect((await transfer.placed()).place_booking_order.deposit_amount).toBe(17.5);
    expect(Number((await booking(transfer.bookingId)).deposit_amount)).toBe(17.5);
    const card = await place(s, "card");
    await card.placed();
    expect(Number((await booking(card.bookingId)).deposit_amount)).toBe(17.5);
  });

  it("is what approving the transfer records: the order part-paid, the booking confirmed", async () => {
    const s = await store({ deposit: 25 });
    const { bookingId, placed } = await place(s, "benefit");
    const orderId = (await placed()).place_booking_order.order_id;
    const result = await db.one<{ approve_benefit_payment: { advance_only: boolean } }>(
      "select approve_benefit_payment($1)",
      [orderId],
    );
    expect(result.approve_benefit_payment.advance_only).toBe(true);
    const paid = await order(orderId);
    expect(paid.payment_status).toBe("partially_paid");
    expect(Number(paid.advance_paid)).toBe(17.5);
    expect((await booking(bookingId)).status).toBe("confirmed");
  });

  it("gives way to an advance rule that reaches the order, as the card charge does", async () => {
    const s = await store({ deposit: 25 });
    const { placed } = await place(s, "benefit");
    const orderId = (await placed()).place_booking_order.order_id;
    await db.pg.query("update orders set test_advance = 30 where id = $1", [orderId]);
    await db.one("select approve_benefit_payment($1)", [orderId]);
    expect(Number((await order(orderId)).advance_paid)).toBe(30);
  });

  it("is not asked by a store with no deposit: the transfer pays everything", async () => {
    const s = await store({ deposit: 0 });
    const { bookingId, placed } = await place(s, "benefit");
    const orderId = (await placed()).place_booking_order.order_id;
    expect((await booking(bookingId)).deposit_amount).toBeNull();
    await db.one("select approve_benefit_payment($1)", [orderId]);
    const paid = await order(orderId);
    expect(paid.payment_status).toBe("paid");
    expect(Number(paid.advance_paid)).toBe(70);
  });
});

describe("cash for a booking under a deposit", () => {
  it("is refused while the store takes a card or BenefitPay, and nothing is written", async () => {
    const s = await store({ deposit: 25, card: false, benefit: true });
    const { bookingId, placed } = await place(s, "cod");
    await expect(placed()).rejects.toThrow(/BOOKING_DEPOSIT_REQUIRED/);
    const row = await booking(bookingId);
    expect(row.status).toBe("hold");
    expect(row.order_id).toBeNull();
  });

  it("is taken by a store that takes neither (it takes no deposit)", async () => {
    const s = await store({ deposit: 25, card: false, benefit: false });
    const { bookingId, placed } = await place(s, "cod");
    await placed();
    const row = await booking(bookingId);
    expect(row.status).toBe("confirmed");
    expect(row.deposit_amount).toBeNull();
  });

  it("is taken with no deposit set", async () => {
    const s = await store({ deposit: 0 });
    const { bookingId, placed } = await place(s, "cod");
    await placed();
    expect((await booking(bookingId)).status).toBe("confirmed");
  });

  it("leaves a staff order alone", async () => {
    const s = await store({ deposit: 25 });
    const { bookingId } = await place(s, "card");
    await db.pg.exec(`
      WITH o AS (
        INSERT INTO orders (brand_id, status, channel, payment_method, invoice_number)
        VALUES ('${s.brand}', 'pending', 'admin', 'cod', 0) RETURNING id
      )
      UPDATE bookings SET order_id = (SELECT id FROM o) WHERE id = '${bookingId}';
    `);
    expect((await booking(bookingId)).order_id).not.toBeNull();
  });
});
