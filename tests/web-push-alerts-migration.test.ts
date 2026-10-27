import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261028100000_web_push_alerts.sql?raw";

// Order alerts on the installed admin (migration 20261028100000) in a real Postgres: who may turn
// them on for a store, that a device's subscription goes only to a browser's own push service,
// that a person removes only their own, and who the sender delivers each event to.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const OWNER = "00000000-0000-4000-8000-00000000000a";
const CLERK = "00000000-0000-4000-8000-00000000000c";
const STOCKMAN = "00000000-0000-4000-8000-00000000000d";
const COURIER = "00000000-0000-4000-8000-00000000000e";
const STRANGER = "00000000-0000-4000-8000-00000000000f";

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
    -- The live rules, reduced to what they read here.
    CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'active'
        AND (role = 'super_admin' OR brand_id = b)) $$;
    CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'active'
        AND (role IN ('admin', 'super_admin', 'brand_admin') OR jsonb_exists(permissions, p))) $$;
    INSERT INTO public.brands VALUES ('${BRAND}'), ('${OTHER}');
    INSERT INTO auth.users VALUES ('${OWNER}'), ('${CLERK}'), ('${STOCKMAN}'), ('${COURIER}'),
      ('${STRANGER}');
    INSERT INTO public.profiles VALUES
      ('${OWNER}', '${BRAND}', 'admin', 'active', '{}'),
      ('${CLERK}', '${BRAND}', 'staff', 'active', '{"manage_orders": true}'),
      ('${STOCKMAN}', '${BRAND}', 'staff', 'active', '{"manage_inventory": true}'),
      ('${COURIER}', '${BRAND}', 'courier', 'active', '{}'),
      ('${STRANGER}', '${OTHER}', 'admin', 'active', '{}');
  `);
  await db.exec(migration);
});

const as = (uid: string) => db.query("SELECT set_config('test.uid', $1, false)", [uid]);
const register = (brand: string, endpoint: string) =>
  db.query("SELECT public.register_web_push_subscription($1, $2, $3, $4, 'iPhone')", [
    brand,
    endpoint,
    KEY,
    AUTH,
  ]);
const targets = async (brand: string, event = "order_new") =>
  (
    await db.query<{ endpoint: string }>(
      "SELECT endpoint FROM public.web_push_targets($1, $2) ORDER BY endpoint",
      [brand, event],
    )
  ).rows.map((r) => r.endpoint);

describe("turning order alerts on for a device", () => {
  it("is open to the store's staff who handle its orders", async () => {
    await as(OWNER);
    await register(BRAND, fcm("owner"));
    await as(CLERK);
    await register(BRAND, fcm("clerk"));
    for (const [uid, brand] of [
      [STOCKMAN, BRAND],
      [COURIER, BRAND],
      [STRANGER, BRAND],
    ] as const) {
      await as(uid);
      await expect(register(brand, fcm(uid))).rejects.toThrow(/NOT_AUTHORIZED/);
    }
    await as("");
    await expect(register(BRAND, fcm("nobody"))).rejects.toThrow(/AUTH_REQUIRED/);
  });

  it("only sends to a browser's own push service", async () => {
    await as(OWNER);
    for (const endpoint of [
      "https://web.push.apple.com/QAbc",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://wns2-db5p.notify.windows.com/w/?token=x",
    ]) {
      await register(BRAND, endpoint);
    }
    for (const endpoint of [
      "https://evil.example/fcm.googleapis.com/",
      "http://fcm.googleapis.com/x",
      "https://fcm.googleapis.com.evil.example/x",
    ]) {
      await expect(register(BRAND, endpoint)).rejects.toThrow(/check constraint/);
    }
    await db.exec("DELETE FROM public.web_push_subscriptions WHERE endpoint NOT LIKE '%fcm%'");
  });

  it("lets a person remove only their own device", async () => {
    await as(CLERK);
    await db.query("SELECT public.remove_web_push_subscription($1)", [fcm("owner")]);
    expect(await targets(BRAND)).toEqual([fcm("clerk"), fcm("owner")]);
    await as(OWNER);
    await db.query("SELECT public.remove_web_push_subscription($1)", [fcm("owner")]);
    expect(await targets(BRAND)).toEqual([fcm("clerk")]);
    await register(BRAND, fcm("owner"));
  });
});

describe("who receives an alert", () => {
  it("is the store's subscriptions for that kind of event, never another store's", async () => {
    expect(await targets(BRAND)).toEqual([fcm("clerk"), fcm("owner")]);
    expect(await targets(OTHER)).toEqual([]);
    // Order updates are not asked for by default (a new order is what wakes a phone).
    expect(await targets(BRAND, "order_updated")).toEqual([]);
  });

  it("stops at once for a member switched off or who lost the permission", async () => {
    await db.exec(`UPDATE public.profiles SET permissions = '{}' WHERE id = '${CLERK}'`);
    expect(await targets(BRAND)).toEqual([fcm("owner")]);
    await db.exec(`UPDATE public.profiles SET status = 'inactive' WHERE id = '${OWNER}'`);
    expect(await targets(BRAND)).toEqual([]);
  });

  it("is the sender's to read, never a browser's", async () => {
    await db.exec("SET ROLE authenticated");
    try {
      await expect(
        db.query("SELECT * FROM public.web_push_targets($1, 'order_new')", [BRAND]),
      ).rejects.toThrow(/permission denied/);
      await expect(db.query("SELECT * FROM public.web_push_subscriptions")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec("RESET ROLE");
    }
  });
});
