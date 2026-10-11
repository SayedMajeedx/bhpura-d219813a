import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import consignment from "../supabase/migrations/20260821193000_incubator_consignment_management.sql?raw";
import migration from "../supabase/migrations/20261012170000_partner_money.sql?raw";

// Partner money (migration 20261012170000) in a real Postgres (PGlite): a payment can be
// voided, a partner's figures and its settlement are worked out by the database, and a batch
// of transfers happens together or not at all. Payments are recorded by the real
// record_incubator_payment.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000aa";
const VARIANT = "00000000-0000-4000-8000-0000000000f1";
const SHORT = "00000000-0000-4000-8000-0000000000f2";

let db: PGlite;

const functionOf = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tag = /\$(\w*)\$/.exec(sql.slice(start))![0];
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return `${sql.slice(start, end + tag.length)};`;
};

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  INSERT INTO auth.users VALUES ('${STAFF}');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
  CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT current_setting('app.brand', true) = b::text $$;
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT current_setting('app.permission', true) = p $$;
  CREATE TABLE public.incubators (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, name text,
    settlement_day integer, is_active boolean NOT NULL DEFAULT true
  );
  CREATE TABLE public.incubator_inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, incubator_id uuid NOT NULL,
    variant_id uuid NOT NULL, quantity integer NOT NULL DEFAULT 0, consignment_price numeric NOT NULL DEFAULT 0
  );
  CREATE TABLE public.incubator_sales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, incubator_id uuid NOT NULL,
    variant_id uuid, quantity integer NOT NULL DEFAULT 1, gross_amount numeric NOT NULL DEFAULT 0,
    commission_amount numeric NOT NULL DEFAULT 0, net_due numeric NOT NULL DEFAULT 0,
    paid_amount numeric NOT NULL DEFAULT 0, sold_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'confirmed', created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.incubator_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, incubator_id uuid NOT NULL,
    amount numeric NOT NULL, payment_date date NOT NULL DEFAULT CURRENT_DATE, payment_method text,
    reference text, notes text, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.incubator_payment_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL REFERENCES public.incubator_payments(id) ON DELETE CASCADE,
    sale_id uuid NOT NULL REFERENCES public.incubator_sales(id), amount numeric NOT NULL
  );
  -- The single transfer, reduced to what the batch needs of it: it moves a piece, and refuses
  -- one the store does not have.
  CREATE TABLE public.transferred (incubator_id uuid, variant_id uuid, quantity integer, price numeric, code text, note text);
  CREATE FUNCTION public.transfer_stock_to_incubator(
    p_incubator_id uuid, p_variant_id uuid, p_quantity integer, p_external_code text DEFAULT NULL,
    p_price numeric DEFAULT NULL, p_commission_type text DEFAULT NULL,
    p_commission_value numeric DEFAULT NULL, p_notes text DEFAULT NULL
  ) RETURNS uuid LANGUAGE plpgsql AS $$
  BEGIN
    IF p_variant_id = '${SHORT}' THEN RAISE EXCEPTION 'INSUFFICIENT_MAIN_STOCK'; END IF;
    INSERT INTO public.transferred VALUES (p_incubator_id, p_variant_id, p_quantity, p_price, p_external_code, p_notes);
    RETURN gen_random_uuid();
  END $$;
`;

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
const asStaff = (brand = BRAND, permission = "manage_inventory") =>
  db.exec(
    `SET app.uid = '${STAFF}'; SET app.brand = '${brand}'; SET app.permission = '${permission}'`,
  );
const asNobody = () => db.exec("SET app.uid = ''; SET app.brand = ''; SET app.permission = ''");

const partner = async (settlementDay: number | null = null) =>
  (
    await one<{ id: string }>(
      "INSERT INTO public.incubators (brand_id, name, settlement_day) VALUES ($1, 'Souq Box', $2) RETURNING id",
      [BRAND, settlementDay],
    )
  ).id;
/** A confirmed sale of two pieces at 30: 60 gross, 6 commission, 54 owed to the store. */
const sell = async (incubator: string, soldAt: string, patch: Record<string, unknown> = {}) => {
  const values = {
    brand_id: BRAND,
    incubator_id: incubator,
    quantity: 2,
    gross_amount: 60,
    commission_amount: 6,
    net_due: 54,
    sold_at: soldAt,
    ...patch,
  };
  const columns = Object.keys(values);
  return (
    await one<{ id: string }>(
      `INSERT INTO public.incubator_sales (${columns.join(", ")})
       VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING id`,
      Object.values(values),
    )
  ).id;
};
const pay = async (incubator: string, amount: number) =>
  (
    await one<{ id: string }>("SELECT public.record_incubator_payment($1, $2) AS id", [
      incubator,
      amount,
    ])
  ).id;
const paidOn = async (sale: string) =>
  Number(
    (
      await one<{ paid_amount: string }>(
        "SELECT paid_amount FROM public.incubator_sales WHERE id = $1",
        [sale],
      )
    ).paid_amount,
  );
const voidPayment = (id: string, reason = "Typed twice") =>
  db.query("SELECT public.void_incubator_payment($1, $2)", [id, reason]);
type Summary = Record<string, string | number | null>;
const summary = async (incubator: string, today = "2026-10-11", tz = "UTC") => {
  const { rows } = await db.query<Summary>(
    "SELECT * FROM public.incubator_summaries($1, $2::date, $3) WHERE incubator_id = $4",
    [BRAND, today, tz, incubator],
  );
  const row = rows[0];
  const day = (value: unknown) =>
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : value === null
        ? null
        : String(value);
  return {
    units: Number(row.units),
    stockValue: Number(row.stock_value),
    soldUnits: Number(row.sold_units),
    gross: Number(row.gross),
    commission: Number(row.commission),
    net: Number(row.net),
    paid: Number(row.paid),
    due: Number(row.due),
    overdue: Number(row.overdue),
    last: day(row.last_settlement),
    next: day(row.next_settlement),
  };
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(functionOf(consignment, "record_incubator_payment"));
  await db.exec(migration);
  await db.exec("SET TIME ZONE 'UTC'");
  await asStaff();
});

describe("voiding a payment", () => {
  it("makes the sales it settled owe their part again, and keeps the payment on record", async () => {
    const id = await partner();
    const first = await sell(id, "2026-09-01T12:00:00Z");
    const second = await sell(id, "2026-09-02T12:00:00Z");
    const payment = await pay(id, 60);
    expect([await paidOn(first), await paidOn(second)]).toEqual([54, 6]);

    await voidPayment(payment, "  Typed twice ");
    expect([await paidOn(first), await paidOn(second)]).toEqual([0, 0]);
    const row = await one<{
      voided_at: string | null;
      voided_by: string;
      void_reason: string;
      amount: string;
    }>(
      "SELECT voided_at, voided_by, void_reason, amount FROM public.incubator_payments WHERE id = $1",
      [payment],
    );
    expect(row.voided_at).not.toBeNull();
    expect(row.voided_by).toBe(STAFF);
    expect(row.void_reason).toBe("Typed twice");
    expect(Number(row.amount)).toBe(60);
    const left = await one<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.incubator_payment_allocations WHERE payment_id = $1",
      [payment],
    );
    expect(left.n).toBe(0);
  });

  it("lets the right amount be recorded afterwards", async () => {
    const id = await partner();
    const sale = await sell(id, "2026-09-01T12:00:00Z");
    await voidPayment(await pay(id, 54));
    // Nothing is paid, so the whole amount can be paid again (it would exceed the due otherwise).
    await pay(id, 50);
    expect(await paidOn(sale)).toBe(50);
    expect((await summary(id)).paid).toBe(50);
  });

  it("is done once, with a reason", async () => {
    const id = await partner();
    await sell(id, "2026-09-01T12:00:00Z");
    const payment = await pay(id, 10);
    await expect(voidPayment(payment, " ")).rejects.toThrow("VOID_REASON_REQUIRED");
    await voidPayment(payment);
    await expect(voidPayment(payment)).rejects.toThrow("PAYMENT_ALREADY_VOIDED");
  });

  it("is for the store's own staff who manage inventory", async () => {
    const id = await partner();
    const sale = await sell(id, "2026-09-01T12:00:00Z");
    const payment = await pay(id, 10);
    await asNobody();
    await expect(voidPayment(payment)).rejects.toThrow("NOT_AUTHORIZED");
    await asStaff(OTHER);
    await expect(voidPayment(payment)).rejects.toThrow("NOT_AUTHORIZED");
    await asStaff(BRAND, "manage_orders");
    await expect(voidPayment(payment)).rejects.toThrow("NOT_AUTHORIZED");
    await asStaff();
    expect(await paidOn(sale)).toBe(10);
  });
});

describe("a partner's figures, added up by the database", () => {
  it("count the shelf, the confirmed sales, the two shares, what was paid and what is owed", async () => {
    const id = await partner();
    await db.query(
      "INSERT INTO public.incubator_inventory (brand_id, incubator_id, variant_id, quantity, consignment_price) VALUES ($1, $2, $3, 3, 30), ($1, $2, $4, 0, 99)",
      [BRAND, id, VARIANT, SHORT],
    );
    await sell(id, "2026-09-01T12:00:00Z");
    await sell(id, "2026-09-02T12:00:00Z");
    await sell(id, "2026-09-03T12:00:00Z", { status: "reversed" });
    await pay(id, 54);
    await voidPayment(await pay(id, 20));

    expect(await summary(id)).toMatchObject({
      units: 3,
      stockValue: 90,
      soldUnits: 4,
      gross: 120,
      commission: 12,
      net: 108,
      // The voided payment is not money received.
      paid: 54,
      due: 54,
    });
  });

  it("are all zero for a partner with nothing yet", async () => {
    const id = await partner();
    expect(await summary(id)).toEqual({
      units: 0,
      stockValue: 0,
      soldUnits: 0,
      gross: 0,
      commission: 0,
      net: 0,
      paid: 0,
      due: 0,
      overdue: 0,
      last: null,
      next: null,
    });
  });

  it("never mix one store's partners with another's", async () => {
    await partner();
    const { rows } = await db.query("SELECT * FROM public.incubator_summaries($1)", [OTHER]);
    expect(rows).toEqual([]);
  });
});

describe("a partner's settlement day", () => {
  it("says when the last and the next settlement fall", async () => {
    const id = await partner(5);
    expect(await summary(id, "2026-10-11")).toMatchObject({
      last: "2026-10-05",
      next: "2026-11-05",
    });
    expect(await summary(id, "2026-10-05")).toMatchObject({
      last: "2026-10-05",
      next: "2026-11-05",
    });
    expect(await summary(id, "2026-10-04")).toMatchObject({
      last: "2026-09-05",
      next: "2026-10-05",
    });
    expect(await summary(id, "2026-01-02")).toMatchObject({
      last: "2025-12-05",
      next: "2026-01-05",
    });
  });

  it("falls on the last day of a month that is shorter than it", async () => {
    const id = await partner(31);
    expect(await summary(id, "2026-02-10")).toMatchObject({
      last: "2026-01-31",
      next: "2026-02-28",
    });
    expect(await summary(id, "2026-04-30")).toMatchObject({
      last: "2026-04-30",
      next: "2026-05-31",
    });
  });

  it("makes overdue what is still unpaid for sales made before the last settlement", async () => {
    const id = await partner(5);
    await sell(id, "2026-09-20T12:00:00Z"); // before 5 October: overdue
    await sell(id, "2026-10-08T12:00:00Z"); // after it: due at the next settlement
    expect(await summary(id, "2026-10-11")).toMatchObject({ due: 108, overdue: 54 });
    // Paying the older sale clears what is overdue (payments settle the oldest sale first).
    await pay(id, 54);
    expect(await summary(id, "2026-10-11")).toMatchObject({ due: 54, overdue: 0 });
  });

  it("reads a sale's day on the reader's own calendar", async () => {
    const id = await partner(5);
    // 22:30 UTC on 4 October is already 5 October in Bahrain.
    await sell(id, "2026-10-04T22:30:00Z");
    expect((await summary(id, "2026-10-11", "UTC")).overdue).toBe(54);
    expect((await summary(id, "2026-10-11", "Asia/Bahrain")).overdue).toBe(0);
  });

  it("has no dates and nothing overdue for a partner with no settlement day", async () => {
    const id = await partner(null);
    await sell(id, "2026-01-01T12:00:00Z");
    expect(await summary(id)).toMatchObject({ due: 54, overdue: 0, last: null, next: null });
  });
});

describe("a batch of transfers", () => {
  const item = (variant: string, quantity: number, patch: Record<string, unknown> = {}) => ({
    variant_id: variant,
    quantity,
    external_code: " SB-1 ",
    price: 30,
    commission_type: "percentage",
    commission_value: 10,
    ...patch,
  });
  const batch = (incubator: string, items: unknown) =>
    db.query("SELECT public.transfer_stock_to_incubator_batch($1, $2::jsonb, $3) AS pieces", [
      incubator,
      JSON.stringify(items),
      "Weekend restock",
    ]);
  const moved = async (incubator: string) =>
    (
      await db.query(
        "SELECT variant_id, quantity, price, code, note FROM public.transferred WHERE incubator_id = $1",
        [incubator],
      )
    ).rows;

  it("moves every piece and says how many", async () => {
    const id = await partner();
    const other = "00000000-0000-4000-8000-0000000000f3";
    const { rows } = await batch(id, [item(VARIANT, 2), item(other, 3, { external_code: "" })]);
    expect(rows[0]).toEqual({ pieces: 5 });
    expect(await moved(id)).toEqual([
      { variant_id: VARIANT, quantity: 2, price: "30", code: "SB-1", note: "Weekend restock" },
      { variant_id: other, quantity: 3, price: "30", code: null, note: "Weekend restock" },
    ]);
  });

  it("moves nothing when one piece cannot go, and names the piece", async () => {
    const id = await partner();
    await expect(batch(id, [item(VARIANT, 2), item(SHORT, 1), item(VARIANT, 1)])).rejects.toThrow(
      `INSUFFICIENT_MAIN_STOCK:${SHORT}`,
    );
    expect(await moved(id)).toEqual([]);
  });

  it("refuses an empty list", async () => {
    const id = await partner();
    await expect(batch(id, [])).rejects.toThrow("NOTHING_TO_TRANSFER");
    await expect(batch(id, { not: "a list" })).rejects.toThrow("NOTHING_TO_TRANSFER");
  });
});

describe("who may call them", () => {
  it("no visitor can void a payment, read the figures or run a batch", async () => {
    const rights = await one<Record<string, boolean>>(`
      SELECT
        has_function_privilege('anon', 'public.void_incubator_payment(uuid, text)', 'execute') AS void,
        has_function_privilege('anon', 'public.incubator_summaries(uuid, date, text)', 'execute') AS figures,
        has_function_privilege('anon', 'public.transfer_stock_to_incubator_batch(uuid, jsonb, text)', 'execute') AS batch
    `);
    expect(Object.values(rights)).toEqual([false, false, false]);
    const staff = await one<Record<string, boolean>>(`
      SELECT
        has_function_privilege('authenticated', 'public.void_incubator_payment(uuid, text)', 'execute') AS void,
        has_function_privilege('authenticated', 'public.incubator_summaries(uuid, date, text)', 'execute') AS figures,
        has_function_privilege('authenticated', 'public.transfer_stock_to_incubator_batch(uuid, jsonb, text)', 'execute') AS batch
    `);
    expect(Object.values(staff)).toEqual([true, true, true]);
  });
});
