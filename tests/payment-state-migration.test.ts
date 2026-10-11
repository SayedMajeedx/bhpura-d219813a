import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261012130000_payment_state_is_one_fact.sql?raw";

// An order's payment is one fact (migration 20261012130000), run in a real Postgres (PGlite)
// on a small copy of the orders table: 'paid' and the collected amount always agree, a transfer
// is approved for what the order owed up front, an approved transfer is not rejected, and the
// first approval releases the hold and tells the customer once.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const STAFF = "00000000-0000-4000-8000-0000000000aa";

let db: PGlite;

// `advance_due` stands for what order_advance_due works out from the order's lines and rules
// (tested on its own in advance-payment-rule.test.ts): null when no rule reaches the order.
const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${STAFF}'::uuid $$;
  CREATE TABLE public.admin_flag (on_ boolean NOT NULL DEFAULT true);
  INSERT INTO public.admin_flag VALUES (true);
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT on_ FROM public.admin_flag $$;
  CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL DEFAULT '${BRAND}',
    label text, channel text NOT NULL DEFAULT 'storefront', payment_method text,
    payment_status text NOT NULL DEFAULT 'unpaid', status text NOT NULL DEFAULT 'pending',
    fulfillment_status text NOT NULL DEFAULT 'ON_HOLD', fulfillment_method text NOT NULL DEFAULT 'delivery',
    total numeric NOT NULL DEFAULT 0, advance_paid numeric NOT NULL DEFAULT 0,
    advance_percent numeric, advance_due numeric,
    benefit_receipt_key text, benefit_verified_at timestamptz, benefit_verified_by uuid,
    benefit_receipt_delete_after timestamptz, benefit_receipt_rejected_at timestamptz,
    benefit_receipt_rejected_by uuid, benefit_receipt_rejection_reason text,
    whatsapp_transactional_opt_in_at timestamptz, updated_at timestamptz
  );
  CREATE FUNCTION public.order_advance_due(p uuid) RETURNS numeric LANGUAGE sql
    AS $$ SELECT advance_due FROM public.orders WHERE id = p $$;
  CREATE TABLE public.sent (order_id uuid, channel text, event text);
  CREATE FUNCTION public.enqueue_order_email_event(uuid, uuid, text) RETURNS void LANGUAGE sql
    AS $$ INSERT INTO public.sent VALUES ($1, 'email', $3) $$;
  CREATE FUNCTION public.enqueue_order_whatsapp_event(uuid, text) RETURNS void LANGUAGE sql
    AS $$ INSERT INTO public.sent VALUES ($1, 'whatsapp', $2) $$;
  -- The triggers that are already on the table; the migration redefines their functions.
  CREATE FUNCTION public.trg_orders_payment_fulfillment_sync() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN RETURN NEW; END $$;
  CREATE FUNCTION public.automate_order_email_events() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN RETURN NEW; END $$;
  CREATE FUNCTION public.automate_order_whatsapp_events() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN RETURN NEW; END $$;
  CREATE TRIGGER trg_orders_sync_payment_fulfillment BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.trg_orders_payment_fulfillment_sync();
  CREATE TRIGGER automate_order_email_events AFTER INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.automate_order_email_events();
  CREATE TRIGGER automate_order_whatsapp_events AFTER UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.automate_order_whatsapp_events();
`;

// Orders written in a half state before the change, as they are found in a store.
const HALF_STATES = `
  INSERT INTO public.orders
    (label, channel, payment_method, payment_status, status, fulfillment_status, total, advance_paid, advance_percent, advance_due, benefit_receipt_key, benefit_verified_at)
  VALUES
    ('list marked an advance order paid', 'storefront', 'benefit', 'paid', 'confirmed', 'NEEDS_PACKING', 30, 0, 50, 14, 'r1', NULL),
    ('customer chose to pay everything', 'storefront', 'benefit', 'paid', 'confirmed', 'NEEDS_PACKING', 30, 0, 50, 30, 'r2', NULL),
    ('advance order already delivered', 'storefront', 'benefit', 'paid', 'completed', 'COMPLETED', 30, 0, 50, 14, 'r3', NULL),
    ('approved properly in full', 'storefront', 'benefit', 'paid', 'confirmed', 'NEEDS_PACKING', 30, 30, 50, 30, 'r4', now()),
    ('card paid in full', 'storefront', 'card', 'paid', 'confirmed', 'NEEDS_PACKING', 22, 0, NULL, NULL, NULL, NULL),
    ('cash order delivered from its page', 'admin', 'cod', 'paid', 'completed', 'COMPLETED', 8, 0, NULL, NULL, NULL, NULL),
    ('advance approved, left on hold', 'storefront', 'benefit', 'partially_paid', 'confirmed', 'ON_HOLD', 30, 14, 50, 14, 'r5', now()),
    ('waiting for its transfer', 'storefront', 'benefit', 'unpaid', 'pending', 'ON_HOLD', 30, 0, 50, 14, 'r6', NULL);
`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(HALF_STATES);
  await db.exec(migration);
});

type Row = {
  id: string;
  payment_status: string;
  status: string;
  fulfillment_status: string;
  total: string;
  advance_paid: string;
  benefit_verified_at: string | null;
  benefit_verified_by: string | null;
  benefit_receipt_delete_after: string | null;
};

const one = async (where: string, params: unknown[] = []) =>
  (await db.query<Row>(`SELECT * FROM public.orders WHERE ${where}`, params)).rows[0];
const byLabel = (label: string) => one("label = $1", [label]);
const byId = (id: string) => one("id = $1", [id]);
const paid = (row: Row) => [row.payment_status, Number(row.advance_paid)];

/** A new order; `advance_due` is what it owes up front (null: no advance rule reaches it). */
async function order(fields: Record<string, unknown> = {}) {
  const values = {
    payment_method: "benefit",
    total: 30,
    advance_percent: 50,
    advance_due: 14,
    benefit_receipt_key: "receipt",
    ...fields,
  };
  const columns = Object.keys(values);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.orders (${columns.join(", ")})
     VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING id`,
    Object.values(values),
  );
  return rows[0].id;
}

const set = (id: string, fields: Record<string, unknown>) => {
  const columns = Object.keys(fields);
  return db.query(
    `UPDATE public.orders SET ${columns.map((column, index) => `${column} = $${index + 2}`).join(", ")} WHERE id = $1`,
    [id, ...Object.values(fields)],
  );
};
const approve = (id: string) => db.query("SELECT public.approve_benefit_payment($1) AS r", [id]);
const sent = async (id: string) =>
  (
    await db.query<{ channel: string; event: string }>(
      "SELECT channel, event FROM public.sent WHERE order_id = $1 AND event <> 'order_placed'",
      [id],
    )
  ).rows.map((row) => `${row.channel}:${row.event}`);
const setAdmin = (on: boolean) => db.query("UPDATE public.admin_flag SET on_ = $1", [on]);

describe("orders that were already in a half state", () => {
  it("an advance order the list marked paid becomes what the approval would have recorded", async () => {
    const row = await byLabel("list marked an advance order paid");
    expect(paid(row)).toEqual(["partially_paid", 14]);
    expect(row.benefit_verified_at).not.toBeNull();
    expect(row.fulfillment_status).toBe("NEEDS_PACKING");
  });

  it("leaves paid an order that owed everything up front, was delivered, or was approved", async () => {
    expect(paid(await byLabel("customer chose to pay everything"))).toEqual(["paid", 30]);
    expect(paid(await byLabel("advance order already delivered"))).toEqual(["paid", 30]);
    expect(paid(await byLabel("approved properly in full"))).toEqual(["paid", 30]);
  });

  it("records the whole total on a paid order that never said what was collected", async () => {
    expect(paid(await byLabel("card paid in full"))).toEqual(["paid", 22]);
    expect(paid(await byLabel("cash order delivered from its page"))).toEqual(["paid", 8]);
  });

  it("takes an approved advance off hold, and leaves an unpaid order waiting", async () => {
    expect((await byLabel("advance approved, left on hold")).fulfillment_status).toBe(
      "NEEDS_PACKING",
    );
    const waiting = await byLabel("waiting for its transfer");
    expect(paid(waiting)).toEqual(["unpaid", 0]);
    expect(waiting.fulfillment_status).toBe("ON_HOLD");
  });
});

describe("'paid' and the collected amount always agree", () => {
  it("whoever writes 'paid', the whole total is collected", async () => {
    const id = await order({ payment_method: "card", advance_due: null, advance_percent: null });
    await set(id, { payment_status: "paid" });
    expect(paid(await byId(id))).toEqual(["paid", 30]);
  });

  it("an order created as paid records its total", async () => {
    const id = await order({ payment_method: "cash", payment_status: "paid", total: 12 });
    expect(paid(await byId(id))).toEqual(["paid", 12]);
  });

  it("a part payment that reaches the total is paid, and the order leaves the hold", async () => {
    const id = await order({ payment_method: "cod" });
    await set(id, { payment_status: "partially_paid", advance_paid: 10 });
    expect(paid(await byId(id))).toEqual(["partially_paid", 10]);
    await set(id, { advance_paid: 30 });
    const row = await byId(id);
    expect(paid(row)).toEqual(["paid", 30]);
    expect(row.fulfillment_status).toBe("NEEDS_PACKING");
  });

  it("the amount follows the total of a paid order", async () => {
    const id = await order({ payment_method: "card", payment_status: "paid" });
    await set(id, { total: 40 });
    expect(paid(await byId(id))).toEqual(["paid", 40]);
  });

  it("an unpaid order, a part payment and an order with no total are left as written", async () => {
    const unpaid = await order();
    await set(unpaid, { advance_paid: 5 });
    expect(paid(await byId(unpaid))).toEqual(["unpaid", 5]);
    const empty = await order({ total: 0, payment_status: "paid" });
    expect(paid(await byId(empty))).toEqual(["paid", 0]);
    const refunded = await order({ payment_status: "refunded", advance_paid: 30 });
    expect(paid(await byId(refunded))).toEqual(["refunded", 30]);
  });
});

describe("approving a transfer", () => {
  it("records only the advance of an order placed under an advance rule", async () => {
    const id = await order();
    const { rows } = await approve(id);
    expect(rows[0]).toMatchObject({ r: { approved: true, advance_only: true } });
    const row = await byId(id);
    expect(paid(row)).toEqual(["partially_paid", 14]);
    expect(row.status).toBe("confirmed");
    expect(row.benefit_verified_by).toBe(STAFF);
    expect(row.benefit_verified_at).not.toBeNull();
    expect(row.benefit_receipt_delete_after).not.toBeNull();
  });

  it("releases the hold and tells the customer, for an advance as for a full payment", async () => {
    const advance = await order({ whatsapp_transactional_opt_in_at: new Date().toISOString() });
    await approve(advance);
    expect((await byId(advance)).fulfillment_status).toBe("NEEDS_PACKING");
    expect(await sent(advance)).toEqual([
      "email:benefit_payment_approved",
      "whatsapp:benefit_payment_approved",
    ]);

    const full = await order({ advance_due: null, advance_percent: null });
    await approve(full);
    const row = await byId(full);
    expect(paid(row)).toEqual(["paid", 30]);
    expect(row.fulfillment_status).toBe("NEEDS_PACKING");
    expect(await sent(full)).toEqual(["email:benefit_payment_approved"]);
  });

  it("does not say 'your receipt was approved' again when the balance is collected", async () => {
    const id = await order();
    await approve(id);
    await set(id, { advance_paid: 30, status: "completed", fulfillment_status: "COMPLETED" });
    expect(paid(await byId(id))).toEqual(["paid", 30]);
    expect(await sent(id)).toEqual(["email:benefit_payment_approved", "email:order_delivered"]);
  });

  it("approves an order with no uploaded receipt, and one paid by bank transfer", async () => {
    const id = await order({
      channel: "admin",
      payment_method: "bank_transfer",
      benefit_receipt_key: null,
      advance_due: null,
      advance_percent: null,
    });
    await approve(id);
    const row = await byId(id);
    expect(paid(row)).toEqual(["paid", 30]);
    expect(row.benefit_verified_at).not.toBeNull();
    expect(row.benefit_receipt_delete_after).toBeNull();
  });

  it("an order that owes its whole total up front is paid in full", async () => {
    const id = await order({ advance_due: 30 });
    await approve(id);
    expect(paid(await byId(id))).toEqual(["paid", 30]);
  });

  it("approving twice changes nothing", async () => {
    const id = await order();
    await approve(id);
    const { rows } = await approve(id);
    expect(rows[0]).toMatchObject({ r: { approved: true, already_paid: true } });
    expect(paid(await byId(id))).toEqual(["partially_paid", 14]);
    expect(await sent(id)).toEqual(["email:benefit_payment_approved"]);
  });

  it("refuses an order that is not paid by transfer, and a caller who is not an admin", async () => {
    const card = await order({ payment_method: "card" });
    await expect(approve(card)).rejects.toThrow("NOT_A_TRANSFER_ORDER");
    const id = await order();
    await setAdmin(false);
    await expect(approve(id)).rejects.toThrow("FORBIDDEN");
    await setAdmin(true);
    expect(paid(await byId(id))).toEqual(["unpaid", 0]);
  });
});

describe("rejecting a receipt", () => {
  it("is refused once the advance was approved (it would cancel a paid order)", async () => {
    const id = await order();
    await approve(id);
    await expect(
      db.query("SELECT public.reject_benefit_payment($1, $2)", [id, "wrong amount"]),
    ).rejects.toThrow("PAYMENT_ALREADY_APPROVED");
    await expect(db.query("SELECT public.reject_benefit_payment($1)", [id])).rejects.toThrow(
      "PAYMENT_ALREADY_APPROVED",
    );
    const row = await byId(id);
    expect(paid(row)).toEqual(["partially_paid", 14]);
    expect(row.status).toBe("confirmed");
  });

  it("still cancels an order whose transfer was not approved, and tells the customer", async () => {
    const id = await order();
    await db.query("SELECT public.reject_benefit_payment($1, $2)", [id, "wrong amount"]);
    const row = await byId(id);
    expect(paid(row)).toEqual(["unpaid", 0]);
    expect(row.status).toBe("cancelled");
    expect(await sent(id)).toEqual(["email:benefit_payment_rejected"]);
  });
});
