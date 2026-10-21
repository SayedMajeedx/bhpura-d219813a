import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import migration from "../supabase/migrations/20261021130000_abandoned_cart_recording_restored.sql?raw";

// No new abandoned cart was recorded from 2026-09-05: the live recording function called
// gen_random_bytes() under `search_path = public`, and pgcrypto lives in the `extensions`
// schema, as it does here. Run in a real Postgres (PGlite) with the live function first, then
// migration 20261021130000, and called as a visitor the way the storefront calls it.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const STORE = "00000000-0000-4000-8000-000000000001";
const OTHER_STORE = "00000000-0000-4000-8000-000000000002";
const CLOSED_STORE = "00000000-0000-4000-8000-000000000003";
const SHOPPER = "00000000-0000-4000-8000-0000000000a1";
const SHOPPER_CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const SOMEONE_ELSE = "00000000-0000-4000-8000-0000000000c2";

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA extensions;
  CREATE EXTENSION pgcrypto SCHEMA extensions;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;

  CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY, currency text);
  CREATE TABLE public.customers (
    id uuid PRIMARY KEY, brand_id uuid NOT NULL, auth_user_id uuid, name text, email text, phone text,
    marketing_consent boolean, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, channel text,
    customer_id uuid, customer_email_snapshot text, customer_phone_snapshot text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.abandoned_carts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    session_id text NOT NULL, guest_email text, guest_phone text, guest_name text,
    cart_items jsonb NOT NULL DEFAULT '[]'::jsonb,
    subtotal numeric NOT NULL DEFAULT 0.000 CHECK (subtotal >= 0),
    currency text NOT NULL DEFAULT 'BHD',
    recovery_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
    status text NOT NULL DEFAULT 'active',
    marketing_consent boolean NOT NULL DEFAULT false,
    last_activity_at timestamptz NOT NULL DEFAULT now(), abandoned_at timestamptz,
    recovery_attempts_count integer NOT NULL DEFAULT 0, last_recovery_sent_at timestamptz,
    recovered_at timestamptz, recovered_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    recovery_discount_code text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT abandoned_carts_status_check CHECK (status = ANY (ARRAY['active', 'abandoned',
      'recovering', 'recovered', 'expired', 'unsubscribed']))
  );

  INSERT INTO public.brands VALUES ('${STORE}', 'store', true), ('${OTHER_STORE}', 'other', true),
    ('${CLOSED_STORE}', 'closed', false);
  INSERT INTO public.business_settings VALUES ('${STORE}', 'BHD'), ('${OTHER_STORE}', 'SAR');
  INSERT INTO public.customers (id, brand_id, auth_user_id, name, email, phone) VALUES
    ('${SHOPPER_CUSTOMER}', '${STORE}', '${SHOPPER}', 'Mariam', 'mariam@example.com', '+97333000001'),
    ('${SOMEONE_ELSE}', '${STORE}', NULL, 'Someone', 'someone@example.com', '+97333000002');
`;

// The function as it was live from migration 20260905090000 (pg_get_functiondef, 2026-10-21).
const LIVE_RECORDING = `
CREATE OR REPLACE FUNCTION public.rpc_record_or_update_cart_activity(p_brand_id uuid, p_session_id text, p_customer_id uuid DEFAULT NULL::uuid, p_guest_email text DEFAULT NULL::text, p_guest_phone text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text, p_cart_items jsonb DEFAULT '[]'::jsonb, p_subtotal numeric DEFAULT 0.000, p_currency text DEFAULT 'BHD'::text, p_marketing_consent boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cart_id uuid; v_recovery_token text;
BEGIN
  SELECT id, recovery_token INTO v_cart_id, v_recovery_token FROM public.abandoned_carts
   WHERE brand_id = p_brand_id AND session_id = p_session_id
     AND status IN ('active', 'abandoned', 'recovering') ORDER BY created_at DESC LIMIT 1;
  IF v_cart_id IS NULL THEN
    v_recovery_token := encode(gen_random_bytes(16), 'hex');
    INSERT INTO public.abandoned_carts (brand_id, session_id, customer_id, cart_items, subtotal, currency, recovery_token)
    VALUES (p_brand_id, p_session_id, p_customer_id, p_cart_items, p_subtotal, p_currency, v_recovery_token)
    RETURNING id INTO v_cart_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'cart_id', v_cart_id, 'recovery_token', v_recovery_token);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rpc_record_or_update_cart_activity(uuid, text, uuid, text, text, text, jsonb, numeric, text, boolean) TO anon, authenticated;
`;

let db: PGlite;
let liveError: string | null = null;

type Reply = Record<string, unknown>;

/** Calls a function as the storefront does: a visitor, or a signed-in shopper. */
async function call(fn: string, args: Record<string, unknown>, uid: string | null = null) {
  const names = Object.keys(args);
  const sql = `SELECT public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) AS reply`;
  await db.exec(`SET test.uid = '${uid ?? ""}'`);
  await db.exec(`SET ROLE ${uid ? "authenticated" : "anon"}`);
  try {
    const result = await db.query<{ reply: Reply }>(
      sql,
      names.map((n) => args[n]),
    );
    return result.rows[0].reply;
  } finally {
    await db.exec("RESET ROLE");
  }
}

const line = (name = "Abaya") => ({ product_id: "p1", name, title: name, price: 25, qty: 1 });

function record(session: string, extra: Record<string, unknown> = {}, uid: string | null = null) {
  return call(
    "rpc_record_or_update_cart_activity",
    {
      p_brand_id: STORE,
      p_session_id: session,
      p_cart_items: JSON.stringify([line()]),
      p_subtotal: 25,
      p_currency: "BHD",
      ...extra,
    },
    uid,
  );
}

async function cartOf(session: string, brand = STORE) {
  const rows = await db.query<Record<string, unknown>>(
    "SELECT * FROM public.abandoned_carts WHERE brand_id = $1 AND session_id = $2 ORDER BY created_at DESC",
    [brand, session],
  );
  return rows.rows[0];
}

async function placeOrder(fields: Record<string, unknown> = {}) {
  const row = { brand_id: STORE, channel: "storefront", ...fields };
  const names = Object.keys(row);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.orders (${names.join(", ")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    names.map((n) => row[n as keyof typeof row]),
  );
  return rows[0].id;
}

const markRecovered = (orderId: string, extra: Record<string, unknown> = {}) =>
  call("rpc_mark_cart_recovered_on_order", {
    p_brand_id: STORE,
    p_order_id: orderId,
    ...extra,
  });

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SCHEMA);
  await db.exec(LIVE_RECORDING);
  try {
    await record("before-the-fix");
  } catch (error) {
    liveError = (error as Error).message;
  }
  // A cart closed by an order before the fix without ever being abandoned.
  const earlier = await placeOrder();
  await db.query(
    `INSERT INTO public.abandoned_carts (brand_id, session_id, status, recovered_at, recovered_order_id, cart_items)
     VALUES ($1, 'went-straight-to-checkout', 'recovered', now(), $2, '[{"name":"Abaya"}]')`,
    [STORE, earlier],
  );
  await db.exec(migration);
  await db.exec(
    `GRANT EXECUTE ON FUNCTION public.rpc_mark_cart_recovered_on_order(uuid, uuid, uuid, text, text, text) TO anon, authenticated`,
  );
});

describe("recording a cart", () => {
  it("failed for every new cart before the fix, because gen_random_bytes was not on the path", () => {
    expect(liveError).toMatch(/gen_random_bytes/);
  });

  it("records a visitor's new cart, in the store's currency, with a token for the recovery link", async () => {
    const reply = await record("visitor-1", { p_currency: "USD" });
    expect(reply.success).toBe(true);
    expect(reply.recovery_token).toMatch(/^[0-9a-f]{32}$/);
    const cart = await cartOf("visitor-1");
    expect(cart).toMatchObject({ status: "active", currency: "BHD", marketing_consent: false });
    expect(cart.customer_id).toBeNull();
  });

  it("updates the same cart on the next change instead of adding one", async () => {
    await record("visitor-2");
    await record("visitor-2", {
      p_cart_items: JSON.stringify([line(), line("Shayla")]),
      p_subtotal: 50,
    });
    const { rows } = await db.query(
      "SELECT 1 FROM public.abandoned_carts WHERE session_id = 'visitor-2'",
    );
    expect(rows).toHaveLength(1);
    expect(Number((await cartOf("visitor-2")).subtotal)).toBe(50);
  });

  it("never takes a customer id from the caller, and takes the signed-in shopper's own", async () => {
    await record("named-someone", { p_customer_id: SOMEONE_ELSE, p_marketing_consent: true });
    const named = await cartOf("named-someone");
    expect(named.customer_id).toBeNull();
    expect(named.marketing_consent).toBe(false);

    await record("signed-in", { p_customer_id: SOMEONE_ELSE }, SHOPPER);
    expect(await cartOf("signed-in")).toMatchObject({
      customer_id: SHOPPER_CUSTOMER,
      guest_phone: "+97333000001",
      guest_name: "Mariam",
    });
  });

  it("refuses a cart that is not a cart, or a store that is closed", async () => {
    const many = Array.from({ length: 101 }, () => line());
    expect((await record("too-many", { p_cart_items: JSON.stringify(many) })).error).toBe(
      "INVALID_CART_ITEMS",
    );
    const huge = [{ ...line(), name: "x".repeat(70_000) }];
    expect((await record("too-big", { p_cart_items: JSON.stringify(huge) })).error).toBe(
      "INVALID_CART_ITEMS",
    );
    expect((await record("x".repeat(101))).error).toBe("INVALID_CART_SESSION");
    expect((await record("negative", { p_subtotal: -1 })).error).toBe("INVALID_CART_SUBTOTAL");
    expect((await record("closed", { p_brand_id: CLOSED_STORE })).error).toBe("STORE_NOT_FOUND");
    const { rows } = await db.query(
      "SELECT 1 FROM public.abandoned_carts WHERE session_id IN ('too-many', 'too-big', 'negative', 'closed')",
    );
    expect(rows).toHaveLength(0);
  });

  it("keeps contact fields short", async () => {
    await record("long-name", { p_guest_name: "n".repeat(500), p_guest_phone: "9".repeat(80) });
    const cart = await cartOf("long-name");
    expect(String(cart.guest_name)).toHaveLength(120);
    expect(String(cart.guest_phone)).toHaveLength(32);
  });

  it("takes at most 300 new carts per store in ten minutes, and still updates existing ones", async () => {
    await db.query(
      `INSERT INTO public.abandoned_carts (brand_id, session_id, cart_items)
       SELECT $1, 'flood-' || n, '[{"name":"x"}]' FROM generate_series(1, 300) n`,
      [OTHER_STORE],
    );
    const refused = await record("flood-new", { p_brand_id: OTHER_STORE });
    expect(refused.error).toBe("TOO_MANY_CARTS");
    const updated = await record("flood-1", { p_brand_id: OTHER_STORE });
    expect(updated.success).toBe(true);
    expect((await cartOf("flood-1", OTHER_STORE)).currency).toBe("SAR");
  });

  it("follows the shopper's latest answer about messages, and keeps it when nothing is asked", async () => {
    const contact = { p_guest_phone: "+97333000009" };
    await record("consent", { ...contact, p_marketing_consent: true });
    expect((await cartOf("consent")).marketing_consent).toBe(true);
    await record("consent", { ...contact, p_marketing_consent: null });
    expect((await cartOf("consent")).marketing_consent).toBe(true);
    await record("consent", { ...contact, p_marketing_consent: false });
    expect((await cartOf("consent")).marketing_consent).toBe(false);
  });

  it("does not count a yes without a way to reach the shopper", async () => {
    await record("consent-no-contact", { p_marketing_consent: true });
    expect((await cartOf("consent-no-contact")).marketing_consent).toBe(false);
  });

  it("closes an emptied cart and keeps what was in it", async () => {
    await record("emptied");
    await record("emptied", { p_cart_items: "[]", p_subtotal: 0 });
    const cart = await cartOf("emptied");
    expect(cart.status).toBe("expired");
    expect(cart.cart_items).toHaveLength(1);
  });
});

describe("closing carts when an order is placed", () => {
  it("refuses an order id that is not a recent storefront order of the store", async () => {
    await record("checkout-guard");
    const staffOrder = await placeOrder({ channel: "admin" });
    const otherStore = await placeOrder({ brand_id: OTHER_STORE });
    const old = await placeOrder({ created_at: new Date(Date.now() - 2 * 3600_000).toISOString() });
    for (const id of [crypto.randomUUID(), staffOrder, otherStore, old]) {
      const reply = await markRecovered(id, { p_session_id: "checkout-guard" });
      expect(reply.error).toBe("ORDER_NOT_FOUND");
    }
    expect((await cartOf("checkout-guard")).status).toBe("active");
  });

  it("never closes a cart by a phone or an email the caller names", async () => {
    await record("their-cart", { p_guest_phone: "+97333000077" });
    const order = await placeOrder({ customer_phone_snapshot: "+97333000088" });
    await markRecovered(order, { p_guest_phone: "+97333000077" });
    expect((await cartOf("their-cart")).status).toBe("active");
  });

  it("calls a cart that went straight to checkout converted, not recovered", async () => {
    await record("straight");
    const order = await placeOrder();
    const reply = await markRecovered(order, { p_session_id: "straight" });
    expect(reply).toMatchObject({
      success: true,
      recovered_carts_count: 0,
      converted_carts_count: 1,
    });
    expect(await cartOf("straight")).toMatchObject({
      status: "converted",
      recovered_order_id: order,
    });
  });

  it("calls a cart recovered when it was abandoned, came back and was ordered", async () => {
    await record("came-back", { p_guest_phone: "+97333000055" });
    await db.exec(
      "UPDATE public.abandoned_carts SET status = 'abandoned', abandoned_at = now() - interval '2 hours' WHERE session_id = 'came-back'",
    );
    // The shopper changes the cart again before ordering: it is still a cart that came back.
    await record("came-back", { p_guest_phone: "+97333000055", p_subtotal: 30 });
    const order = await placeOrder({ customer_phone_snapshot: "+97333000055" });
    const reply = await markRecovered(order, {});
    expect(reply.recovered_carts_count).toBe(1);
    const cart = await cartOf("came-back");
    expect(cart.status).toBe("recovered");
    expect(cart.abandoned_at).not.toBeNull();
  });

  it("closes the order's own customer's carts from another device", async () => {
    await record("phone-of-shopper", {}, SHOPPER);
    const order = await placeOrder({ customer_id: SHOPPER_CUSTOMER });
    await markRecovered(order, { p_session_id: "laptop-of-shopper" });
    expect((await cartOf("phone-of-shopper")).status).toBe("converted");
  });

  it("re-reads the carts closed before the fix: one never abandoned was converted", async () => {
    expect((await cartOf("went-straight-to-checkout")).status).toBe("converted");
  });
});
