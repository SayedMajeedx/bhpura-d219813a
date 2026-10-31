import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import webPush from "../supabase/migrations/20261028100000_web_push_alerts.sql?raw";
import migration from "../supabase/migrations/20261028110000_alert_choices.sql?raw";
import giftCardNotices from "../supabase/migrations/20261105100000_gift_card_purchase_notices.sql?raw";
import { ALERT_KINDS, alertKindsFor, alertOn } from "../src/lib/alert-choices";

// Choosing the alerts a device takes (migration 20261028110000) in a real Postgres, with the live
// order event function as it is redefined: a shopper's booking request becomes an event, a new
// order says which channel made it, a device subscribed before keeps what it had and takes the
// new defaults, and a person changes only their own device's known choices.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OWNER = "00000000-0000-4000-8000-00000000000a";
const CLERK = "00000000-0000-4000-8000-00000000000c";
const KEY = "B".repeat(87);
const AUTH = "a".repeat(22);
const fcm = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql
      AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, brand_id uuid, role text, status text,
      permissions jsonb DEFAULT '{}');
    CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND brand_id = b) $$;
    CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
        AND (role = 'admin' OR jsonb_exists(permissions, p))) $$;
    CREATE FUNCTION public.format_currency_amount(n numeric, c text) RETURNS text LANGUAGE sql
      AS $$ SELECT n::text || ' ' || c $$;
    CREATE FUNCTION public.format_localized_order_status(f text, s text, p text) RETURNS text
      LANGUAGE sql AS $$ SELECT COALESCE(f, s) $$;
    CREATE TABLE public.push_notification_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
      event_type text NOT NULL CONSTRAINT push_notification_events_event_type_check
        CHECK (event_type IN ('order_new','order_updated','review_due','review_completed',
          'low_stock','system_failure')),
      entity_type text NOT NULL, entity_id uuid, dedupe_key text NOT NULL, title text NOT NULL,
      body text NOT NULL, target_url text, payload jsonb NOT NULL DEFAULT '{}',
      UNIQUE (brand_id, dedupe_key));
    CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid,
      invoice_number int, total numeric DEFAULT 0, currency text DEFAULT 'BHD',
      customer_name_snapshot text, status text, payment_status text, fulfillment_status text,
      channel text);
    CREATE TABLE public.bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid,
      status text, source text, customer_name text, event_date date);
    INSERT INTO public.brands VALUES ('${BRAND}');
    INSERT INTO auth.users VALUES ('${OWNER}'), ('${CLERK}');
    INSERT INTO public.profiles VALUES
      ('${OWNER}', '${BRAND}', 'admin', 'active', '{}'),
      ('${CLERK}', '${BRAND}', 'staff', 'active', '{"manage_orders": true}');
  `);
  await db.exec(webPush);
  // A device subscribed before this migration, which had turned new orders off.
  await db.query("SELECT set_config('test.uid', $1, false)", [OWNER]);
  await db.query("SELECT public.register_web_push_subscription($1, $2, $3, $4)", [
    BRAND,
    fcm("owner"),
    KEY,
    AUTH,
  ]);
  await db.exec(
    `UPDATE public.web_push_subscriptions SET preferences = '{"order_new": false}' WHERE endpoint = '${fcm("owner")}'`,
  );
  // The live trigger on orders (its function is redefined by the migration).
  await db.exec(`
    CREATE FUNCTION public.enqueue_mobile_order_push() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER enqueue_mobile_order_push AFTER INSERT OR UPDATE ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.enqueue_mobile_order_push();
  `);
  await db.exec(migration);
});

const as = (uid: string) => db.query("SELECT set_config('test.uid', $1, false)", [uid]);
const events = async (type: string) =>
  (
    await db.query<{ body: string; payload: Record<string, unknown>; target_url: string }>(
      "SELECT body, payload, target_url FROM public.push_notification_events WHERE event_type = $1",
      [type],
    )
  ).rows;
const targets = async (kind: string) =>
  (
    await db.query<{ endpoint: string }>(
      "SELECT endpoint FROM public.web_push_targets($1, $2) ORDER BY endpoint",
      [BRAND, kind],
    )
  ).rows.map((r) => r.endpoint);

describe("the store's events", () => {
  it("makes a shopper's booking request an event, and nothing else a booking does", async () => {
    await db.exec(`
      INSERT INTO public.bookings (brand_id, status, source, customer_name, event_date) VALUES
        ('${BRAND}', 'requested', 'storefront', 'Sara', '2026-11-05'),
        ('${BRAND}', 'hold', 'storefront', 'Huda', '2026-11-06'),
        ('${BRAND}', 'requested', 'admin', 'Mona', '2026-11-07');
    `);
    const booking = await events("booking_new");
    expect(booking).toHaveLength(1);
    expect(booking[0]).toMatchObject({ body: "Sara — 2026-11-05", target_url: "/bookings" });
  });

  it("says which channel made a new order", async () => {
    await db.exec(`
      INSERT INTO public.orders (brand_id, invoice_number, total, customer_name_snapshot, channel)
        VALUES ('${BRAND}', 1042, 25, 'Sara', 'storefront'), ('${BRAND}', 1043, 10, 'Ali', 'admin');
    `);
    const orders = await events("order_new");
    expect(orders.map((o) => o.payload.channel).sort()).toEqual(["admin", "storefront"]);
  });
});

describe("what a device takes", () => {
  it("keeps what a device chose before and takes the new defaults beside it", async () => {
    expect(await targets("order_new")).toEqual([]);
    expect(await targets("booking_new")).toEqual([fcm("owner")]);
    expect(await targets("order_new_staff")).toEqual([]);
    expect(await targets("low_stock")).toEqual([]);
  });

  it("starts a new device on new orders and booking requests only", async () => {
    await as(CLERK);
    await db.query("SELECT public.register_web_push_subscription($1, $2, $3, $4)", [
      BRAND,
      fcm("clerk"),
      KEY,
      AUTH,
    ]);
    expect(await targets("order_new")).toEqual([fcm("clerk")]);
    expect(await targets("order_updated")).toEqual([]);
  });

  it("lets a person change their own device's known choices, and nothing else", async () => {
    await as(CLERK);
    const saved = (
      await db.query<{ c: Record<string, unknown> }>(
        "SELECT public.set_web_push_alert_choices($1, $2) AS c",
        [
          fcm("clerk"),
          JSON.stringify({ low_stock: true, order_new: false, hack: true, review_due: "yes" }),
        ],
      )
    ).rows[0].c;
    expect(saved).toMatchObject({ low_stock: true, order_new: false, review_due: false });
    expect(saved).not.toHaveProperty("hack");
    expect(await targets("low_stock")).toEqual([fcm("clerk")]);

    // Another person's device is not theirs to change, nor to read.
    await expect(
      db.query("SELECT public.set_web_push_alert_choices($1, $2)", [
        fcm("owner"),
        JSON.stringify({ order_new: true }),
      ]),
    ).rejects.toThrow(/SUBSCRIPTION_NOT_FOUND/);
    const read = await db.query<{ c: unknown }>("SELECT public.web_push_alert_choices($1) AS c", [
      fcm("owner"),
    ]);
    expect(read.rows[0].c).toBeNull();
  });
});

describe("the choices on screen", () => {
  it("offers booking requests only where the store takes bookings", () => {
    expect(alertKindsFor({ bookings: false }).map((k) => k.key)).not.toContain("booking_new");
    expect(alertKindsFor({ bookings: true }).map((k) => k.key)).toContain("booking_new");
  });

  it("reads a saved choice, else the kind's default, as the database starts a device", () => {
    const kind = (key: string) => ALERT_KINDS.find((k) => k.key === key)!;
    expect(alertOn({}, kind("order_new"))).toBe(true);
    expect(alertOn({}, kind("booking_new"))).toBe(true);
    expect(alertOn({}, kind("order_new_staff"))).toBe(false);
    expect(alertOn({ order_new: false }, kind("order_new"))).toBe(false);
    // Every kind on screen is one the database knows, with the same default (the latest
    // migration that set it: gift card purchases joined in 20261105100000).
    expect(alertOn({}, kind("gift_card_new"))).toBe(true);
    const defaults = giftCardNotices.match(/SET DEFAULT '(\{[^']+\})'/)![1];
    expect(migration).toMatch(/SET DEFAULT '\{/);
    expect(JSON.parse(defaults)).toEqual(
      Object.fromEntries(ALERT_KINDS.map((k) => [k.key, k.defaultOn])),
    );
  });
});
