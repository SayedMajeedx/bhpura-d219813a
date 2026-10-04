import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import enforcement from "../supabase/migrations/20261003120000_advance_payment_enforcement.sql?raw";
import scopeRule from "../supabase/migrations/20261003140000_advance_payment_scope_rule.sql?raw";
import rulesTable from "../supabase/migrations/20261003150000_advance_payment_rules.sql?raw";
import rulesEngine from "../supabase/migrations/20261003160000_advance_payment_rules_engine.sql?raw";

// The advance-payment rule as the database decides it (PGlite): the two enforcement
// migrations applied, in order, to a small copy of the order tables they touch.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ALL = "00000000-0000-4000-8000-0000000000a1";
const MTO = "00000000-0000-4000-8000-0000000000a2";
const DEL = "00000000-0000-4000-8000-0000000000a3";
const EITHER = "00000000-0000-4000-8000-0000000000a4";
const OFF = "00000000-0000-4000-8000-0000000000a5";

let db: PGlite;

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-0000000000aa'::uuid $$;
  CREATE TABLE public.admin_flag (on_ boolean NOT NULL DEFAULT false);
  INSERT INTO public.admin_flag VALUES (false);
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT on_ FROM public.admin_flag $$;
  CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE TABLE public.brands (id uuid PRIMARY KEY);
  CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category text);
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY,
    advance_payment_enabled boolean NOT NULL DEFAULT false,
    advance_payment_percent numeric(5, 2) NOT NULL DEFAULT 30
      CHECK (advance_payment_percent > 0 AND advance_payment_percent <= 100),
    advance_payment_scope text NOT NULL DEFAULT 'all'
  );
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, channel text NOT NULL DEFAULT 'admin',
    payment_method text, total numeric NOT NULL DEFAULT 0, shipping numeric NOT NULL DEFAULT 0,
    fulfillment_method text NOT NULL DEFAULT 'delivery', advance_scope text,
    payment_status text NOT NULL DEFAULT 'unpaid',
    status text NOT NULL DEFAULT 'draft', advance_paid numeric NOT NULL DEFAULT 0,
    benefit_receipt_key text, benefit_verified_at timestamptz, benefit_verified_by uuid,
    benefit_receipt_delete_after timestamptz, updated_at timestamptz
  );
  CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid,
    line_total numeric NOT NULL DEFAULT 0, location text NOT NULL DEFAULT 'main'
  );
  INSERT INTO public.business_settings (brand_id, advance_payment_enabled, advance_payment_percent, advance_payment_scope)
    VALUES ('${ALL}', true, 30, 'all'), ('${MTO}', true, 50, 'made_to_order'),
           ('${DEL}', true, 30, 'delivery'), ('${EITHER}', true, 40, 'made_to_order_or_delivery'),
           ('${OFF}', false, 30, 'all');
`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(enforcement);
  await db.exec(scopeRule);
  await db.exec(rulesTable);
  await db.exec(rulesEngine);
});

const setAdmin = (on: boolean) => db.query("UPDATE public.admin_flag SET on_ = $1", [on]);

type Line = { amount: number; custom?: boolean };
type Placed = {
  brand: string;
  method: string | null;
  channel?: string;
  fulfillment?: string;
  total?: number;
  shipping?: number;
  lines?: Line[];
};

/** Places an order the way checkout does: one transaction, the order then its lines, committed. */
async function place(order: Placed) {
  const lines = order.lines ?? [{ amount: 100 }];
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  const shipping = order.shipping ?? 0;
  await db.exec("BEGIN");
  try {
    const row = (
      await db.query<{ id: string; advance_percent: string | null; advance_scope: string | null }>(
        `INSERT INTO public.orders (brand_id, channel, payment_method, fulfillment_method, total, shipping)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, advance_percent, advance_scope`,
        [
          order.brand,
          order.channel ?? "storefront",
          order.method,
          order.fulfillment ?? "delivery",
          order.total ?? sum + shipping,
          shipping,
        ],
      )
    ).rows[0];
    for (const line of lines) {
      await db.query(
        "INSERT INTO public.order_items (order_id, line_total, location) VALUES ($1, $2, $3)",
        [row.id, line.amount, line.custom ? "custom" : "main"],
      );
    }
    await db.exec("COMMIT");
    return row;
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

const due = async (id: string) => {
  const value = (
    await db.query<{ d: string | null }>("SELECT public.order_advance_due($1) AS d", [id])
  ).rows[0].d;
  return value === null ? null : Number(value);
};

describe("a storefront order under the advance-payment rule", () => {
  it("keeps the percentage and the scope that applied, for a card or a BenefitPay order", async () => {
    expect(await place({ brand: ALL, method: "card" })).toMatchObject({
      advance_percent: "30.00",
      advance_scope: "all",
    });
    expect(await place({ brand: MTO, method: "benefit" })).toMatchObject({
      advance_percent: "50.00",
      advance_scope: "made_to_order",
    });
  });

  it("changes nothing for staff-made orders, or for a store that has the rule off", async () => {
    expect(
      (await place({ brand: ALL, method: "cod", channel: "admin" })).advance_percent,
    ).toBeNull();
    expect((await place({ brand: OFF, method: "cod" })).advance_percent).toBeNull();
  });

  it("does not move when the store later changes its percentage", async () => {
    const order = await place({ brand: ALL, method: "card" });
    await db.query(
      "UPDATE public.business_settings SET advance_payment_percent = 60 WHERE brand_id = $1",
      [ALL],
    );
    const row = await db.query<{ advance_percent: string }>(
      "SELECT advance_percent FROM public.orders WHERE id = $1",
      [order.id],
    );
    expect(row.rows[0].advance_percent).toBe("30.00");
    await db.query(
      "UPDATE public.business_settings SET advance_payment_percent = 30 WHERE brand_id = $1",
      [ALL],
    );
  });
});

describe("cash on delivery, refused when the order is committed", () => {
  const refused = (order: Placed) =>
    expect(place({ ...order, method: "cod" })).rejects.toThrow(/ADVANCE_PAYMENT_REQUIRED/);
  const allowed = async (order: Placed) =>
    expect((await place({ ...order, method: "cod" })).id).toBeTruthy();

  it("for every order when the rule covers everything", async () => {
    await refused({ brand: ALL });
    await refused({ brand: ALL, fulfillment: "pickup" });
  });

  it("only when the order has a made-to-order line, under made_to_order", async () => {
    await allowed({ brand: MTO, lines: [{ amount: 100 }] });
    await refused({ brand: MTO, lines: [{ amount: 60, custom: true }, { amount: 40 }] });
  });

  it("only for delivered orders, under delivery", async () => {
    await allowed({ brand: DEL, fulfillment: "pickup" });
    await allowed({ brand: DEL, fulfillment: "digital" });
    await refused({ brand: DEL, fulfillment: "delivery" });
  });

  it("for a delivered order or a made-to-order line, under both", async () => {
    await allowed({ brand: EITHER, fulfillment: "pickup", lines: [{ amount: 100 }] });
    await refused({ brand: EITHER, fulfillment: "pickup", lines: [{ amount: 50, custom: true }] });
    await refused({ brand: EITHER, fulfillment: "delivery", lines: [{ amount: 100 }] });
  });

  it("never for staff-made orders or a store with the rule off", async () => {
    await allowed({ brand: ALL, channel: "admin" });
    await allowed({ brand: OFF });
  });

  it("leaves no order behind when it refuses", async () => {
    const count = async () =>
      (await db.query<{ n: string }>("SELECT count(*) AS n FROM public.orders")).rows[0].n;
    const before = await count();
    await refused({ brand: ALL });
    expect(await count()).toBe(before);
  });
});

describe("what an order owes in advance", () => {
  const owed = async (order: Placed) => due((await place({ ...order, method: "card" })).id);

  it("is the percentage of the total under all, rounded up to the fils", async () => {
    expect(await owed({ brand: ALL })).toBe(30);
    expect(await owed({ brand: ALL, lines: [{ amount: 41.25 }] })).toBe(12.375);
    expect(await owed({ brand: ALL, lines: [{ amount: 10.001 }] })).toBe(3.001);
  });

  it("takes only the made-to-order lines, not the delivery fee, under made_to_order", async () => {
    const lines = [{ amount: 60, custom: true }, { amount: 40 }];
    expect(await owed({ brand: MTO, lines })).toBe(30);
    expect(await owed({ brand: MTO, lines, shipping: 5 })).toBe(30);
    // A discount comes off every line alike: 90 left, made-to-order share 54, half of it.
    expect(await owed({ brand: MTO, lines, total: 90 })).toBe(27);
    expect(await owed({ brand: MTO, lines: [{ amount: 100 }] })).toBeNull();
  });

  it("is the whole delivered order, delivery fee included, under delivery", async () => {
    expect(await owed({ brand: DEL, shipping: 5 })).toBe(31.5);
    expect(await owed({ brand: DEL, fulfillment: "pickup" })).toBeNull();
    expect(await owed({ brand: DEL, fulfillment: "appointment" })).toBeNull();
  });

  it("is a delivered order whole, else its made-to-order lines, under both", async () => {
    const lines = [{ amount: 60, custom: true }, { amount: 40 }];
    expect(await owed({ brand: EITHER, lines, shipping: 5 })).toBe(42);
    expect(await owed({ brand: EITHER, lines, fulfillment: "pickup" })).toBe(24);
    expect(await owed({ brand: EITHER, fulfillment: "pickup" })).toBeNull();
  });

  it("is never more than the total, and the whole matching part at 100%", async () => {
    await db.query(
      "UPDATE public.business_settings SET advance_payment_percent = 100 WHERE brand_id = $1",
      [MTO],
    );
    expect(await owed({ brand: MTO, lines: [{ amount: 60, custom: true }, { amount: 40 }] })).toBe(
      60,
    );
    expect(await owed({ brand: MTO, lines: [{ amount: 100, custom: true }] })).toBe(100);
    await db.query(
      "UPDATE public.business_settings SET advance_payment_percent = 50 WHERE brand_id = $1",
      [MTO],
    );
  });

  it("is nothing for an order without a rule", async () => {
    expect(await due((await place({ brand: OFF, method: "card" })).id)).toBeNull();
    expect(
      await due((await place({ brand: ALL, method: "card", channel: "admin" })).id),
    ).toBeNull();
    expect(await due("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("approving a BenefitPay receipt", () => {
  const seed = async (order: Placed, receipt = "r1.jpg", method = "benefit") => {
    const row = await place({ ...order, method });
    await db.query(
      "UPDATE public.orders SET benefit_receipt_key = $2, status = 'pending_verification' WHERE id = $1",
      [row.id, receipt],
    );
    return row.id;
  };
  const approve = (id: string) =>
    db.query<{ r: { approved: boolean; advance_only?: boolean; already_paid?: boolean } }>(
      "SELECT public.approve_benefit_payment($1) AS r",
      [id],
    );
  const state = async (id: string) => {
    const row = (
      await db.query<{ payment_status: string; advance_paid: string; status: string }>(
        "SELECT payment_status, advance_paid, status FROM public.orders WHERE id = $1",
        [id],
      )
    ).rows[0];
    return { ...row, paid: Number(row.advance_paid) };
  };

  it("records only the advance and leaves the balance due, under the rule", async () => {
    await setAdmin(true);
    const id = await seed({ brand: ALL });
    expect((await approve(id)).rows[0].r).toMatchObject({ approved: true, advance_only: true });
    expect(await state(id)).toMatchObject({
      payment_status: "partially_paid",
      status: "confirmed",
      paid: 30,
    });
  });

  it("records the advance of the matching lines only, under made_to_order", async () => {
    await setAdmin(true);
    const id = await seed({ brand: MTO, lines: [{ amount: 60, custom: true }, { amount: 40 }] });
    await approve(id);
    expect(await state(id)).toMatchObject({ payment_status: "partially_paid", paid: 30 });
  });

  it("marks the whole order paid when the rule does not reach it (as before)", async () => {
    await setAdmin(true);
    const ready = await seed({ brand: MTO, lines: [{ amount: 100 }] });
    expect((await approve(ready)).rows[0].r).toMatchObject({
      approved: true,
      advance_only: false,
    });
    expect(await state(ready)).toMatchObject({ payment_status: "paid", paid: 100 });
    const pickup = await seed({ brand: DEL, fulfillment: "pickup" });
    await approve(pickup);
    expect(await state(pickup)).toMatchObject({ payment_status: "paid", paid: 100 });
  });

  it("does not approve twice, is for staff only, and needs a BenefitPay receipt", async () => {
    await setAdmin(true);
    const id = await seed({ brand: ALL });
    await approve(id);
    expect((await approve(id)).rows[0].r).toMatchObject({ already_paid: true });
    expect((await state(id)).payment_status).toBe("partially_paid");
    await setAdmin(false);
    await expect(approve(await seed({ brand: ALL }))).rejects.toThrow(/FORBIDDEN/);
    await setAdmin(true);
    await expect(approve(await seed({ brand: ALL }, "r.jpg", "card"))).rejects.toThrow(
      /BENEFIT_RECEIPT_NOT_FOUND/,
    );
  });
});
