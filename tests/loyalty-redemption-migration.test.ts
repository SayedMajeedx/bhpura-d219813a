import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261007150000_loyalty_redemption_applies_to_order.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// Redeeming points must lower what the order costs, once, from the order's own numbers. The points
// ledger function is replaced by a small stand-in (1 point = 0.010, at most half of what is left to
// pay, balance checked) so this tests what the new function does around it.

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const ORDER = "00000000-0000-4000-8000-0000000000d1";

async function database(balance = 1000) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY, brand_id uuid NOT NULL, customer_id uuid, status text, payment_status text DEFAULT 'unpaid',
      advance_paid numeric DEFAULT 0, subtotal numeric NOT NULL, discount numeric NOT NULL DEFAULT 0,
      shipping numeric NOT NULL DEFAULT 0, tax_amount numeric NOT NULL DEFAULT 0,
      total numeric NOT NULL CHECK (total >= 0), CHECK (discount >= 0)
    );
    CREATE TABLE public.points (customer_id uuid PRIMARY KEY, active integer NOT NULL);
    CREATE TABLE public.ledger (key text PRIMARY KEY, points integer NOT NULL);
    INSERT INTO public.points VALUES ('${CUSTOMER}', ${balance});
    CREATE FUNCTION public.rpc_validate_and_redeem_loyalty_points(p_brand_id uuid, p_customer_id uuid, p_points integer, p_order_subtotal numeric, p_key text, p_order_id uuid)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.ledger WHERE key = p_key) THEN
        RETURN jsonb_build_object('success', true, 'already_redeemed', true);
      END IF;
      IF (SELECT active FROM public.points WHERE customer_id = p_customer_id) < p_points THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient active points balance');
      END IF;
      IF p_points * 0.010 > p_order_subtotal * 0.5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Points exceed max redemption threshold for this order');
      END IF;
      UPDATE public.points SET active = active - p_points WHERE customer_id = p_customer_id;
      INSERT INTO public.ledger VALUES (p_key, -p_points);
      RETURN jsonb_build_object('success', true, 'points_redeemed', p_points, 'discount_amount', p_points * 0.010);
    END $$;
  `);
  await db.exec(migration);
  return db;
}

type OrderOverrides = Partial<
  Record<
    | "subtotal"
    | "discount"
    | "shipping"
    | "tax"
    | "total"
    | "customer"
    | "payment"
    | "status"
    | "advance",
    string
  >
>;
const placeOrder = (db: PGlite, over: OrderOverrides = {}) => {
  const o = {
    subtotal: "40",
    discount: "5",
    shipping: "2",
    tax: "1",
    total: "38",
    customer: `'${CUSTOMER}'`,
    payment: "'unpaid'",
    status: "'pending'",
    advance: "0",
    ...over,
  };
  return db.exec(
    `INSERT INTO public.orders (id, brand_id, customer_id, status, payment_status, advance_paid, subtotal, discount, shipping, tax_amount, total)
     VALUES ('${ORDER}', '${BRAND}', ${o.customer}, ${o.status}, ${o.payment}, ${o.advance}, ${o.subtotal}, ${o.discount}, ${o.shipping}, ${o.tax}, ${o.total})`,
  );
};
const redeem = async (db: PGlite, points: number) =>
  (
    await db.query<{ r: Record<string, unknown> }>(
      `SELECT public.redeem_loyalty_points_for_order('${ORDER}', ${points}) AS r`,
    )
  ).rows[0].r;
const order = async (db: PGlite) =>
  (await db.query<Record<string, unknown>>(`SELECT * FROM public.orders WHERE id = '${ORDER}'`))
    .rows[0];
const balance = async (db: PGlite) =>
  (await db.query<{ active: number }>(`SELECT active FROM public.points`)).rows[0].active;

describe("redeeming loyalty points on an order", () => {
  it("lowers the discount and the total, the way a promo code does, and records what was redeemed", async () => {
    const db = await database();
    await placeOrder(db); // 40 - 5 promo + 2 shipping + 1 tax = 38
    const result = await redeem(db, 500); // 500 points = 5.000
    expect(result).toMatchObject({
      success: true,
      points_redeemed: 500,
      discount_amount: 5,
      new_total: 33,
    });
    const row = await order(db);
    expect(Number(row.discount)).toBe(10);
    expect(Number(row.total)).toBe(33);
    expect(row.loyalty_points_redeemed).toBe(500);
    expect(Number(row.loyalty_discount)).toBe(5);
    expect(await balance(db)).toBe(500);
  });

  it("does nothing the second time", async () => {
    const db = await database();
    await placeOrder(db);
    await redeem(db, 500);
    expect(await redeem(db, 500)).toMatchObject({
      success: true,
      already_redeemed: true,
      new_total: 33,
    });
    expect(await balance(db)).toBe(500);
    expect(Number((await order(db)).discount)).toBe(10);
  });

  it("changes nothing when the points are not enough or exceed the cap", async () => {
    const db = await database(100);
    await placeOrder(db);
    expect(await redeem(db, 500)).toMatchObject({ success: false });
    const row = await order(db);
    expect(Number(row.discount)).toBe(5);
    expect(Number(row.total)).toBe(38);
    expect(row.loyalty_points_redeemed).toBe(0);

    const rich = await database(100000);
    await placeOrder(rich);
    expect(await redeem(rich, 5000)).toMatchObject({ success: false }); // 50.000 is over half of 35
    expect(Number((await order(rich)).total)).toBe(38);
    expect(await balance(rich)).toBe(100000);
  });

  it("never takes the total below shipping and tax", async () => {
    const db = await database();
    await placeOrder(db, { subtotal: "10", discount: "0", shipping: "3", tax: "1", total: "14" });
    const result = await redeem(db, 500); // the stand-in caps at half of 10: 5.000 is the most
    expect(result).toMatchObject({ success: true, discount_amount: 5, new_total: 9 });
    expect(Number((await order(db)).total)).toBeGreaterThanOrEqual(4);
  });

  it("refuses an order that is paid, advanced, cancelled or a guest's, and a missing or bad request", async () => {
    const cases: Array<[OrderOverrides, string]> = [
      [{ payment: "'paid'" }, "ORDER_NOT_PAYABLE"],
      [{ advance: "10" }, "ORDER_NOT_PAYABLE"],
      [{ status: "'cancelled'" }, "ORDER_NOT_PAYABLE"],
      [{ customer: "NULL" }, "CUSTOMER_REQUIRED"],
    ];
    for (const [over, error] of cases) {
      const db = await database();
      await placeOrder(db, over);
      expect(await redeem(db, 500), JSON.stringify(over)).toMatchObject({ success: false, error });
      expect(await balance(db)).toBe(1000);
      expect(Number((await order(db)).total)).toBe(38);
    }
    const db = await database();
    expect(await redeem(db, 500)).toMatchObject({ error: "ORDER_NOT_FOUND" });
    await placeOrder(db);
    expect(await redeem(db, 0)).toMatchObject({ error: "INVALID_POINTS" });
    expect(await redeem(db, -5)).toMatchObject({ error: "INVALID_POINTS" });
  });

  it("is for the server only, and safe to run twice", async () => {
    const db = await database();
    const can = async (role: string) =>
      (
        await db.query<{ ok: boolean }>(
          `SELECT has_function_privilege('${role}', 'public.redeem_loyalty_points_for_order(uuid, integer)', 'EXECUTE') AS ok`,
        )
      ).rows[0].ok;
    expect(await can("anon")).toBe(false);
    expect(await can("authenticated")).toBe(false);
    expect(await can("service_role")).toBe(true);
    await expect(db.exec(migration)).resolves.toBeDefined();
  });
});
