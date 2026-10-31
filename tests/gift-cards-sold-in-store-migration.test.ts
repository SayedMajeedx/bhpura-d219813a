import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import paymentState from "../supabase/migrations/20261012130000_payment_state_is_one_fact.sql?raw";
import stepOne from "../supabase/migrations/20261101100000_gift_cards.sql?raw";
import stepTwo from "../supabase/migrations/20261102100000_gift_cards_checkout.sql?raw";
import stepThree from "../supabase/migrations/20261103100000_gift_cards_sold_in_store.sql?raw";

// Gift cards, step three (migration 20261103100000), run in a real Postgres after steps one and
// two: a card sold in the store says how it was paid (or that it was given), and the reports read
// the cards' ledger per period: sold, given, spent net of what released orders gave back, written
// off, and held at the period's end; and what active cards hold now.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000aa";

const paymentAmounts = (() => {
  const start = paymentState.indexOf("CREATE OR REPLACE FUNCTION public.orders_payment_amounts()");
  const end = paymentState.indexOf("-- Named to run before trg_orders_sync_payment_fulfillment");
  const tail = "FOR EACH ROW EXECUTE FUNCTION public.orders_payment_amounts();";
  return paymentState.slice(start, paymentState.indexOf(tail, end)) + tail;
})();

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${STAFF}'::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  CREATE FUNCTION public.can_access_brand(p uuid) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p::text = current_setting('test.staff_of', true) $$;
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p = ANY (string_to_array(coalesce(current_setting('test.perms', true), ''), ',')) $$;
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT coalesce(current_setting('test.admin', true), '') = 'yes' $$;
  GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid), public.has_permission(text), public.is_admin()
    TO anon, authenticated;

  CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text UNIQUE);
  INSERT INTO public.brands VALUES ('${BRAND}', 'pura'), ('${OTHER}', 'other');
  CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY, currency text);
  INSERT INTO public.business_settings VALUES ('${BRAND}', 'BHD'), ('${OTHER}', 'BHD');
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL DEFAULT '${BRAND}',
    channel text NOT NULL DEFAULT 'storefront', created_at timestamptz NOT NULL DEFAULT now(),
    currency text DEFAULT 'BHD', payment_method text DEFAULT 'benefit',
    payment_status text NOT NULL DEFAULT 'unpaid', status text NOT NULL DEFAULT 'pending',
    total numeric NOT NULL DEFAULT 0, advance_paid numeric NOT NULL DEFAULT 0,
    advance_due numeric, benefit_receipt_key text, benefit_verified_at timestamptz,
    benefit_verified_by uuid, benefit_receipt_delete_after timestamptz, updated_at timestamptz
  );
  GRANT SELECT ON public.orders TO authenticated;
  -- What the order asks up front, as the test sets it (the live function reads its rules).
  CREATE FUNCTION public.order_advance_due(p uuid) RETURNS numeric LANGUAGE sql
    AS $$ SELECT advance_due FROM public.orders WHERE id = p $$;
  -- The reports' caller check, as the test says (the live one reads the profile).
  CREATE FUNCTION public.reporting_brand_id(p text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
  BEGIN
    IF NOT public.has_permission('view_financials') THEN RAISE EXCEPTION 'Denied: view_financials permission required'; END IF;
    RETURN current_setting('test.staff_of', true)::uuid;
  END $$;
  GRANT EXECUTE ON FUNCTION public.reporting_brand_id(text) TO authenticated;
  CREATE TABLE public.bookings (order_id uuid, deposit_amount numeric, late_payment_slot_taken_at timestamptz);
`;
let db: PGlite;

async function as(
  role: "anon" | "authenticated" | "service_role",
  sql: string,
  params: unknown[] = [],
) {
  await db.exec(`SET ROLE ${role}`);
  try {
    return {
      rows: (await db.query<Record<string, unknown>>(sql, params)).rows,
      error: null as string | null,
    };
  } catch (error) {
    return { rows: [] as Record<string, unknown>[], error: (error as Error).message };
  } finally {
    await db.exec("RESET ROLE");
  }
}

const staff = (perms = "manage_orders,view_financials") =>
  db.exec(`SET test.staff_of = '${BRAND}'; SET test.perms = '${perms}'; SET test.admin = 'yes';`);

const sell = async (amount: number, paidWith: string | null) => {
  await staff();
  const reply = await as(
    "authenticated",
    "SELECT id, code, paid_with FROM public.issue_gift_card(p_brand_id => $1, p_amount => $2, p_paid_with => $3)",
    [BRAND, amount, paidWith],
  );
  if (reply.error) throw new Error(reply.error);
  return reply.rows[0] as { id: string; code: string; paid_with: string | null };
};

const order = async (total: number) =>
  (
    await db.query<{ id: string }>(
      `INSERT INTO public.orders (total, payment_method, channel) VALUES (${total}, 'cod', 'admin') RETURNING id`,
    )
  ).rows[0].id;

// Moves the card's moves to a day, so periods can be told apart.
const dated = (cardId: string, day: string) =>
  db.exec(
    `UPDATE public.gift_card_movements SET created_at = '${day}' WHERE gift_card_id = '${cardId}'`,
  );

const report = async (periods: { from: string; to: string }[], perms?: string) => {
  await staff(perms);
  return as("authenticated", "SELECT public.rpc_reporting_gift_cards($1::jsonb) AS r", [
    JSON.stringify(periods),
  ]);
};

const OCT = { from: "2026-10-01T00:00:00Z", to: "2026-11-01T00:00:00Z" };
const SEP = { from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z" };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(paymentAmounts);
  await db.exec(stepOne);
  await db.exec(stepTwo);
  await db.exec(stepThree);
});

describe("a card sold in the store", () => {
  it("says how it was paid, or that it was given", async () => {
    expect((await sell(20, "cash")).paid_with).toBe("cash");
    expect((await sell(20, "CARD ")).paid_with).toBe("card");
    expect((await sell(20, null)).paid_with).toBeNull();
    await staff();
    const wrong = await as(
      "authenticated",
      "SELECT public.issue_gift_card(p_brand_id => $1, p_amount => 10, p_paid_with => 'cheque')",
      [BRAND],
    );
    expect(wrong.error).toMatch(/GIFT_CARD_PAID_WITH_INVALID/);
  });

  it("keeps step one's calls working, as a card given", async () => {
    await staff();
    const reply = await as(
      "authenticated",
      "SELECT paid_with FROM public.issue_gift_card($1, 15, 'Sara')",
      [BRAND],
    );
    expect(reply.error).toBeNull();
    expect(reply.rows[0].paid_with).toBeNull();
  });
});

describe("the reports' gift card lines", () => {
  beforeAll(async () => {
    await db.exec("DELETE FROM public.gift_card_movements; DELETE FROM public.gift_cards;");
    // September: 50 sold for cash, 30 given. October: 40 sold by card machine; 30 of the cash
    // card spent on an order; 15 of the given card spent on an order that is then cancelled (the
    // 15 come back, so nothing of it was spent); the given card voided, its 30 written off.
    const cash = await sell(50, "cash");
    const given = await sell(30, null);
    await dated(cash.id, "2026-09-10");
    await dated(given.id, "2026-09-12");
    const machine = await sell(40, "card");
    await dated(machine.id, "2026-10-05");

    await staff();
    const paid = await order(100);
    await as("authenticated", "SELECT public.redeem_gift_card_on_order($1, $2, 30)", [
      paid,
      cash.code,
    ]);
    const released = await order(100);
    await as("authenticated", "SELECT public.redeem_gift_card_on_order($1, $2, 15)", [
      released,
      given.code,
    ]);
    await db.exec(`UPDATE public.orders SET status = 'cancelled' WHERE id = '${released}'`);
    await as("authenticated", "SELECT public.void_gift_card($1, 'Expired goodwill')", [given.id]);
    await db.exec(
      `UPDATE public.gift_card_movements SET created_at = '2026-10-20' WHERE kind <> 'issued'`,
    );
  });

  it("says each period's sales, spending, write-offs and what was held at its end", async () => {
    const reply = await report([SEP, OCT]);
    expect(reply.error).toBeNull();
    const [sep, oct] = (reply.rows[0].r as { periods: Record<string, number>[] }).periods;
    expect(sep).toMatchObject({
      sold: 50,
      sold_cash: 50,
      sold_count: 1,
      given: 30,
      spent: 0,
      held_at_end: 80,
    });
    expect(oct).toMatchObject({
      sold: 40,
      sold_card: 40,
      given: 0,
      spent: 30,
      written_off: 30,
      held_at_end: 60,
    });
  });

  it("says what active cards hold now", async () => {
    const reply = await report([OCT]);
    expect((reply.rows[0].r as { now: Record<string, number> }).now).toMatchObject({
      held: 60,
      held_cards: 2,
      held_expired: 0,
    });
  });

  it("is for staff who see the finances", async () => {
    const reply = await report([OCT], "manage_orders");
    expect(reply.error).toMatch(/view_financials/);
    expect((await as("anon", "SELECT public.rpc_reporting_gift_cards('[]'::jsonb)")).error).toMatch(
      /permission denied/,
    );
    expect((await report([])).error).toMatch(/INVALID_PERIODS/);
  });
});
