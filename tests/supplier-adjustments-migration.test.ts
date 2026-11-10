import { beforeAll, describe, expect, it, vi } from "vitest";
import ordersMigration from "../supabase/migrations/20261019100000_supplier_orders_receive_into_stock.sql?raw";
import paymentsMigration from "../supabase/migrations/20261019110000_supplier_payments.sql?raw";
import accountMigration from "../supabase/migrations/20261127100000_supplier_account_payments.sql?raw";
import migration from "../supabase/migrations/20261128100000_supplier_adjustments.sql?raw";
import { BRAND, OTHER, openSupplierOrdersDb } from "./helpers/supplier-orders-db";

// Adjustments to a supplier's account (migration 20261128100000): a discount from the supplier
// or an amount written off lowers what is owed exactly as a payment does, spread on the orders
// with the same credit, but it is never a payment: no method, always a reason, and the month
// pack's supplier sheet lists payments only. Run in a real Postgres with the real supplier
// order engine, as the store's staff in a browser session and as the server.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let ctx: Awaited<ReturnType<typeof openSupplierOrdersDb>>;

const adjust = (
  vendor: string,
  amount: number,
  opts: {
    kind?: string | null;
    reason?: string | null;
    allocations?: unknown;
    request?: string;
  } = {},
) =>
  ctx.db.query<{ record_supplier_adjustment: string }>(
    "SELECT public.record_supplier_adjustment($1, $2, '2026-11-10'::date, $3, $4, $5::jsonb, $6)",
    [
      vendor,
      amount,
      opts.kind === undefined ? "discount" : opts.kind,
      opts.reason === undefined ? "5 off the bill" : opts.reason,
      opts.allocations === undefined ? null : JSON.stringify(opts.allocations),
      opts.request ?? ctx.requestId(),
    ],
  );
const pay = (vendor: string, amount: number) =>
  ctx.db.query(
    "SELECT public.record_supplier_account_payment($1, $2, '2026-11-10'::date, 'cash', NULL, NULL, NULL, $3)",
    [vendor, amount, ctx.requestId()],
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
const newSupplier = async () => {
  await ctx.asServer();
  return (
    await ctx.one<{ id: string }>(
      "INSERT INTO public.vendors (brand_id, name) VALUES ($1, 'A tailor') RETURNING id",
      [BRAND],
    )
  ).id;
};
const orderFor = async (vendor: string, pieces: number, cost: number) => {
  const po = await ctx.one<{ id: string }>(
    "INSERT INTO public.purchase_orders (brand_id, vendor_id, po_number, status) VALUES ($1, $2, '', 'ordered') RETURNING id",
    [BRAND, vendor],
  );
  await ctx.db.query(
    "INSERT INTO public.purchase_order_items (po_id, variant_id, description, quantity, unit_cost, sort_order) VALUES ($1, $2, '', $3, $4, 0)",
    [po.id, ctx.small, pieces, cost],
  );
  return po.id;
};

beforeAll(async () => {
  ctx = await openSupplierOrdersDb([ordersMigration, paymentsMigration, accountMigration]);
  await ctx.asServer();
  await ctx.db.exec(migration);
  await ctx.db.exec(`
    REVOKE ALL ON public.supplier_payments FROM authenticated;
    GRANT SELECT ON public.supplier_payments TO authenticated;
  `);
});

describe("an adjustment to a supplier's account", () => {
  it("lowers what is owed as a payment does, on the order chosen, and is named for what it is", async () => {
    const tailor = await newSupplier();
    const older = await orderFor(tailor, 1, 40);
    const discounted = await orderFor(tailor, 1, 30);
    await ctx.asStaff("view_financials");
    const id = (await adjust(tailor, 5, { allocations: [{ po_id: discounted, amount: 5 }] }))
      .rows[0].record_supplier_adjustment;
    expect([await paid(older), await paid(discounted)]).toEqual([0, 5]);
    const row = await ctx.one<{ kind: string; method: string | null; note: string }>(
      "SELECT kind, method, note FROM public.supplier_payments WHERE id = $1",
      [id],
    );
    expect(row).toEqual({ kind: "discount", method: null, note: "5 off the bill" });
    // A write-off with no order chosen goes on the oldest that owes.
    await adjust(tailor, 10, { kind: "write_off", reason: "Agreed with the supplier" });
    expect(await paid(older)).toBe(10);
    await ctx.asServer();
  });

  it("is recorded once per press, and taken back like a payment", async () => {
    const tailor = await newSupplier();
    const po = await orderFor(tailor, 1, 30);
    await ctx.asStaff("view_financials");
    const press = ctx.requestId();
    const first = (await adjust(tailor, 6, { request: press })).rows[0].record_supplier_adjustment;
    const again = (await adjust(tailor, 6, { request: press })).rows[0].record_supplier_adjustment;
    expect(again).toBe(first);
    expect(await paid(po)).toBe(6);
    await ctx.db.query("SELECT public.void_supplier_account_payment($1, 'Not agreed')", [first]);
    expect(await paid(po)).toBe(0);
    await ctx.asServer();
  });

  it("works with payments: what is left after both is the supplier's credit", async () => {
    const tailor = await newSupplier();
    const po = await orderFor(tailor, 1, 30);
    await ctx.asStaff("view_financials");
    await adjust(tailor, 5);
    await pay(tailor, 30);
    expect(await paid(po)).toBe(30);
    const credit = await ctx.one<{ credit: string }>(
      `SELECT sum(sp.amount) - (SELECT COALESCE(sum(a.amount), 0) FROM public.purchase_order_payments a
          JOIN public.supplier_payments p ON p.id = a.supplier_payment_id
         WHERE p.vendor_id = $1 AND a.voided_at IS NULL) AS credit
         FROM public.supplier_payments sp WHERE sp.vendor_id = $1 AND sp.voided_at IS NULL`,
      [tailor],
    );
    expect(Number(credit.credit)).toBe(5);
    await ctx.asServer();
  });

  it("asks for a kind it knows and a reason, from staff who see the finances only", async () => {
    const tailor = await newSupplier();
    await orderFor(tailor, 1, 30);
    await ctx.asStaff("view_financials");
    await expect(adjust(tailor, 5, { kind: "payment" })).rejects.toThrow("INVALID_ADJUSTMENT_KIND");
    await expect(adjust(tailor, 5, { kind: null })).rejects.toThrow("INVALID_ADJUSTMENT_KIND");
    await expect(adjust(tailor, 5, { reason: "  " })).rejects.toThrow("ADJUSTMENT_REASON_REQUIRED");
    await expect(adjust(tailor, 0)).rejects.toThrow("INVALID_PAYMENT_AMOUNT");
    await ctx.asStaff("manage_inventory");
    await expect(adjust(tailor, 5)).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asStaff("view_financials", OTHER);
    await expect(adjust(tailor, 5)).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asServer();
    await expect(adjust(tailor, 5)).rejects.toThrow("NOT_AUTHORIZED");
  });

  it("never carries a method or a reference, which belong to a payment", async () => {
    const tailor = await newSupplier();
    await ctx.asServer();
    await expect(
      ctx.db.query(
        "INSERT INTO public.supplier_payments (brand_id, vendor_id, request_id, amount, kind, method) VALUES ($1, $2, gen_random_uuid(), 5, 'discount', 'cash')",
        [BRAND, tailor],
      ),
    ).rejects.toThrow(/supplier_payments_method_is_a_payments/);
    await expect(
      ctx.db.query(
        "INSERT INTO public.supplier_payments (brand_id, vendor_id, request_id, amount, kind) VALUES ($1, $2, gen_random_uuid(), 5, 'gift')",
        [BRAND, tailor],
      ),
    ).rejects.toThrow(/supplier_payments_kind_check/);
  });
});
