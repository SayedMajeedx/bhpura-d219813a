import { beforeAll, describe, expect, it, vi } from "vitest";
import ordersMigration from "../supabase/migrations/20261019100000_supplier_orders_receive_into_stock.sql?raw";
import migration from "../supabase/migrations/20261019110000_supplier_payments.sql?raw";
import { BRAND, OTHER, openSupplierOrdersDb } from "./helpers/supplier-orders-db";

// Payments to a supplier, one by one (migration 20261019110000): recorded and taken back by the
// database, which keeps the order's paid amount; never more than is owed; once per press. Run in
// a real Postgres as the store's staff in a browser session and as the server.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let ctx: Awaited<ReturnType<typeof openSupplierOrdersDb>>;

const pay = (po: string, amount: number, request = ctx.requestId(), paidOn = "2026-10-15") =>
  ctx.db.query<{ record_supplier_payment: string }>(
    "SELECT public.record_supplier_payment($1, $2, $3::date, $4, 'Cash to Umm Ali')",
    [po, amount, paidOn, request],
  );
const paid = async (po: string) =>
  Number(
    (
      await ctx.one<{ paid_amount: string }>(
        "SELECT paid_amount FROM public.purchase_orders WHERE id = $1",
        [po],
      )
    ).paid_amount,
  );

/** An order of 10 pieces at 20: 200 owed. */
const orderOf200 = () => ctx.newOrder([{ variant: ctx.small, quantity: 10, unit_cost: 20 }]);

beforeAll(async () => {
  ctx = await openSupplierOrdersDb([ordersMigration]);
  // An order paid the old way, before the migration: it keeps what it paid, as one payment.
  await ctx.asServer();
  const before = await orderOf200();
  await ctx.db.query("UPDATE public.purchase_orders SET paid_amount = 80 WHERE id = $1", [
    before.id,
  ]);
  await ctx.db.exec(migration);
  await ctx.db.exec(`GRANT SELECT ON public.purchase_order_payments TO authenticated`);
  const kept = await ctx.db.query<{ amount: string; note: string }>(
    "SELECT amount, note FROM public.purchase_order_payments WHERE po_id = $1",
    [before.id],
  );
  expect(kept.rows).toEqual([
    { amount: "80.000", note: "Paid before payments were recorded one by one" },
  ]);
  expect(await paid(before.id)).toBe(80);
});

describe("a payment to a supplier", () => {
  it("adds to what was paid, once per press, never past what is owed", async () => {
    await ctx.asStaff("view_financials");
    const po = await orderOf200();
    expect(await paid(po.id)).toBe(0);

    const press = ctx.requestId();
    const first = await pay(po.id, 50, press);
    const again = await pay(po.id, 50, press);
    expect(again.rows[0].record_supplier_payment).toBe(first.rows[0].record_supplier_payment);
    expect(await paid(po.id)).toBe(50);

    await pay(po.id, 120);
    expect(await paid(po.id)).toBe(170);
    await expect(pay(po.id, 10.0001)).rejects.toThrow("INVALID_PAYMENT_AMOUNT");
    await expect(pay(po.id, 31)).rejects.toThrow("PAYMENT_MORE_THAN_OWED");
    await expect(pay(po.id, 0)).rejects.toThrow("INVALID_PAYMENT_AMOUNT");
    await expect(pay(po.id, 5, ctx.requestId(), "2999-01-01")).rejects.toThrow(
      "INVALID_PAYMENT_DATE",
    );
    await pay(po.id, 30);
    expect(await paid(po.id)).toBe(200);
    await ctx.asServer();
  });

  it("is taken back with a reason, stays on record and counts nowhere", async () => {
    await ctx.asStaff("view_financials");
    const po = await orderOf200();
    const { rows } = await pay(po.id, 60);
    const id = rows[0].record_supplier_payment;
    await expect(
      ctx.db.query("SELECT public.void_supplier_payment($1, '  ')", [id]),
    ).rejects.toThrow("VOID_REASON_REQUIRED");
    await ctx.db.query("SELECT public.void_supplier_payment($1, 'Paid the wrong order')", [id]);
    expect(await paid(po.id)).toBe(0);
    const row = await ctx.one<{ void_reason: string; voided_at: string | null }>(
      "SELECT void_reason, voided_at FROM public.purchase_order_payments WHERE id = $1",
      [id],
    );
    expect(row.void_reason).toBe("Paid the wrong order");
    expect(row.voided_at).not.toBeNull();
    await ctx.asServer();
  });

  it("is for staff who see the store's finances, never written by a screen", async () => {
    await ctx.asStaff("view_financials");
    const po = await orderOf200();
    await ctx.asStaff("manage_inventory");
    await expect(pay(po.id, 10)).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asStaff("view_financials", OTHER);
    await expect(pay(po.id, 10)).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asServer();
    await expect(pay(po.id, 10)).rejects.toThrow("NOT_AUTHORIZED");

    await ctx.asStaff("view_financials");
    // The paid amount is the payments': a screen writing it changes nothing.
    await ctx.db.query("UPDATE public.purchase_orders SET paid_amount = 200 WHERE id = $1", [
      po.id,
    ]);
    expect(await paid(po.id)).toBe(0);
    const fresh = await ctx.one<{ paid_amount: string }>(
      "INSERT INTO public.purchase_orders (brand_id, vendor_id, po_number, paid_amount) VALUES ($1, $2, '', 99) RETURNING paid_amount",
      [BRAND, ctx.tailor],
    );
    expect(Number(fresh.paid_amount)).toBe(0);
    await expect(
      ctx.db.query(
        "INSERT INTO public.purchase_order_payments (brand_id, po_id, request_id, amount) VALUES ($1, $2, gen_random_uuid(), 5)",
        [BRAND, po.id],
      ),
    ).rejects.toThrow(/permission denied/);
    await ctx.asServer();
  });

  it("keeps an order with payments from being deleted, and not a cancelled one paid for", async () => {
    await ctx.asStaff("view_financials");
    const po = await orderOf200();
    await pay(po.id, 40);
    await expect(
      ctx.db.query("DELETE FROM public.purchase_orders WHERE id = $1", [po.id]),
    ).rejects.toThrow("PURCHASE_ORDER_HAS_PAYMENTS");
    await ctx.db.query("UPDATE public.purchase_orders SET status = 'cancelled' WHERE id = $1", [
      po.id,
    ]);
    await expect(pay(po.id, 10)).rejects.toThrow("PURCHASE_ORDER_NOT_OPEN");
    expect(await paid(po.id)).toBe(40);
    await ctx.asServer();
  });
});
