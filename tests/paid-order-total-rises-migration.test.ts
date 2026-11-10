import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261129100000_paid_order_total_rises_owes_the_rest.sql?raw";

// A paid order whose total goes up owes the difference (migration 20261129100000), run in a
// real Postgres (PGlite) on a small copy of the orders table with the live payment trigger: a
// pickup paid by a gift card that becomes a delivery owes the fee, it is not paid in full.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ORDER_1108 = "36d07358-ec5e-4062-9832-b62df4f0986b";
let db: PGlite;

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text,
    payment_status text NOT NULL DEFAULT 'unpaid', fulfillment_method text NOT NULL DEFAULT 'pickup',
    shipping numeric NOT NULL DEFAULT 0, total numeric NOT NULL DEFAULT 0,
    advance_paid numeric NOT NULL DEFAULT 0, gift_card_paid numeric NOT NULL DEFAULT 0
  );
  CREATE TRIGGER trg_orders_payment_amounts BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_payment_amounts();
`;

// The function as it was before, so the table has its trigger when the migration replaces it.
const BEFORE = `
  CREATE FUNCTION public.orders_payment_amounts() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF lower(NEW.payment_status) = 'paid' AND NEW.advance_paid < NEW.total THEN
      NEW.advance_paid := NEW.total;
    END IF;
    RETURN NEW;
  END $$;
`;

const row = async (id: string) =>
  (
    await db.query<{ payment_status: string; advance_paid: string; total: string }>(
      "SELECT payment_status, advance_paid, total FROM public.orders WHERE id = $1",
      [id],
    )
  ).rows[0];
const order = async (status: string, total: number, advance: number, gift = 0) =>
  (
    await db.query<{ id: string }>(
      "INSERT INTO public.orders (payment_status, total, advance_paid, gift_card_paid) VALUES ($1, $2, $3, $4) RETURNING id",
      [status, total, advance, gift],
    )
  ).rows[0].id;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BEFORE);
  await db.exec(SCHEMA);
  // Order 1108 as the old rule left it: the gift card paid 25.600, the fee was written as paid.
  await db.query(
    "INSERT INTO public.orders (id, payment_status, fulfillment_method, shipping, total, advance_paid, gift_card_paid) VALUES ($1, 'paid', 'delivery', 2, 27.6, 27.6, 25.6)",
    [ORDER_1108],
  );
  await db.exec(migration);
});

describe("a paid order whose total goes up", () => {
  it("owes the difference when a pickup becomes a delivery", async () => {
    const id = await order("paid", 25.6, 25.6, 25.6);
    await db.query(
      "UPDATE public.orders SET fulfillment_method = 'delivery', shipping = 2, total = 27.6 WHERE id = $1",
      [id],
    );
    expect(await row(id)).toEqual({
      payment_status: "partially_paid",
      advance_paid: "25.6",
      total: "27.6",
    });
  });

  it("keeps the old total as collected for an order paid before the amount was recorded", async () => {
    const id = await order("paid", 20, 20);
    await db.query("UPDATE public.orders SET advance_paid = 0 WHERE id = $1", [id]);
    await db.query("UPDATE public.orders SET total = 23 WHERE id = $1", [id]);
    expect(await row(id)).toMatchObject({ payment_status: "partially_paid", advance_paid: "20" });
  });

  it("is paid again once the rest is collected", async () => {
    const id = await order("paid", 10, 10);
    await db.query("UPDATE public.orders SET total = 12 WHERE id = $1", [id]);
    await db.query("UPDATE public.orders SET advance_paid = 12 WHERE id = $1", [id]);
    expect(await row(id)).toMatchObject({ payment_status: "paid", advance_paid: "12" });
  });

  it("still fills the amount when 'paid' is recorded, and leaves a lower total alone", async () => {
    const recorded = await order("unpaid", 15, 0);
    await db.query("UPDATE public.orders SET payment_status = 'paid', total = 17 WHERE id = $1", [
      recorded,
    ]);
    expect(await row(recorded)).toMatchObject({ payment_status: "paid", advance_paid: "17" });
    const lower = await order("paid", 15, 15);
    await db.query("UPDATE public.orders SET total = 13 WHERE id = $1", [lower]);
    expect(await row(lower)).toMatchObject({ payment_status: "paid", advance_paid: "15" });
  });

  it("puts order 1108 right: collected what its gift card paid, owing the fee", async () => {
    expect(await row(ORDER_1108)).toEqual({
      payment_status: "partially_paid",
      advance_paid: "25.6",
      total: "27.6",
    });
  });
});
