import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261013170000_storefront_orders_use_an_enabled_fulfilment.sql?raw";
import { placeOrderFailure } from "../src/features/checkout/lib/place-order";

// A storefront order is handed over in a way the store has switched on (migration
// 20261013170000). Run in a real Postgres (PGlite), with orders written the way the live
// functions write them: an appointment as "delivery" and a digital order as "pickup", each given
// its own method a moment later in the same transaction.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const DELIVERS = "00000000-0000-4000-8000-00000000000a"; // delivery only
const PICKUP = "00000000-0000-4000-8000-00000000000b"; // pickup only
const SERVICES = "00000000-0000-4000-8000-00000000000c"; // neither: appointments only
const DIGITAL = "00000000-0000-4000-8000-00000000000d"; // digital only
const NO_SETTINGS = "00000000-0000-4000-8000-00000000000e";

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY, delivery_enabled boolean NOT NULL DEFAULT true,
    pickup_enabled boolean NOT NULL DEFAULT true, digital_delivery_enabled boolean NOT NULL DEFAULT false
  );
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    channel text NOT NULL DEFAULT 'admin', fulfillment_method text, notes text
  );
  CREATE TABLE public.bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid);
  CREATE TABLE public.shared_carts (code text PRIMARY KEY, brand_slug text NOT NULL);
  INSERT INTO public.shared_carts VALUES ('sqzk8g', 'zh'), ('abc234', 'zh'), ('sqzk8h', 'pura');

  -- The order builder's insert, as live.
  CREATE FUNCTION public.place_storefront_order(p_brand uuid, p_fulfillment text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
  DECLARE v_id uuid;
  BEGIN
    INSERT INTO public.orders (brand_id, channel, fulfillment_method)
    VALUES (p_brand, 'storefront', p_fulfillment) RETURNING id INTO v_id;
    RETURN v_id;
  END;
  $$;
  -- A digital order, as live: written as pickup, then marked digital.
  CREATE FUNCTION public.place_digital_order(p_brand uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
  DECLARE v_id uuid;
  BEGIN
    v_id := public.place_storefront_order(p_brand, 'pickup');
    UPDATE public.orders SET fulfillment_method = 'digital' WHERE id = v_id;
    RETURN v_id;
  END;
  $$;
  -- An appointment, as live: the order, then the booking is linked and marks it (the trigger
  -- booking_marks_order_appointment).
  CREATE FUNCTION public.booking_marks_order_appointment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
  BEGIN
    UPDATE public.orders SET fulfillment_method = 'appointment'
     WHERE id = NEW.order_id AND fulfillment_method IN ('delivery', 'pickup');
    RETURN NULL;
  END;
  $$;
  CREATE TRIGGER booking_marks_order_appointment AFTER INSERT OR UPDATE OF order_id ON public.bookings
    FOR EACH ROW WHEN (NEW.order_id IS NOT NULL) EXECUTE FUNCTION public.booking_marks_order_appointment();
  CREATE FUNCTION public.place_booking_order(p_brand uuid, p_fulfillment text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
  DECLARE v_id uuid;
  BEGIN
    v_id := public.place_storefront_order(p_brand, p_fulfillment);
    INSERT INTO public.bookings (order_id) VALUES (v_id);
    RETURN v_id;
  END;
  $$;

  INSERT INTO public.business_settings (brand_id, delivery_enabled, pickup_enabled, digital_delivery_enabled) VALUES
    ('${DELIVERS}', true, false, false), ('${PICKUP}', false, true, false),
    ('${SERVICES}', false, false, false), ('${DIGITAL}', false, false, true);
  -- A pickup order placed before the store switched pickup off.
  INSERT INTO public.orders (brand_id, channel, fulfillment_method, notes)
    VALUES ('${DELIVERS}', 'storefront', 'pickup', 'placed before');
`;

let db: PGlite;

/** Runs one call in its own transaction, as a request does, and says how it ended. */
const refusal = async (sql: string) => {
  try {
    await db.exec(`BEGIN; ${sql}; COMMIT;`);
    return null;
  } catch (error) {
    await db.exec("ROLLBACK");
    return (error as Error).message;
  }
};
const place = (brand: string, fulfilment: string) =>
  refusal(`SELECT public.place_storefront_order('${brand}', '${fulfilment}')`);
const methods = async (brand: string) =>
  (
    await db.query<{ m: string }>(
      `SELECT fulfillment_method AS m FROM public.orders WHERE brand_id = $1 AND notes IS NULL ORDER BY 1`,
      [brand],
    )
  ).rows.map((row) => row.m);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(migration);
});

describe("a shopper's order", () => {
  it("is refused when it is handed over in a way the store has switched off, and nothing is written", async () => {
    expect(await place(DELIVERS, "pickup")).toMatch(/PICKUP_DISABLED/);
    expect(await place(PICKUP, "delivery")).toMatch(/DELIVERY_DISABLED/);
    expect(await place(SERVICES, "delivery")).toMatch(/DELIVERY_DISABLED/);
    expect(await refusal(`SELECT public.place_digital_order('${DELIVERS}')`)).toMatch(
      /DIGITAL_DELIVERY_DISABLED/,
    );
    for (const brand of [DELIVERS, PICKUP, SERVICES]) expect(await methods(brand)).toEqual([]);
  });

  it("is placed when it is handed over in a way the store offers", async () => {
    expect(await place(DELIVERS, "delivery")).toBeNull();
    expect(await place(PICKUP, "pickup")).toBeNull();
    expect(await methods(DELIVERS)).toEqual(["delivery"]);
    expect(await methods(PICKUP)).toEqual(["pickup"]);
  });

  it("is refused for a store that has no settings at all", async () => {
    expect(await place(NO_SETTINGS, "delivery")).toMatch(/DELIVERY_DISABLED/);
  });

  it("reads each refusal in words on the checkout", () => {
    const english = (_ar: string, en: string) => en;
    for (const code of ["DELIVERY_DISABLED", "PICKUP_DISABLED", "DIGITAL_DELIVERY_DISABLED"]) {
      expect(placeOrderFailure(code, english).message).toBe("Fulfillment method unavailable");
    }
  });
});

describe("orders that are written with one method and given their own", () => {
  it("lets a digital order through at a store with no pickup: it is judged as digital", async () => {
    expect(await refusal(`SELECT public.place_digital_order('${DIGITAL}')`)).toBeNull();
    expect(await methods(DIGITAL)).toEqual(["digital"]);
  });

  it("never refuses an appointment, at the customer's venue or the store's, whatever the shop's switches", async () => {
    expect(
      await refusal(`SELECT public.place_booking_order('${SERVICES}', 'delivery')`),
    ).toBeNull();
    expect(await refusal(`SELECT public.place_booking_order('${SERVICES}', 'pickup')`)).toBeNull();
    expect(await methods(SERVICES)).toEqual(["appointment", "appointment"]);
  });
});

describe("what the rule leaves alone", () => {
  it("an order made by staff, however it is handed over", async () => {
    expect(
      await refusal(
        `INSERT INTO public.orders (brand_id, fulfillment_method) VALUES ('${DELIVERS}', 'pickup'), ('${SERVICES}', 'delivery'), ('${SERVICES}', NULL)`,
      ),
    ).toBeNull();
  });

  it("an order placed before the store switched the option off, which can still be worked on", async () => {
    expect(
      await refusal(
        `UPDATE public.orders SET notes = 'placed before, packed' WHERE notes = 'placed before'`,
      ),
    ).toBeNull();
  });
});

describe("the test row from the live check", () => {
  it("is removed, and no other shared cart is", async () => {
    const left = await db.query<{ code: string }>(
      "SELECT code FROM public.shared_carts ORDER BY 1",
    );
    expect(left.rows.map((row) => row.code)).toEqual(["abc234", "sqzk8h"]);
  });
});
