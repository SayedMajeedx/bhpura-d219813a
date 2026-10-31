import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import paymentState from "../supabase/migrations/20261012130000_payment_state_is_one_fact.sql?raw";
import stepOne from "../supabase/migrations/20261101100000_gift_cards.sql?raw";
import stepTwo from "../supabase/migrations/20261102100000_gift_cards_checkout.sql?raw";

// Gift cards, step two (migration 20261102100000), run in a real Postgres with step one and the
// live payment state trigger: a shopper's card on the order they have just placed, the checkout's
// balance preview, staff taking a part on a transfer order, and the transfer approval counting what
// cards paid instead of writing over it.
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

const staff = () =>
  db.exec(
    `SET test.staff_of = '${BRAND}'; SET test.perms = 'manage_orders'; SET test.admin = 'yes';`,
  );

const issue = async (amount: number) => {
  await staff();
  const { rows, error } = await as(
    "authenticated",
    `SELECT id, code FROM public.issue_gift_card('${BRAND}', $1)`,
    [amount],
  );
  if (error) throw new Error(error);
  return rows[0] as { id: string; code: string };
};

const order = async (total: number, extra: Record<string, string | number> = {}) => {
  const columns = ["total", ...Object.keys(extra)];
  const values = [
    String(total),
    ...Object.values(extra).map((v) => (typeof v === "number" ? String(v) : `'${v}'`)),
  ];
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.orders (${columns.join(", ")}) VALUES (${values.join(", ")}) RETURNING id`,
  );
  return rows[0].id;
};

const row = async (id: string) =>
  (
    await db.query<{ advance_paid: number; gift_card_paid: number; payment_status: string }>(
      "SELECT advance_paid::float AS advance_paid, gift_card_paid::float AS gift_card_paid, payment_status FROM public.orders WHERE id = $1",
      [id],
    )
  ).rows[0];

const atCheckout = (orderId: string, code: string) =>
  as("service_role", "SELECT public.redeem_gift_card_at_checkout($1, $2) AS r", [orderId, code]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(paymentAmounts);
  await db.exec(stepOne);
  await db.exec(stepTwo);
});

describe("a card at checkout", () => {
  it("pays what it can of the shopper's fresh order, once", async () => {
    const card = await issue(30);
    const id = await order(80);
    expect((await atCheckout(id, card.code)).rows[0].r).toEqual({
      amount: 30,
      balance: 0,
      owed: 50,
    });
    expect(await row(id)).toEqual({
      advance_paid: 30,
      gift_card_paid: 30,
      payment_status: "partially_paid",
    });
    const again = await issue(10);
    expect((await atCheckout(id, again.code)).error).toMatch(/ORDER_ALREADY_PAYING/);
  });

  it("pays a whole order it covers", async () => {
    const card = await issue(100);
    const id = await order(45);
    expect((await atCheckout(id, card.code)).rows[0].r).toEqual({
      amount: 45,
      balance: 55,
      owed: 0,
    });
    expect((await row(id)).payment_status).toBe("paid");
  });

  it("is refused on a staff order, an order more than an hour old, and from a browser", async () => {
    const card = await issue(10);
    expect((await atCheckout(await order(20, { channel: "admin" }), card.code)).error).toMatch(
      /ORDER_NOT_FOUND/,
    );
    const old = await order(20);
    await db.exec(
      `UPDATE public.orders SET created_at = now() - interval '2 hours' WHERE id = '${old}'`,
    );
    expect((await atCheckout(old, card.code)).error).toMatch(/ORDER_NOT_FOUND/);
    for (const role of ["anon", "authenticated"] as const) {
      const reply = await as(role, "SELECT public.redeem_gift_card_at_checkout($1, $2)", [
        await order(20),
        card.code,
      ]);
      expect(reply.error).toMatch(/permission denied/);
    }
  });
});

describe("the checkout's balance preview", () => {
  it("says what a usable card holds in its store, and nothing for anything else", async () => {
    const card = await issue(25);
    const look = (slug: string, code: string) =>
      as("service_role", "SELECT public.gift_card_balance_for_checkout($1, $2) AS r", [slug, code]);
    expect((await look("pura", card.code.toLowerCase())).rows[0].r).toMatchObject({
      balance: 25,
      currency: "BHD",
    });
    expect((await look("other", card.code)).rows[0].r).toBeNull();
    expect((await look("pura", "ZZZZ-ZZZZ-ZZZZ")).rows[0].r).toBeNull();
    await db.exec(
      `UPDATE public.gift_cards SET expires_on = current_date - 1 WHERE id = '${card.id}'`,
    );
    expect((await look("pura", card.code)).rows[0].r).toBeNull();
    expect(
      (await as("authenticated", "SELECT public.gift_card_balance_for_checkout('pura', 'x')"))
        .error,
    ).toMatch(/permission denied/);
  });
});

describe("staff taking a card", () => {
  it("may now pay part of a transfer order, and still not part of a card order", async () => {
    const card = await issue(20);
    await staff();
    const transfer = await order(50, { payment_method: "benefit", channel: "admin" });
    expect(
      (
        await as("authenticated", "SELECT public.redeem_gift_card_on_order($1, $2) AS r", [
          transfer,
          card.code,
        ])
      ).error,
    ).toBeNull();
    const other = await issue(20);
    const cardOrder = await order(50, { payment_method: "card", channel: "admin" });
    expect(
      (
        await as("authenticated", "SELECT public.redeem_gift_card_on_order($1, $2)", [
          cardOrder,
          other.code,
        ])
      ).error,
    ).toMatch(/GIFT_CARD_MUST_COVER_ONLINE/);
  });
});

describe("approving a transfer after a card paid part", () => {
  const approve = async (id: string) => {
    await staff();
    return as("authenticated", "SELECT public.approve_benefit_payment($1) AS r", [id]);
  };

  it("records the whole order as paid, the card's part included", async () => {
    const card = await issue(30);
    const id = await order(80);
    await atCheckout(id, card.code);
    const reply = await approve(id);
    expect(reply.rows[0].r).toMatchObject({ approved: true, advance_only: false });
    expect(await row(id)).toEqual({ advance_paid: 80, gift_card_paid: 30, payment_status: "paid" });
  });

  it("records the advance asked, counting the card towards it, and never lowers what was collected", async () => {
    const card = await issue(30);
    const id = await order(80, { advance_due: 40 });
    await atCheckout(id, card.code);
    await approve(id);
    expect(await row(id)).toMatchObject({ advance_paid: 40, payment_status: "partially_paid" });

    const big = await issue(50);
    const covered = await order(80, { advance_due: 40 });
    await atCheckout(covered, big.code);
    await approve(covered);
    expect(await row(covered)).toMatchObject({
      advance_paid: 50,
      payment_status: "partially_paid",
    });
  });

  it("says a transfer was approved already only when more than the card was collected", async () => {
    const id = await order(60, { advance_due: 30 });
    await approve(id);
    expect((await approve(id)).rows[0].r).toMatchObject({ already_paid: true });
  });
});
