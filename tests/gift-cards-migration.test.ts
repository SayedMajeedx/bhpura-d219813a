import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import paymentState from "../supabase/migrations/20261012130000_payment_state_is_one_fact.sql?raw";
import migration from "../supabase/migrations/20261101100000_gift_cards.sql?raw";

// Gift cards, step one (migration 20261101100000), run in a real Postgres (PGlite) with the live
// payment state trigger: a card is issued, taken as payment on an order (the order's collected
// money and state follow), given back when the order is released, and voided; a balance is
// always the sum of its moves, and nobody but the store's order staff can do any of it.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000aa";

// The live trigger that settles paid against part paid, taken from its own migration.
const paymentAmounts = (() => {
  const start = paymentState.indexOf("CREATE OR REPLACE FUNCTION public.orders_payment_amounts()");
  const end = paymentState.indexOf("-- Named to run before trg_orders_sync_payment_fulfillment");
  const trigger = paymentState.slice(
    end,
    paymentState.indexOf("FOR EACH ROW EXECUTE FUNCTION public.orders_payment_amounts();", end),
  );
  return (
    paymentState.slice(start, end) +
    trigger +
    "FOR EACH ROW EXECUTE FUNCTION public.orders_payment_amounts();"
  );
})();

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${STAFF}'::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  -- The caller's store and permission, as the test says.
  CREATE FUNCTION public.can_access_brand(p uuid) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p::text = current_setting('test.staff_of', true) $$;
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p = ANY (string_to_array(coalesce(current_setting('test.perms', true), ''), ',')) $$;
  GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid), public.has_permission(text) TO anon, authenticated;

  CREATE TABLE public.brands (id uuid PRIMARY KEY);
  INSERT INTO public.brands VALUES ('${BRAND}'), ('${OTHER}');
  CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY, currency text);
  INSERT INTO public.business_settings VALUES ('${BRAND}', 'BHD'), ('${OTHER}', 'SAR');
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL DEFAULT '${BRAND}',
    currency text DEFAULT 'BHD', payment_method text DEFAULT 'cod',
    payment_status text NOT NULL DEFAULT 'unpaid', status text NOT NULL DEFAULT 'pending',
    total numeric NOT NULL DEFAULT 0, advance_paid numeric NOT NULL DEFAULT 0
  );
  GRANT SELECT ON public.orders TO authenticated;
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

const staff = async (brand = BRAND, perms = "manage_orders") => {
  await db.exec(`SET test.staff_of = '${brand}'; SET test.perms = '${perms}';`);
};

const issue = async (amount: number, extra = "") => {
  await staff();
  const reply = await as(
    "authenticated",
    `SELECT id, code, balance::float AS balance, currency FROM public.issue_gift_card('${BRAND}', $1${extra})`,
    [amount],
  );
  if (reply.error) throw new Error(reply.error);
  return reply.rows[0] as { id: string; code: string; balance: number; currency: string };
};

const order = async (total: number, method = "cod", extra: Record<string, string> = {}) => {
  const columns = ["total", "payment_method", ...Object.keys(extra)];
  const values = [String(total), `'${method}'`, ...Object.values(extra).map((v) => `'${v}'`)];
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.orders (${columns.join(", ")}) VALUES (${values.join(", ")}) RETURNING id`,
  );
  return rows[0].id;
};

const redeem = async (orderId: string, code: string, amount?: number) => {
  await staff();
  return as(
    "authenticated",
    amount === undefined
      ? "SELECT public.redeem_gift_card_on_order($1, $2) AS r"
      : "SELECT public.redeem_gift_card_on_order($1, $2, $3) AS r",
    amount === undefined ? [orderId, code] : [orderId, code, amount],
  );
};

const orderRow = async (id: string) =>
  (
    await db.query<{ advance_paid: number; gift_card_paid: number; payment_status: string }>(
      "SELECT advance_paid::float AS advance_paid, gift_card_paid::float AS gift_card_paid, payment_status FROM public.orders WHERE id = $1",
      [id],
    )
  ).rows[0];

const card = async (id: string) =>
  (
    await db.query<{ balance: number; moves: number; status: string }>(
      `SELECT c.balance::float AS balance, c.status,
              (SELECT COALESCE(sum(amount), 0)::float FROM public.gift_card_movements m WHERE m.gift_card_id = c.id) AS moves
         FROM public.gift_cards c WHERE c.id = $1`,
      [id],
    )
  ).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(paymentAmounts);
  await db.exec(migration);
});

describe("issuing a card", () => {
  it("gives the store's staff a readable code in the store's currency, recorded as a move", async () => {
    const issued = await issue(50);
    expect(issued.code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(issued).toMatchObject({ balance: 50, currency: "BHD" });
    expect(await card(issued.id)).toEqual({ balance: 50, moves: 50, status: "active" });
  });

  it("is refused to staff without order rights, to another store's staff, to a visitor, and for no amount", async () => {
    await staff(BRAND, "manage_inventory");
    expect(
      (await as("authenticated", `SELECT public.issue_gift_card('${BRAND}', 10)`)).error,
    ).toMatch(/FORBIDDEN/);
    await staff(OTHER);
    expect(
      (await as("authenticated", `SELECT public.issue_gift_card('${BRAND}', 10)`)).error,
    ).toMatch(/FORBIDDEN/);
    expect((await as("anon", `SELECT public.issue_gift_card('${BRAND}', 10)`)).error).toMatch(
      /permission denied/,
    );
    await staff();
    expect(
      (await as("authenticated", `SELECT public.issue_gift_card('${BRAND}', 0)`)).error,
    ).toMatch(/GIFT_CARD_AMOUNT_INVALID/);
  });

  it("cannot be written or read from a browser except by the store's own staff", async () => {
    await staff();
    const write = await as(
      "authenticated",
      `INSERT INTO public.gift_cards (brand_id, code, currency, initial_amount, balance) VALUES ('${BRAND}', 'AAAA-AAAA-AAAA', 'BHD', 999, 999)`,
    );
    expect(write.error).toMatch(/permission denied/);
    expect((await as("anon", "SELECT * FROM public.gift_cards")).error).toMatch(
      /permission denied/,
    );
    await staff(OTHER);
    expect((await as("authenticated", "SELECT * FROM public.gift_cards")).rows).toHaveLength(0);
  });
});

describe("paying with a card", () => {
  it("takes part of a cash order, however the code is typed, and the rest is still owed", async () => {
    const issued = await issue(30);
    const id = await order(80);
    const typed = issued.code.replace(/-/g, "").toLowerCase();
    const reply = await redeem(id, typed);
    expect(reply.error).toBeNull();
    expect(reply.rows[0].r).toEqual({ amount: 30, balance: 0, owed: 50 });
    expect(await orderRow(id)).toEqual({
      advance_paid: 30,
      gift_card_paid: 30,
      payment_status: "partially_paid",
    });
    expect(await card(issued.id)).toMatchObject({ balance: 0, moves: 0 });
  });

  it("pays an order it covers, taking only what is owed", async () => {
    const issued = await issue(100);
    const id = await order(40, "card");
    expect((await redeem(id, issued.code)).rows[0].r).toEqual({ amount: 40, balance: 60, owed: 0 });
    expect(await orderRow(id)).toMatchObject({ advance_paid: 40, payment_status: "paid" });
    expect((await redeem(id, issued.code)).error).toMatch(/ORDER_NOTHING_OWED/);
  });

  it("must pay all that is owed on a card or transfer order until the checkout knows about cards", async () => {
    const issued = await issue(20);
    expect((await redeem(await order(50, "benefit"), issued.code)).error).toMatch(
      /GIFT_CARD_MUST_COVER_ONLINE/,
    );
    expect((await redeem(await order(50, "card"), issued.code)).error).toMatch(
      /GIFT_CARD_MUST_COVER_ONLINE/,
    );
    expect((await card(issued.id)).balance).toBe(20);
  });

  it("takes the amount asked when it is less", async () => {
    const issued = await issue(50);
    const id = await order(60);
    expect((await redeem(id, issued.code, 15)).rows[0].r).toEqual({
      amount: 15,
      balance: 35,
      owed: 45,
    });
  });

  it("refuses a card that is unknown, empty, expired, voided or in another currency, and an order that is closed", async () => {
    expect((await redeem(await order(10), "ZZZZ-ZZZZ-ZZZZ")).error).toMatch(/GIFT_CARD_NOT_FOUND/);

    const emptied = await issue(5);
    await redeem(await order(5), emptied.code);
    expect((await redeem(await order(5), emptied.code)).error).toMatch(/GIFT_CARD_EMPTY/);

    const old = await issue(5);
    await db.exec(
      `UPDATE public.gift_cards SET expires_on = current_date - 1 WHERE id = '${old.id}'`,
    );
    expect((await redeem(await order(5), old.code)).error).toMatch(/GIFT_CARD_EXPIRED/);

    const usd = await issue(5);
    expect((await redeem(await order(5, "cod", { currency: "SAR" }), usd.code)).error).toMatch(
      /GIFT_CARD_CURRENCY/,
    );

    const fine = await issue(5);
    expect((await redeem(await order(5, "cod", { status: "cancelled" }), fine.code)).error).toMatch(
      /ORDER_NOT_PAYABLE/,
    );
  });

  it("is not taken on another store's order", async () => {
    const issued = await issue(10);
    const theirs = await order(10, "cod", { brand_id: OTHER });
    expect((await redeem(theirs, issued.code)).error).toMatch(/ORDER_NOT_FOUND/);
  });
});

describe("a released order", () => {
  it("gives the card back what it paid, once, and the order no longer counts it as collected", async () => {
    const issued = await issue(50);
    const id = await order(80);
    await redeem(id, issued.code);
    await db.exec(`UPDATE public.orders SET advance_paid = advance_paid + 10 WHERE id = '${id}'`);
    await db.exec(`UPDATE public.orders SET status = 'cancelled' WHERE id = '${id}'`);
    expect(await card(issued.id)).toMatchObject({ balance: 50, moves: 50 });
    expect(await orderRow(id)).toEqual({
      advance_paid: 10,
      gift_card_paid: 0,
      payment_status: "partially_paid",
    });
    // Written again while cancelled: nothing more comes back.
    await db.exec(`UPDATE public.orders SET status = 'cancelled' WHERE id = '${id}'`);
    expect((await card(issued.id)).balance).toBe(50);
  });

  it("reads unpaid when a card had paid all of it", async () => {
    const issued = await issue(40);
    const id = await order(40);
    await redeem(id, issued.code);
    await db.exec(`UPDATE public.orders SET status = 'refunded' WHERE id = '${id}'`);
    expect(await orderRow(id)).toEqual({
      advance_paid: 0,
      gift_card_paid: 0,
      payment_status: "unpaid",
    });
    expect((await card(issued.id)).balance).toBe(40);
  });
});

describe("voiding a card", () => {
  it("writes off what it held, with a reason, and it can no longer pay", async () => {
    const issued = await issue(25);
    await staff();
    expect(
      (await as("authenticated", "SELECT public.void_gift_card($1, ' ')", [issued.id])).error,
    ).toMatch(/GIFT_CARD_REASON_REQUIRED/);
    expect(
      (
        await as("authenticated", "SELECT public.void_gift_card($1, 'Lost by the customer')", [
          issued.id,
        ])
      ).error,
    ).toBeNull();
    expect(await card(issued.id)).toEqual({ balance: 0, moves: 0, status: "voided" });
    expect((await redeem(await order(10), issued.code)).error).toMatch(/GIFT_CARD_VOIDED/);
  });
});
