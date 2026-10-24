import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import builder from "../supabase/migrations/20261014130000_partner_pickup_points.sql?raw";
import reprice from "../supabase/migrations/20261002100000_booking_discounts.sql?raw";
import redeem from "../supabase/migrations/20261024110000_points_come_off_before_tax.sql?raw";
import { orderTotals, storeTaxRule, type TaxRule } from "../src/lib/order-tax";
import { orderTotals as editorTotals } from "../src/features/orders/lib/order-editor";

// The checkout's total (TypeScript) must be the one the order charges: the same orders go
// through the live order builder (place_storefront_order, read from production on 2026-10-23
// and equal to these migrations), the booking's repricing and the points redemption (as
// migration 20261024110000 redefines it: points are a discount before tax).
vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });

const functionOf = (sql: string, head: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${head}`);
  if (start < 0) throw new Error(`${head} not found`);
  const open = sql.indexOf("$function$", start);
  const end = sql.indexOf("$function$", open + 1);
  return `${sql.slice(start, end + "$function$".length)};`;
};

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, is_active boolean);
    INSERT INTO public.brands VALUES ('${BRAND}', 'store', true);
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY,
      default_tax_rate numeric(5,2) NOT NULL DEFAULT 10, vat_inclusive boolean DEFAULT false,
      advance_allow_full_payment boolean DEFAULT true);
    INSERT INTO public.business_settings (brand_id) VALUES ('${BRAND}');
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
      advance_paid numeric(14,3) DEFAULT 0, loyalty_points_redeemed integer DEFAULT 0,
      loyalty_discount numeric(14,3) DEFAULT 0, idempotency_key text, request_hash text,
      advance_rules jsonb, destination_country text, delivery_address_snapshot jsonb,
      benefit_receipt_url text, benefit_receipt_key text,
      confirmation_email_token uuid DEFAULT gen_random_uuid());
    CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid REFERENCES public.orders(id), quantity integer NOT NULL DEFAULT 1);
    CREATE TABLE public.customers (id uuid PRIMARY KEY, auth_user_id uuid);
    CREATE TABLE public.loyalty_accounts (brand_id uuid, customer_id uuid, current_tier_key text);
    CREATE TABLE public.brand_loyalty_tiers (brand_id uuid, tier_key text, free_shipping boolean);
    CREATE TABLE public.brand_loyalty_programs (brand_id uuid, is_enabled boolean);
    CREATE FUNCTION public.advance_full_payment_rules() RETURNS jsonb LANGUAGE sql
      AS $$ SELECT '[]'::jsonb $$;
    CREATE FUNCTION public.assign_order_pickup_partner(uuid, uuid) RETURNS void LANGUAGE sql
      AS $$ SELECT $$;
    CREATE FUNCTION public.storefront_delivery_fee(uuid, text, text, integer) RETURNS numeric
      LANGUAGE sql AS $$ SELECT 0::numeric $$;
    -- The order and its lines as the core builder leaves them: the subtotal of its lines and the
    -- promo code's discount (given here by the test), no tax yet.
    CREATE FUNCTION public.place_storefront_order_core(p_brand_slug text, p_customer jsonb,
      p_items jsonb, p_payment_method text, p_notes text, p_fulfillment text, p_branch_id uuid,
      p_digital_channel text, p_digital_contact text, p_promo_code text)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE v_id uuid;
    BEGIN
      INSERT INTO public.orders (brand_id, customer_id, subtotal, discount, total)
      VALUES ('${BRAND}', '${CUSTOMER}', (p_customer->>'subtotal')::numeric,
        (p_customer->>'discount')::numeric,
        greatest(0, (p_customer->>'subtotal')::numeric - (p_customer->>'discount')::numeric))
      RETURNING id INTO v_id;
      INSERT INTO public.order_items (order_id) VALUES (v_id);
      RETURN jsonb_build_object('success', true, 'order_id', v_id);
    END $$;
    -- One point is worth one hundredth; the room the redemption allows is the real function's.
    CREATE FUNCTION public.rpc_validate_and_redeem_loyalty_points(uuid, uuid, integer, numeric,
      text, uuid) RETURNS jsonb LANGUAGE sql
      AS $$ SELECT jsonb_build_object('success', true, 'discount_amount', $3::numeric / 100) $$;
  `);
  await db.exec(functionOf(builder, "place_storefront_order(p_brand_slug"));
  await db.exec(functionOf(reprice, "reprice_order_totals"));
  await db.exec(functionOf(redeem, "redeem_loyalty_points_for_order"));
});

type Case = {
  subtotal: number;
  discount: number;
  shipping: number;
  rule: TaxRule;
  points?: number;
};

async function setRule(rule: TaxRule) {
  await db.query(
    "UPDATE public.business_settings SET default_tax_rate = $1, vat_inclusive = $2 WHERE brand_id = $3",
    [rule.rate, rule.inclusive, BRAND],
  );
}

type Row = { tax_amount: string; total: string; id: string };
const read = async (id: string) =>
  (await db.query<Row>("SELECT id, tax_amount, total FROM public.orders WHERE id = $1", [id]))
    .rows[0];

/** The order as the database writes it, through the real order builder. */
async function placed(c: Case) {
  await setRule(c.rule);
  const result = await db.query<{ r: { order_id: string } }>(
    `SELECT public.place_storefront_order('store', $1::jsonb, '[]'::jsonb, 'card', NULL,
       'delivery', NULL, NULL, NULL, NULL, NULL, $2) AS r`,
    [JSON.stringify({ subtotal: c.subtotal, discount: c.discount }), c.shipping],
  );
  const id = result.rows[0].r.order_id;
  if (c.points) {
    await db.query("SELECT public.redeem_loyalty_points_for_order($1, $2)", [id, c.points]);
  }
  return read(id);
}

const RULES: TaxRule[] = [
  { rate: 0, inclusive: false },
  { rate: 10, inclusive: false },
  { rate: 10, inclusive: true },
  { rate: 5, inclusive: false },
  { rate: 15, inclusive: true },
  { rate: 7.5, inclusive: false },
  { rate: 12.25, inclusive: true },
  { rate: 0.01, inclusive: false },
];

// A seeded spread of amounts to the fils, with the cases that round.
let seed = 42;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const amount = (max: number) => Math.round(random() * max * 1000) / 1000;

function cases(): Case[] {
  const fixed: Case[] = [
    // Aurora's orders: 34.000 shown, 37.400 charged; 104.250 shown, 114.675 charged.
    { subtotal: 34, discount: 0, shipping: 0, rule: { rate: 10, inclusive: false } },
    { subtotal: 104.25, discount: 0, shipping: 0, rule: { rate: 10, inclusive: false } },
    { subtotal: 0.005, discount: 0, shipping: 1, rule: { rate: 10, inclusive: false } },
    { subtotal: 0.015, discount: 0, shipping: 0, rule: { rate: 10, inclusive: false } },
    { subtotal: 0.025, discount: 0, shipping: 0, rule: { rate: 10, inclusive: false } },
    { subtotal: 20, discount: 25, shipping: 2, rule: { rate: 10, inclusive: false } },
    { subtotal: 55, discount: 5.5, shipping: 1.5, rule: { rate: 10, inclusive: true } },
    { subtotal: 40, discount: 4, shipping: 2, rule: { rate: 10, inclusive: false }, points: 500 },
    { subtotal: 40, discount: 0, shipping: 0, rule: { rate: 10, inclusive: false }, points: 9000 },
    { subtotal: 40, discount: 0, shipping: 2, rule: { rate: 10, inclusive: true }, points: 300 },
  ];
  for (const rule of RULES) {
    for (let i = 0; i < 12; i += 1) {
      const subtotal = amount(400);
      fixed.push({
        subtotal,
        discount: i % 3 === 0 ? 0 : amount(subtotal * 0.6),
        shipping: i % 2 === 0 ? 0 : amount(5),
        rule,
        points: i % 4 === 1 ? Math.floor(random() * 3000) + 1 : undefined,
      });
    }
  }
  return fixed;
}

describe("the checkout's total is the total the order charges", () => {
  it("charges a VAT-exclusive store's tax on top, as Aurora's orders show", () => {
    const rule = storeTaxRule({ default_tax_rate: 10, vat_inclusive: false });
    expect(orderTotals({ subtotal: 34, discount: 0, shipping: 0 }, rule)).toMatchObject({
      tax: 3.4,
      total: 37.4,
    });
    expect(orderTotals({ subtotal: 104.25, discount: 0, shipping: 0 }, rule)).toMatchObject({
      tax: 10.425,
      total: 114.675,
    });
  });

  it("takes points off the price before the tax, with or without VAT in the prices (#43, #44)", async () => {
    // 40.000 and 3.000 of points: the tax is on the 37.000 the customer pays.
    const exclusive: TaxRule = { rate: 10, inclusive: false };
    const inclusive: TaxRule = { rate: 10, inclusive: true };
    const onTop = await placed({
      subtotal: 40,
      discount: 0,
      shipping: 0,
      rule: exclusive,
      points: 300,
    });
    expect({ tax: Number(onTop.tax_amount), total: Number(onTop.total) }).toEqual({
      tax: 3.7,
      total: 40.7,
    });
    const inside = await placed({
      subtotal: 40,
      discount: 0,
      shipping: 0,
      rule: inclusive,
      points: 300,
    });
    expect({ tax: Number(inside.tax_amount), total: Number(inside.total) }).toEqual({
      tax: 3.364,
      total: 37,
    });
    for (const rule of [exclusive, inclusive]) {
      expect(
        orderTotals({ subtotal: 40, discount: 0, shipping: 0, loyaltyDiscount: 3 }, rule),
      ).toMatchObject(rule.inclusive ? { tax: 3.364, total: 37 } : { tax: 3.7, total: 40.7 });
    }
    // Saved again (the editor and a booking's offer reprice the order): nothing moves.
    await setRule(exclusive);
    await db.query("SELECT public.reprice_order_totals($1)", [onTop.id]);
    expect(Number((await read(onTop.id)).total)).toBe(40.7);
  });

  it("agrees with the order builder and the points redemption on every order", async () => {
    for (const c of cases()) {
      const row = await placed(c);
      const twin = orderTotals(
        {
          subtotal: c.subtotal,
          discount: c.discount,
          shipping: c.shipping,
          loyaltyDiscount: (c.points ?? 0) / 100,
        },
        c.rule,
      );
      expect({ tax: Number(row.tax_amount), total: Number(row.total) }, JSON.stringify(c)).toEqual({
        tax: twin.tax,
        total: twin.total,
      });
    }
  });

  it("agrees with the order editor, which reads the points inside the order's discount", async () => {
    for (const c of cases().filter((x) => x.points)) {
      const row = await placed(c);
      const order = (
        await db.query<{ discount: string; shipping: string; tax_rate: string }>(
          "SELECT discount, shipping, tax_rate FROM public.orders WHERE id = $1",
          [row.id],
        )
      ).rows[0];
      const items = [{ line_total: c.subtotal }] as Parameters<typeof editorTotals>[0];
      const editor = editorTotals(items, order, c.rule.inclusive);
      const fils = (n: number) => Math.round(n * 1000) / 1000;
      expect({ tax: fils(editor.taxAmount), total: fils(editor.total) }, JSON.stringify(c)).toEqual(
        { tax: Number(row.tax_amount), total: Number(row.total) },
      );
    }
  });

  it("agrees with the repricing a booking's add-ons and offer go through", async () => {
    for (const c of cases().filter((x) => !x.points)) {
      // Placed with nothing, then the add-ons and the offer are added as place_booking_order does.
      const row = await placed({ ...c, subtotal: 0, discount: 0 });
      await db.query(
        `UPDATE public.orders SET subtotal = $2::numeric, discount = LEAST($2::numeric, $3::numeric),
           shipping = $4::numeric WHERE id = $1`,
        [row.id, c.subtotal, c.discount, c.shipping],
      );
      await db.query("SELECT public.reprice_order_totals($1)", [row.id]);
      const after = await read(row.id);
      const twin = orderTotals(
        { subtotal: c.subtotal, discount: Math.min(c.subtotal, c.discount), shipping: c.shipping },
        c.rule,
      );
      expect({ tax: Number(after.tax_amount), total: Number(after.total) }).toEqual({
        tax: twin.tax,
        total: twin.total,
      });
    }
  });
});

describe("a store's tax rule", () => {
  it("is no tax when the store charges none or the page does not carry a rate", () => {
    expect(storeTaxRule({ default_tax_rate: 0, vat_inclusive: true })).toEqual({
      rate: 0,
      inclusive: false,
    });
    expect(storeTaxRule({ vat_inclusive: false }).rate).toBe(0);
    expect(storeTaxRule({ default_tax_rate: "10.00", vat_inclusive: true })).toEqual({
      rate: 10,
      inclusive: true,
    });
  });
});
