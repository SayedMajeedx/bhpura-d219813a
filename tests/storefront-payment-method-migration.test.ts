import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261013160000_storefront_orders_use_an_enabled_payment_method.sql?raw";
import { placeOrderFailure } from "../src/features/checkout/lib/place-order";

// A storefront order is paid in a way the store has switched on (migration 20261013160000). The
// order builder lost this check in a rewrite, and only the checkout page hid a switched-off
// method. Run in a real Postgres (PGlite): orders written the way the builder and the booking
// checkout write them, with a store that takes no cash.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const NO_CASH = "00000000-0000-4000-8000-00000000000a"; // BenefitPay only
const CASH = "00000000-0000-4000-8000-00000000000b"; // cash only
const NO_SETTINGS = "00000000-0000-4000-8000-00000000000c";
const BOOKING = "00000000-0000-4000-8000-0000000000d1";

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY, cod_enabled boolean NOT NULL DEFAULT true,
    card_enabled boolean NOT NULL DEFAULT false, benefit_enabled boolean NOT NULL DEFAULT false
  );
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    channel text NOT NULL DEFAULT 'admin', payment_method text, payment_status text DEFAULT 'unpaid',
    notes text
  );
  CREATE TABLE public.bookings (
    id uuid PRIMARY KEY, brand_id uuid NOT NULL, status text NOT NULL, order_id uuid
  );
  -- The order builder's insert, as live: the shopper's method goes in as it was sent.
  CREATE FUNCTION public.place_storefront_order(p_brand uuid, p_method text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
  DECLARE v_id uuid;
  BEGIN
    INSERT INTO public.orders (brand_id, payment_method, payment_status, channel)
    VALUES (p_brand, p_method, 'unpaid', 'storefront') RETURNING id INTO v_id;
    RETURN v_id;
  END;
  $$;
  -- The booking checkout, as live: the order first, then a cash booking is confirmed at once.
  CREATE FUNCTION public.place_booking_order(p_booking uuid, p_method text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
  DECLARE v_id uuid; v_brand uuid;
  BEGIN
    SELECT brand_id INTO v_brand FROM public.bookings WHERE id = p_booking;
    v_id := public.place_storefront_order(v_brand, p_method);
    UPDATE public.bookings
       SET order_id = v_id,
           status = CASE WHEN p_method IN ('card', 'benefit') THEN 'hold' ELSE 'confirmed' END
     WHERE id = p_booking;
    RETURN v_id;
  END;
  $$;
  INSERT INTO public.business_settings (brand_id, cod_enabled, card_enabled, benefit_enabled) VALUES
    ('${NO_CASH}', false, false, true), ('${CASH}', true, false, false);
  -- An order placed with cash before the store switched cash off.
  INSERT INTO public.orders (brand_id, channel, payment_method, notes)
    VALUES ('${NO_CASH}', 'storefront', 'cod', 'placed before');
  INSERT INTO public.bookings VALUES ('${BOOKING}', '${NO_CASH}', 'hold', NULL);
`;

let db: PGlite;

const refusal = async (sql: string) => {
  try {
    await db.query(sql);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};
const place = (brand: string, method: string | null) =>
  refusal(`SELECT public.place_storefront_order('${brand}', ${method ? `'${method}'` : "NULL"})`);
const count = async (where: string) =>
  Number(
    (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.orders WHERE ${where}`))
      .rows[0].n,
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(migration);
});

describe("a shopper's order", () => {
  it("is refused when it pays in a way the store has switched off, and nothing is written", async () => {
    expect(await place(NO_CASH, "cod")).toMatch(/PAYMENT_METHOD_DISABLED/);
    expect(await place(NO_CASH, "card")).toMatch(/PAYMENT_METHOD_DISABLED/);
    expect(await place(CASH, "benefit")).toMatch(/PAYMENT_METHOD_DISABLED/);
    expect(await count(`notes IS NULL`)).toBe(0);
  });

  it("is placed when it pays in a way the store takes", async () => {
    expect(await place(NO_CASH, "benefit")).toBeNull();
    expect(await place(CASH, "cod")).toBeNull();
    expect(await count(`channel = 'storefront' AND notes IS NULL`)).toBe(2);
  });

  it("is refused with a way of paying the storefront does not have, or with none", async () => {
    expect(await place(CASH, "bank")).toMatch(/INVALID_PAYMENT/);
    expect(await place(CASH, "COD")).toMatch(/INVALID_PAYMENT/);
    expect(await place(CASH, null)).toMatch(/INVALID_PAYMENT/);
  });

  it("is refused for a store that has no settings at all", async () => {
    expect(await place(NO_SETTINGS, "cod")).toMatch(/PAYMENT_METHOD_DISABLED/);
  });

  it("follows the switch: cash is taken again once the store turns it on", async () => {
    await db.exec(
      `UPDATE public.business_settings SET cod_enabled = true WHERE brand_id = '${NO_CASH}'`,
    );
    expect(await place(NO_CASH, "cod")).toBeNull();
    await db.exec(
      `UPDATE public.business_settings SET cod_enabled = false WHERE brand_id = '${NO_CASH}'`,
    );
    expect(await place(NO_CASH, "cod")).toMatch(/PAYMENT_METHOD_DISABLED/);
  });

  it("reads the refusal in words on the checkout", () => {
    const english = (_ar: string, en: string) => en;
    expect(placeOrderFailure("PAYMENT_METHOD_DISABLED", english).message).toBe(
      "Payment method unavailable",
    );
  });
});

describe("an appointment's checkout", () => {
  it("cannot confirm a day with cash at a store that takes none: the day stays on hold", async () => {
    expect(await refusal(`SELECT public.place_booking_order('${BOOKING}', 'cod')`)).toMatch(
      /PAYMENT_METHOD_DISABLED/,
    );
    expect(
      (await db.query(`SELECT status, order_id FROM public.bookings WHERE id = '${BOOKING}'`)).rows,
    ).toEqual([{ status: "hold", order_id: null }]);
  });

  it("goes through with a way of paying the store takes", async () => {
    expect(await refusal(`SELECT public.place_booking_order('${BOOKING}', 'benefit')`)).toBeNull();
    const booking = await db.query<{ status: string; order_id: string | null }>(
      `SELECT status, order_id FROM public.bookings WHERE id = '${BOOKING}'`,
    );
    expect(booking.rows[0].status).toBe("hold");
    expect(booking.rows[0].order_id).not.toBeNull();
  });
});

describe("what the rule leaves alone", () => {
  it("an order made by staff, whatever it says about payment", async () => {
    expect(
      await refusal(
        `INSERT INTO public.orders (brand_id, payment_method) VALUES ('${NO_CASH}', 'cod'), ('${NO_CASH}', NULL), ('${NO_CASH}', 'bank_transfer')`,
      ),
    ).toBeNull();
    expect(await count(`channel = 'admin'`)).toBe(3);
  });

  it("an order placed before the store switched the method off, which can still be worked on", async () => {
    expect(
      await refusal(
        `UPDATE public.orders SET payment_status = 'paid' WHERE notes = 'placed before'`,
      ),
    ).toBeNull();
    expect(
      await count(`notes = 'placed before' AND payment_method = 'cod' AND payment_status = 'paid'`),
    ).toBe(1);
  });
});
