import { beforeAll, describe, expect, it, vi } from "vitest";
import ordersMigration from "../supabase/migrations/20261019100000_supplier_orders_receive_into_stock.sql?raw";
import paymentsMigration from "../supabase/migrations/20261019110000_supplier_payments.sql?raw";
import migration from "../supabase/migrations/20261127100000_supplier_account_payments.sql?raw";
import { BRAND, OTHER, openSupplierOrdersDb } from "./helpers/supplier-orders-db";

// A payment goes to the supplier, not to one order (migration 20261127100000): spread on the
// orders chosen, then on the oldest that owe; what is left is the supplier's credit, spent by
// the database on the next order that owes; an order cancelled or made cheaper gives back what
// it no longer needs. Run in a real Postgres with the real supplier order engine, as the store's
// staff in a browser session and as the server.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let ctx: Awaited<ReturnType<typeof openSupplierOrdersDb>>;
let legacyOrder = "";
let legacyStanding = "";
let legacyVoided = "";

type Allocation = { po_id: string; amount: number };
const payAccount = (
  amount: number,
  opts: {
    vendor?: string;
    allocations?: Allocation[] | null;
    method?: string | null;
    request?: string;
    paidOn?: string;
  } = {},
) =>
  ctx.db.query<{ record_supplier_account_payment: string }>(
    "SELECT public.record_supplier_account_payment($1, $2, $3::date, $4, 'BH-REF-1', 'Transfer to the tailor', $5::jsonb, $6)",
    [
      opts.vendor ?? ctx.tailor,
      amount,
      opts.paidOn ?? "2026-11-09",
      opts.method === undefined ? "benefit" : opts.method,
      opts.allocations === undefined ? null : JSON.stringify(opts.allocations),
      opts.request ?? ctx.requestId(),
    ],
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
/** What the supplier's standing payments hold beyond what they paid on orders. */
const credit = async (vendor = ctx.tailor) =>
  Number(
    (
      await ctx.one<{ credit: string }>(
        `SELECT COALESCE(sum(sp.amount), 0) - COALESCE((
            SELECT sum(a.amount) FROM public.purchase_order_payments a
              JOIN public.supplier_payments p ON p.id = a.supplier_payment_id
             WHERE p.vendor_id = $1 AND p.voided_at IS NULL AND a.voided_at IS NULL), 0) AS credit
           FROM public.supplier_payments sp WHERE sp.vendor_id = $1 AND sp.voided_at IS NULL`,
        [vendor],
      )
    ).credit,
  );
/** An order of `pieces` pieces at `cost` each. */
const orderOf = (pieces: number, cost: number) =>
  ctx.newOrder([{ variant: ctx.small, quantity: pieces, unit_cost: cost }]);
/** A supplier of their own, so each test starts with no credit. */
const newSupplier = async () => {
  await ctx.asServer();
  const id = (
    await ctx.one<{ id: string }>(
      "INSERT INTO public.vendors (brand_id, name) VALUES ($1, 'A tailor') RETURNING id",
      [BRAND],
    )
  ).id;
  return id;
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
  ctx = await openSupplierOrdersDb([ordersMigration, paymentsMigration]);
  // Payments recorded the old way, one by one on an order: one standing, one taken back.
  await ctx.asStaff("view_financials");
  legacyOrder = (await orderOf(10, 20)).id;
  legacyStanding = (
    await ctx.db.query<{ record_supplier_payment: string }>(
      "SELECT public.record_supplier_payment($1, 50, '2026-11-04'::date, $2, 'Cash')",
      [legacyOrder, ctx.requestId()],
    )
  ).rows[0].record_supplier_payment;
  legacyVoided = (
    await ctx.db.query<{ record_supplier_payment: string }>(
      "SELECT public.record_supplier_payment($1, 30, '2026-11-05'::date, $2, NULL)",
      [legacyOrder, ctx.requestId()],
    )
  ).rows[0].record_supplier_payment;
  await ctx.db.query("SELECT public.void_supplier_payment($1, 'Typed twice')", [legacyVoided]);
  // The legacy order is paid in full the old way, so the tailor's account starts settled.
  await ctx.db.query(
    "SELECT public.record_supplier_payment($1, 150, '2026-11-06'::date, $2, NULL)",
    [legacyOrder, ctx.requestId()],
  );
  await ctx.asServer();
  await ctx.db.exec(migration);
  await ctx.db.exec(`
    REVOKE ALL ON public.supplier_payments FROM authenticated;
    GRANT SELECT ON public.supplier_payments TO authenticated;
  `);
});

describe("the payments recorded before", () => {
  it("each become a payment of their own, spread on their order, nothing paid moving", async () => {
    const rows = (
      await ctx.db.query<{
        id: string;
        amount: string;
        method: string | null;
        note: string | null;
        voided: boolean;
      }>(
        "SELECT id, amount, method, note, voided_at IS NOT NULL AS voided FROM public.supplier_payments ORDER BY paid_on",
      )
    ).rows;
    expect(rows).toEqual([
      { id: legacyStanding, amount: "50.000", method: null, note: "Cash", voided: false },
      { id: legacyVoided, amount: "30.000", method: null, note: null, voided: true },
      expect.objectContaining({ amount: "150.000", method: null, voided: false }),
    ]);
    const links = await ctx.one<{ unlinked: string }>(
      "SELECT count(*) AS unlinked FROM public.purchase_order_payments WHERE supplier_payment_id IS NULL",
    );
    expect(Number(links.unlinked)).toBe(0);
    expect(await paid(legacyOrder)).toBe(200);
    expect(await credit()).toBe(0);
  });
});

describe("one payment to a supplier", () => {
  it("is spread on the oldest orders that owe, and what is left waits for the next order", async () => {
    const tailor = await newSupplier();
    const first = await orderFor(tailor, 31, 2); // 62
    const second = await orderFor(tailor, 1, 23); // 23
    const third = await orderFor(tailor, 1, 17); // 17
    await ctx.asStaff("view_financials");
    await payAccount(114, { vendor: tailor });
    expect([await paid(first), await paid(second), await paid(third)]).toEqual([62, 23, 17]);
    expect(await credit(tailor)).toBe(12);

    // The next order takes the credit by itself.
    await ctx.asServer();
    const fourth = await orderFor(tailor, 2, 10); // 20
    expect(await paid(fourth)).toBe(12);
    expect(await credit(tailor)).toBe(0);
  });

  it("pays the orders chosen first, then the oldest", async () => {
    const tailor = await newSupplier();
    const old = await orderFor(tailor, 1, 40);
    const chosen = await orderFor(tailor, 1, 30);
    await ctx.asStaff("view_financials");
    await payAccount(50, { vendor: tailor, allocations: [{ po_id: chosen, amount: 30 }] });
    expect(await paid(chosen)).toBe(30);
    expect(await paid(old)).toBe(20);
    expect(await credit(tailor)).toBe(0);
    await ctx.asServer();
  });

  it("keeps its day, its method and its reference, and records once per press", async () => {
    const tailor = await newSupplier();
    const po = await orderFor(tailor, 1, 100);
    await ctx.asStaff("view_financials");
    const press = ctx.requestId();
    const one = await payAccount(40, { vendor: tailor, request: press, paidOn: "2026-11-02" });
    const again = await payAccount(40, { vendor: tailor, request: press, paidOn: "2026-11-02" });
    expect(again.rows[0].record_supplier_account_payment).toBe(
      one.rows[0].record_supplier_account_payment,
    );
    expect(await paid(po)).toBe(40);
    const row = await ctx.one<{ paid_on: string; method: string; reference: string }>(
      "SELECT paid_on::text, method, reference FROM public.supplier_payments WHERE id = $1",
      [one.rows[0].record_supplier_account_payment],
    );
    expect(row).toEqual({ paid_on: "2026-11-02", method: "benefit", reference: "BH-REF-1" });
    await ctx.asServer();
  });

  it("refuses what cannot be true", async () => {
    const tailor = await newSupplier();
    const po = await orderFor(tailor, 1, 30);
    const otherSupplier = await newSupplier();
    const notTheirs = await orderFor(otherSupplier, 1, 30);
    const draft = await orderFor(tailor, 1, 10);
    await ctx.db.query("UPDATE public.purchase_orders SET status = 'draft' WHERE id = $1", [draft]);
    await ctx.asStaff("view_financials");
    await expect(payAccount(10, { vendor: tailor, method: null })).rejects.toThrow(
      "INVALID_PAYMENT_METHOD",
    );
    await expect(payAccount(10, { vendor: tailor, method: "gold" })).rejects.toThrow(
      "INVALID_PAYMENT_METHOD",
    );
    await expect(payAccount(10.0001, { vendor: tailor })).rejects.toThrow("INVALID_PAYMENT_AMOUNT");
    await expect(payAccount(10, { vendor: tailor, paidOn: "2999-01-01" })).rejects.toThrow(
      "INVALID_PAYMENT_DATE",
    );
    await expect(
      payAccount(50, { vendor: tailor, allocations: [{ po_id: po, amount: 31 }] }),
    ).rejects.toThrow("PAYMENT_MORE_THAN_OWED");
    await expect(
      payAccount(20, { vendor: tailor, allocations: [{ po_id: po, amount: 25 }] }),
    ).rejects.toThrow("ALLOCATIONS_MORE_THAN_PAYMENT");
    await expect(
      payAccount(20, { vendor: tailor, allocations: [{ po_id: notTheirs, amount: 5 }] }),
    ).rejects.toThrow("PURCHASE_ORDER_NOT_FOUND");
    await expect(
      payAccount(20, { vendor: tailor, allocations: [{ po_id: draft, amount: 5 }] }),
    ).rejects.toThrow("PURCHASE_ORDER_NOT_OPEN");
    await expect(
      payAccount(20, {
        vendor: tailor,
        allocations: [
          { po_id: po, amount: 5 },
          { po_id: po, amount: 5 },
        ],
      }),
    ).rejects.toThrow("INVALID_ALLOCATIONS");
    // Nothing of those was written.
    expect(await paid(po)).toBe(0);
    expect(await credit(tailor)).toBe(0);
    await ctx.asServer();
  });

  it("is for staff who see the store's finances, never written by a screen", async () => {
    const tailor = await newSupplier();
    await orderFor(tailor, 1, 30);
    await ctx.asStaff("manage_inventory");
    await expect(payAccount(10, { vendor: tailor })).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asStaff("view_financials", OTHER);
    await expect(payAccount(10, { vendor: tailor })).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asServer();
    await expect(payAccount(10, { vendor: tailor })).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asStaff("view_financials");
    await expect(
      ctx.db.query(
        "INSERT INTO public.supplier_payments (brand_id, vendor_id, request_id, amount) VALUES ($1, $2, gen_random_uuid(), 5)",
        [BRAND, tailor],
      ),
    ).rejects.toThrow(/permission denied/);
    await ctx.asServer();
    expect(await credit(tailor)).toBe(0);
  });
});

describe("orders that change after they were paid", () => {
  it("a cancelled order gives what it held to the supplier's next order that owes", async () => {
    const tailor = await newSupplier();
    const cancelled = await orderFor(tailor, 1, 40);
    const waiting = await orderFor(tailor, 1, 25);
    await ctx.asStaff("view_financials");
    await payAccount(40, { vendor: tailor, allocations: [{ po_id: cancelled, amount: 40 }] });
    expect(await paid(cancelled)).toBe(40);
    expect(await paid(waiting)).toBe(0);
    await ctx.db.query("UPDATE public.purchase_orders SET status = 'cancelled' WHERE id = $1", [
      cancelled,
    ]);
    expect(await paid(cancelled)).toBe(0);
    expect(await paid(waiting)).toBe(25);
    expect(await credit(tailor)).toBe(15);
    // With nothing paid on it now, the cancelled order can be deleted.
    await ctx.db.query("DELETE FROM public.purchase_orders WHERE id = $1", [cancelled]);
    expect(await credit(tailor)).toBe(15);
    await ctx.asServer();
  });

  it("an order made cheaper gives back the excess, the latest payment first", async () => {
    const tailor = await newSupplier();
    const po = await orderFor(tailor, 4, 10); // 40
    await ctx.asStaff("view_financials");
    await payAccount(25, { vendor: tailor, paidOn: "2026-11-01" });
    await payAccount(15, { vendor: tailor, paidOn: "2026-11-03" });
    expect(await paid(po)).toBe(40);
    await ctx.db.query("UPDATE public.purchase_order_items SET quantity = 3 WHERE po_id = $1", [
      po,
    ]);
    expect(await paid(po)).toBe(30);
    expect(await credit(tailor)).toBe(10);
    const kept = await ctx.db.query<{ amount: string; paid_on: string }>(
      "SELECT amount, paid_on::text FROM public.purchase_order_payments WHERE po_id = $1 AND voided_at IS NULL ORDER BY paid_on",
      [po],
    );
    expect(kept.rows).toEqual([
      { amount: "25.000", paid_on: "2026-11-01" },
      { amount: "5.000", paid_on: "2026-11-03" },
    ]);
    await ctx.asServer();
  });
});

describe("taking a payment back", () => {
  it("takes back all it paid, keeps it on record, and the supplier's credit fills the gap", async () => {
    const tailor = await newSupplier();
    const first = await orderFor(tailor, 1, 30);
    const second = await orderFor(tailor, 1, 30);
    await ctx.asStaff("view_financials");
    const wrong = (await payAccount(45, { vendor: tailor, paidOn: "2026-11-01" })).rows[0]
      .record_supplier_account_payment;
    await payAccount(20, { vendor: tailor, paidOn: "2026-11-02" });
    expect([await paid(first), await paid(second)]).toEqual([30, 30]);
    expect(await credit(tailor)).toBe(5);

    await expect(
      ctx.db.query("SELECT public.void_supplier_account_payment($1, ' ')", [wrong]),
    ).rejects.toThrow("VOID_REASON_REQUIRED");
    await ctx.db.query("SELECT public.void_supplier_account_payment($1, 'Wrong amount')", [wrong]);
    // What the 20 that stands already paid stays where it is (15 on the second order); its
    // credit (5) goes to the oldest order that now owes.
    expect([await paid(first), await paid(second)]).toEqual([5, 15]);
    expect(await credit(tailor)).toBe(0);
    const record = await ctx.one<{ void_reason: string; rows: string }>(
      `SELECT sp.void_reason, (SELECT count(*) FROM public.purchase_order_payments a
          WHERE a.supplier_payment_id = sp.id AND a.voided_at IS NOT NULL) AS rows
         FROM public.supplier_payments sp WHERE sp.id = $1`,
      [wrong],
    );
    expect(record.void_reason).toBe("Wrong amount");
    expect(Number(record.rows)).toBeGreaterThan(0);
    await ctx.asServer();
  });

  it("from an order's row still takes back the whole payment it belongs to", async () => {
    const tailor = await newSupplier();
    const a = await orderFor(tailor, 1, 10);
    const b = await orderFor(tailor, 1, 10);
    await ctx.asStaff("view_financials");
    const payment = (await payAccount(20, { vendor: tailor })).rows[0]
      .record_supplier_account_payment;
    const row = await ctx.one<{ id: string }>(
      "SELECT id FROM public.purchase_order_payments WHERE po_id = $1 AND supplier_payment_id = $2",
      [b, payment],
    );
    await ctx.db.query("SELECT public.void_supplier_payment($1, 'Not paid')", [row.id]);
    expect([await paid(a), await paid(b)]).toEqual([0, 0]);
    await ctx.asServer();
  });

  it("the order page's own payment still pays only that order, never more than it owes", async () => {
    const tailor = await newSupplier();
    const older = await orderFor(tailor, 1, 50);
    const po = await orderFor(tailor, 1, 30);
    await ctx.asStaff("view_financials");
    await ctx.db.query(
      "SELECT public.record_supplier_payment($1, 30, '2026-11-09'::date, $2, NULL)",
      [po, ctx.requestId()],
    );
    expect([await paid(older), await paid(po)]).toEqual([0, 30]);
    await expect(
      ctx.db.query("SELECT public.record_supplier_payment($1, 1, '2026-11-09'::date, $2, NULL)", [
        po,
        ctx.requestId(),
      ]),
    ).rejects.toThrow("PAYMENT_MORE_THAN_OWED");
    await ctx.asServer();
  });
});
