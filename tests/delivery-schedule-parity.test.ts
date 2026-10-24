import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261024140000_delivery_day_and_time.sql?raw";
import {
  addDays,
  deliveryDays,
  deliveryTimeProblem,
  readSchedule,
  slotValue,
} from "../src/lib/delivery-schedule";

// The day and time a shopper picks (migration 20261024140000): the database's
// delivery_time_problem and the checkout's deliveryTimeProblem say the same of every schedule, day,
// window and moment; set_order_requested_time records a choice or refuses the order.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const functionOf = (sql: string, head: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${head}`);
  if (start < 0) throw new Error(`${head} not found`);
  const open = sql.indexOf("$function$", start);
  const end = sql.indexOf("$function$", open + 1);
  return `${sql.slice(start, end + "$function$".length)};`;
};

const BRAND = "00000000-0000-4000-8000-0000000000b1";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY, delivery_schedule jsonb);
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, fulfillment_method text,
      requested_date date, requested_slot text);
  `);
  await db.exec(functionOf(migration, "delivery_time_problem"));
  await db.exec(functionOf(migration, "set_order_requested_time"));
});

const SCHEDULES: unknown[] = [
  { enabled: true },
  { enabled: true, lead_hours: 0, days_ahead: 3, timezone: "Asia/Dubai" },
  {
    enabled: true,
    lead_hours: 20,
    days_ahead: 10,
    weekdays: [0, 1, 2, 3, 4],
    slots: [
      { from: "10:00", to: "14:00" },
      { from: "16:00", to: "20:00" },
      { from: "21:00", to: "20:00" },
    ],
  },
  {
    enabled: true,
    lead_hours: 2,
    slots: [{ from: "09:00", to: "12:00" }],
    applies_to: ["delivery"],
  },
  { enabled: true, lead_hours: -5, days_ahead: 999, weekdays: "fri", applies_to: "pickup" },
  { enabled: "true", slots: [{ from: "10:00", to: "14:00" }] },
  { enabled: false, slots: [{ from: "10:00", to: "14:00" }] },
  { enabled: true, timezone: "Europe/London", weekdays: [9, 5] },
];

const MOMENTS = [
  "2026-10-24T05:30:00Z",
  "2026-10-24T20:59:00Z",
  "2026-10-24T21:01:00Z",
  "2026-10-30T11:45:00Z",
];

describe("the day and time a shopper may pick", () => {
  it("are the same in the database and at checkout, for every schedule, day and moment", async () => {
    let compared = 0;
    for (const raw of SCHEDULES) {
      const schedule = readSchedule(raw);
      for (const at of MOMENTS) {
        const now = new Date(at);
        const start = now.toISOString().slice(0, 10);
        for (let i = -1; i <= 12; i += 1) {
          const date = addDays(start, i);
          const slots = [null, "10:00-14:00", "16:00-20:00", "09:00-12:00", "21:00-20:00"];
          for (const fulfillment of ["delivery", "pickup", "digital"]) {
            for (const slot of slots) {
              const twin = deliveryTimeProblem(schedule, fulfillment, date, slot, now);
              const row = await db.query<{ p: string | null }>(
                "SELECT public.delivery_time_problem($1::jsonb, $2, $3::date, $4, $5::timestamptz) AS p",
                [JSON.stringify(raw), fulfillment, date, slot, at],
              );
              expect(row.rows[0].p, JSON.stringify({ raw, at, date, fulfillment, slot })).toBe(
                twin,
              );
              compared += 1;
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it("offer the store's days from the earliest it can be ready, and its windows after that", () => {
    const schedule = readSchedule({
      enabled: true,
      lead_hours: 20,
      days_ahead: 4,
      weekdays: [0, 1, 2, 3, 4, 6],
      slots: [
        { from: "16:00", to: "20:00" },
        { from: "10:00", to: "14:00" },
      ],
    });
    // Saturday 24 October, 15:00 in Bahrain: ready from Sunday 11:00.
    const days = deliveryDays(schedule, new Date("2026-10-24T12:00:00Z"));
    expect(days.map((d) => [d.date, d.slots.map(slotValue)])).toEqual([
      ["2026-10-25", ["16:00-20:00"]],
      ["2026-10-26", ["10:00-14:00", "16:00-20:00"]],
      ["2026-10-27", ["10:00-14:00", "16:00-20:00"]],
      ["2026-10-28", ["10:00-14:00", "16:00-20:00"]],
    ]);
  });
});

describe("an order's day and time", () => {
  const order = async (fulfillment: string) =>
    (
      await db.query<{ id: string }>(
        "INSERT INTO public.orders (brand_id, fulfillment_method) VALUES ($1, $2) RETURNING id",
        [BRAND, fulfillment],
      )
    ).rows[0].id;

  it("is recorded when the store offers it, and refuses the order when it does not", async () => {
    const tomorrow = addDays(new Date().toISOString().slice(0, 10), 2);
    await db.query(
      "INSERT INTO public.business_settings VALUES ($1, $2::jsonb) ON CONFLICT (brand_id) DO UPDATE SET delivery_schedule = EXCLUDED.delivery_schedule",
      [
        BRAND,
        JSON.stringify({ enabled: true, lead_hours: 0, slots: [{ from: "10:00", to: "14:00" }] }),
      ],
    );
    const id = await order("delivery");
    await db.query("SELECT public.set_order_requested_time($1, $2, $3)", [
      id,
      tomorrow,
      "10:00-14:00",
    ]);
    const row = await db.query<{ requested_date: string; requested_slot: string }>(
      "SELECT requested_date::text, requested_slot FROM public.orders WHERE id = $1",
      [id],
    );
    expect(row.rows[0]).toEqual({ requested_date: tomorrow, requested_slot: "10:00-14:00" });

    for (const [date, slot] of [
      [tomorrow, "16:00-20:00"],
      [tomorrow, null],
      ["not a day", "10:00-14:00"],
      [addDays(tomorrow, 30), "10:00-14:00"],
    ]) {
      await expect(
        db.query("SELECT public.set_order_requested_time($1, $2, $3)", [
          await order("delivery"),
          date,
          slot,
        ]),
      ).rejects.toThrow(/DELIVERY_TIME_UNAVAILABLE/);
    }
    // A digital order has no day to pick.
    await expect(
      db.query("SELECT public.set_order_requested_time($1, $2, $3)", [
        await order("digital"),
        tomorrow,
        "10:00-14:00",
      ]),
    ).rejects.toThrow(/DELIVERY_TIME_UNAVAILABLE/);
  });
});
