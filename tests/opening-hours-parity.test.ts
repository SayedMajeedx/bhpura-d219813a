import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import previous from "../supabase/migrations/20261024140000_delivery_day_and_time.sql?raw";
import migration from "../supabase/migrations/20261027110000_opening_hours_and_busy_pause.sql?raw";
import {
  intakeSentence,
  openState,
  orderIntake,
  pauseOf,
  readHours,
  storedHours,
  DEFAULT_HOURS,
} from "../src/lib/opening-hours";

// Opening hours and the busy pause (migration 20261027110000) in a real Postgres: the database's
// store_open_state and the storefront's openState say the same of every set of hours and moment;
// a storefront order or booking is refused while paused, and an order outside the hours of a store
// that refuses them; staff orders, staff bookings and appointments are not.

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";

const viewColumns = (sql: string) => {
  const body = sql.slice(sql.lastIndexOf("CREATE OR REPLACE VIEW public.brand_public_settings"));
  return [...body.slice(0, body.indexOf(" FROM ")).matchAll(/\b(?:bs|b)\.([a-z_0-9]+)/g)].map(
    (match) => match[1],
  );
};

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, is_active boolean DEFAULT true);
    INSERT INTO public.brands (id) VALUES ('${BRAND}');
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY);
    INSERT INTO public.business_settings VALUES ('${BRAND}');
    CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid,
      channel text, fulfillment_method text);
    CREATE TABLE public.bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid,
      source text NOT NULL);
  `);
  // The migration without its view (the view's columns are checked below on the text).
  await db.exec(migration.slice(0, migration.indexOf("CREATE OR REPLACE VIEW")));
});

let seed = 7;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const HOURS: unknown[] = [
  {},
  { enabled: false, days: {} },
  { enabled: true },
  { enabled: true, days: {} },
  { enabled: true, days: { "0": [{ from: "10:00", to: "22:00" }] } },
  {
    enabled: true,
    timezone: "Asia/Dubai",
    days: {
      "1": [
        { from: "09:00", to: "13:00" },
        { from: "16:00", to: "24:00" },
      ],
      "5": [{ from: "14:00", to: "22:00" }],
      "6": [
        { from: "22:00", to: "10:00" },
        { from: "bad", to: "10:00" },
      ],
    },
  },
  storedHours({ ...DEFAULT_HOURS, enabled: true }),
  { enabled: true, timezone: "Europe/London", days: { "3": [{ from: "00:00", to: "00:30" }] } },
  { enabled: true, days: [{ from: "10:00", to: "12:00" }] },
];
// A few random weeks of windows.
for (let i = 0; i < 25; i += 1) {
  const days: Record<string, unknown> = {};
  for (let d = 0; d < 7; d += 1) {
    if (random() < 0.3) continue;
    const start = Math.floor(random() * 22) * 60 + (random() < 0.5 ? 0 : 30);
    const end = Math.min(start + 30 + Math.floor(random() * 10) * 60, 24 * 60);
    days[String(d)] = [{ from: hhmm(start), to: end === 1440 ? "24:00" : hhmm(end) }];
  }
  HOURS.push({
    enabled: true,
    timezone: ["Asia/Bahrain", "Asia/Riyadh", "Asia/Dubai", "Asia/Muscat"][i % 4],
    days,
  });
}

const MOMENTS: Date[] = [];
for (let i = 0; i < 40; i += 1) {
  MOMENTS.push(
    new Date(Date.UTC(2026, 9, 25, 0, 0) + Math.floor(random() * 14 * 24 * 60) * 60_000),
  );
}
// Window edges in Bahrain (UTC+3): 10:00 and 22:00 on a Sunday, a minute before each.
MOMENTS.push(
  new Date("2026-10-25T07:00:00Z"),
  new Date("2026-10-25T06:59:30Z"),
  new Date("2026-10-25T19:00:00Z"),
  new Date("2026-10-25T18:59:59Z"),
);

describe("the storefront reads the hours as the database does", () => {
  it("agrees on open and the next opening for every set of hours and moment", async () => {
    let compared = 0;
    for (const hours of HOURS) {
      for (const at of MOMENTS) {
        const sql = (
          await db.query<{ r: { open: boolean; next_open: string | null } }>(
            "SELECT public.store_open_state($1::jsonb, $2::timestamptz) AS r",
            [JSON.stringify(hours), at.toISOString()],
          )
        ).rows[0].r;
        const ts = openState(hours, at);
        const label = `${JSON.stringify(hours)} @ ${at.toISOString()}`;
        expect(ts.open, label).toBe(sql.open);
        expect(ts.nextOpen ? new Date(ts.nextOpen).getTime() : null, label).toBe(
          sql.next_open ? new Date(sql.next_open).getTime() : null,
        );
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it("opens at a window's start and closes at its end, on the store's clock", () => {
    const sunday = { enabled: true, days: { "0": [{ from: "10:00", to: "22:00" }] } };
    expect(openState(sunday, new Date("2026-10-25T07:00:00Z")).open).toBe(true);
    expect(openState(sunday, new Date("2026-10-25T06:59:00Z"))).toEqual({
      open: false,
      nextOpen: "2026-10-25T07:00:00.000Z",
    });
    // Closed at 22:00, next Sunday 10:00.
    expect(openState(sunday, new Date("2026-10-25T19:00:00Z")).nextOpen).toBe(
      "2026-11-01T07:00:00.000Z",
    );
  });
});

describe("what a shopper is told", () => {
  const at = new Date("2026-10-25T20:00:00Z"); // Sunday 23:00 in Bahrain
  const hours = storedHours({ ...DEFAULT_HOURS, enabled: true });

  it("says when a paused store is back, or that it will be soon", () => {
    const paused = orderIntake({ orders_paused_until: "2026-10-25T20:30:00Z" }, at);
    expect(paused).toEqual({ state: "paused", until: "2026-10-25T20:30:00.000Z" });
    expect(intakeSentence(paused, {}, at, "en")).toBe(
      "We're not taking new orders right now, back today at 23:30.",
    );
    expect(intakeSentence(orderIntake({ orders_paused_until: "infinity" }, at), {}, at, "ar")).toBe(
      "لا نستقبل طلبات جديدة الآن. نعود قريبًا.",
    );
    expect(pauseOf("2026-10-25T19:00:00Z", at).paused).toBe(false);
  });

  it("takes an order after hours and says when it is handled, unless the store refuses", () => {
    const closed = orderIntake({ opening_hours: hours }, at);
    expect(closed).toMatchObject({ state: "closed", accepting: true });
    expect(intakeSentence(closed, hours, at, "ar")).toBe(
      "المتجر مغلق الآن. يُجهَّز طلبك من غدًا 10:00.",
    );
    const refusing = { ...hours, after_hours: "refuse" };
    const shut = orderIntake({ opening_hours: refusing }, at);
    expect(shut).toMatchObject({ state: "closed", accepting: false });
    expect(intakeSentence(shut, refusing, at, "en")).toBe(
      "We're closed now and take orders again tomorrow at 10:00.",
    );
    expect(orderIntake({ opening_hours: {} }, at)).toEqual({ state: "open" });
  });

  it("reads stored hours as the database does: missing days are closed", () => {
    expect(readHours({ enabled: true }).days.every((day) => day.length === 0)).toBe(true);
    expect(readHours(storedHours(DEFAULT_HOURS))).toEqual(DEFAULT_HOURS);
  });
});

describe("the database holds the pause and the hours", () => {
  const settings = async (paused: string | null, hours: unknown) =>
    db.query(
      "UPDATE public.business_settings SET orders_paused_until = $1, opening_hours = $2::jsonb",
      [paused, JSON.stringify(hours)],
    );
  const order = (channel: string, method = "delivery") =>
    db.query(
      "INSERT INTO public.orders (brand_id, channel, fulfillment_method) VALUES ($1, $2, $3)",
      [BRAND, channel, method],
    );
  const booking = (source: string) =>
    db.query("INSERT INTO public.bookings (brand_id, source) VALUES ($1, $2)", [BRAND, source]);

  it("refuses a storefront order and booking while paused, never a staff one", async () => {
    await settings("infinity", {});
    await expect(order("storefront")).rejects.toThrow(/ORDERS_PAUSED/);
    await expect(booking("storefront")).rejects.toThrow(/ORDERS_PAUSED/);
    await expect(order("admin")).resolves.toBeTruthy();
    await expect(booking("admin")).resolves.toBeTruthy();
    await expect(booking("whatsapp")).resolves.toBeTruthy();
    await settings(new Date(Date.now() - 60_000).toISOString(), {});
    await expect(order("storefront")).resolves.toBeTruthy();
  });

  it("refuses an order outside the hours only for a store that says so, never an appointment", async () => {
    const never = { enabled: true, days: {} };
    await settings(null, { ...never, after_hours: "accept" });
    await expect(order("storefront")).resolves.toBeTruthy();
    await settings(null, { ...never, after_hours: "refuse" });
    await expect(order("storefront")).rejects.toThrow(/STORE_CLOSED/);
    await expect(order("storefront", "appointment")).resolves.toBeTruthy();
    await expect(order("admin")).resolves.toBeTruthy();
    await expect(booking("storefront")).resolves.toBeTruthy();
    const always = storedHours({
      ...DEFAULT_HOURS,
      enabled: true,
      after_hours: "refuse",
      days: DEFAULT_HOURS.days.map(() => [{ from: "00:00", to: "24:00" }]),
    });
    await settings(null, always);
    await expect(order("storefront")).resolves.toBeTruthy();
  });

  it("lets no browser call the trigger functions, and shows visitors the pause and the hours", () => {
    for (const fn of [
      "refuse_storefront_order_while_paused",
      "refuse_storefront_booking_while_paused",
      "check_storefront_order_in_opening_hours",
    ]) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.${fn}() FROM PUBLIC, anon, authenticated;`,
      );
    }
    const before = viewColumns(previous);
    const after = viewColumns(migration);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length)).toEqual(["orders_paused_until", "opening_hours"]);
  });
});
