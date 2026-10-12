import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261013100000_order_status_follows_fulfillment.sql?raw";
import { NOT_SOLD_ORDER_FILTER, countsAsSold } from "../src/lib/data/orders/sold-orders";

// An order has a status (what the stock engine, bookings and reports read) and a fulfillment
// stage (what the screens move). Completing an order from the list wrote the stage only, so the
// status stayed "packing" for good. The migration in a real Postgres (PGlite): the trigger, and
// the quiet repair of the orders already in that state.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

// The stock engine's reading of an order, as it is live.
const DESIRED_STATE = `
CREATE FUNCTION public.order_inventory_desired_state(p_status text, p_payment_status text, p_payment_method text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE
  v_st text := lower(trim(COALESCE(p_status, '')));
  v_pst text := lower(trim(COALESCE(p_payment_status, '')));
BEGIN
  IF v_st IN ('cancelled', 'canceled', 'refunded', 'voided', 'failed')
     OR v_pst IN ('failed', 'declined') THEN
    RETURN 'released';
  END IF;
  IF v_st IN ('completed', 'delivered', 'picked_up') THEN
    RETURN 'committed';
  END IF;
  IF v_st IN ('draft', 'archived_historical') OR v_st = '' THEN
    RETURN 'none';
  END IF;
  RETURN 'reserved';
END;
$function$;`;

const order = async (status: string, fulfillment: string, payment = "paid") => {
  const id = uuid();
  await db.query(
    "INSERT INTO public.orders (id, status, fulfillment_status, payment_status) VALUES ($1, $2, $3, $4)",
    [id, status, fulfillment, payment],
  );
  return id;
};
const read = async (id: string) =>
  (
    await db.query<{ status: string; fulfillment_status: string; inventory_state: string }>(
      "SELECT status, fulfillment_status, inventory_state FROM public.orders WHERE id = $1",
      [id],
    )
  ).rows[0];
const told = async (id: string) =>
  (await db.query<{ what: string }>("SELECT what FROM public.told WHERE order_id = $1", [id])).rows
    .map((row) => row.what)
    .sort();

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY, status text, fulfillment_status text, payment_status text,
      payment_method text, inventory_state text DEFAULT 'none', updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, status text,
      updated_at timestamptz DEFAULT now()
    );
    -- What the customer and staff are told (the email, push and activity triggers).
    CREATE TABLE public.told (order_id uuid, what text);
    ${DESIRED_STATE}
    CREATE FUNCTION public.order_inventory_transition(p_order_id uuid) RETURNS void
    LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE public.orders o
      SET inventory_state = public.order_inventory_desired_state(o.status, o.payment_status, o.payment_method)
      WHERE o.id = p_order_id;
    END $$;
    -- The live triggers this fix must live with: the stock engine after every change, the
    -- booking that follows its order, and the messages sent when an order is completed.
    CREATE FUNCTION public.trg_orders_inventory_proc() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
      PERFORM public.order_inventory_transition(NEW.id);
      RETURN NEW;
    END $$;
    CREATE TRIGGER trg_orders_inventory AFTER INSERT OR UPDATE ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.trg_orders_inventory_proc();
    CREATE FUNCTION public.sync_bookings_with_order() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
        UPDATE public.bookings SET status = 'completed' WHERE order_id = NEW.id AND status = 'confirmed';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER trg_orders_sync_bookings AFTER UPDATE ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.sync_bookings_with_order();
    CREATE FUNCTION public.automate_order_email_events() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (lower(COALESCE(NEW.status, '')) = 'completed' AND lower(COALESCE(OLD.status, '')) <> 'completed')
         OR (lower(COALESCE(NEW.fulfillment_status, '')) IN ('delivered', 'completed')
             AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN ('delivered', 'completed')) THEN
        INSERT INTO public.told VALUES (NEW.id, 'order_delivered');
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER automate_order_email_events AFTER UPDATE ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.automate_order_email_events();
  `);
});

describe("before the migration", () => {
  it("completing an order from the list left its status, and the stock engine, behind", async () => {
    const id = await order("packing", "PACKING");
    await db.query("UPDATE public.orders SET fulfillment_status = 'COMPLETED' WHERE id = $1", [id]);
    expect(await read(id)).toEqual({
      status: "packing",
      fulfillment_status: "COMPLETED",
      inventory_state: "reserved",
    });
  });
});

describe("after the migration", () => {
  let stale: string[];
  let staleBooking: string;
  let cancelled: string;
  let inFlight: string;

  beforeAll(async () => {
    // The four states found on the live orders, an appointment whose booking was never
    // completed, and orders the repair must leave alone.
    stale = [
      await order("packing", "PACKING"),
      await order("ready_for_pickup", "READY_FOR_PICKUP"),
      await order("confirmed", "NEEDS_PACKING"),
      await order("sent_to_tailor", "SENT_TO_TAILOR"),
    ];
    await db.query(
      "UPDATE public.orders SET fulfillment_status = 'COMPLETED' WHERE id = ANY($1::uuid[])",
      [stale],
    );
    staleBooking = uuid();
    await db.query(
      "INSERT INTO public.bookings (id, order_id, status) VALUES ($1, $2, 'confirmed')",
      [staleBooking, stale[2]],
    );
    cancelled = await order("cancelled", "COMPLETED", "refunded");
    inFlight = await order("packing", "PACKING");
    await db.query("DELETE FROM public.told");
    await db.exec(migration);
  });

  it("repairs the orders that were completed with their status left behind", async () => {
    for (const id of stale) {
      expect(await read(id)).toEqual({
        status: "completed",
        fulfillment_status: "COMPLETED",
        inventory_state: "committed",
      });
    }
    const booking = await db.query<{ status: string }>(
      "SELECT status FROM public.bookings WHERE id = $1",
      [staleBooking],
    );
    expect(booking.rows[0].status).toBe("completed");
  });

  it("repairs them quietly: nobody is told about a completion that is weeks old", async () => {
    const all = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.told");
    expect(all.rows[0].n).toBe(0);
  });

  it("leaves an order that was undone, and one still in work, as they are", async () => {
    expect((await read(cancelled)).status).toBe("cancelled");
    expect(await read(inFlight)).toMatchObject({ status: "packing", inventory_state: "reserved" });
  });

  it("leaves the order's triggers switched on", async () => {
    const off = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_trigger
       WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal AND tgenabled = 'D'`,
    );
    expect(off.rows[0].n).toBe(0);
  });

  it.each(["COMPLETED", "DELIVERED", "PICKED_UP", "completed"])(
    "completes the status when the stage reaches %s, and settles the stock engine",
    async (stage) => {
      const id = await order("packing", "PACKING");
      await db.query("UPDATE public.orders SET fulfillment_status = $2 WHERE id = $1", [id, stage]);
      expect(await read(id)).toMatchObject({ status: "completed", inventory_state: "committed" });
    },
  );

  it("tells the customer once, as a completion always did", async () => {
    const id = await order("ready_for_pickup", "READY_FOR_PICKUP");
    await db.query("UPDATE public.orders SET fulfillment_status = 'COMPLETED' WHERE id = $1", [id]);
    expect(await told(id)).toEqual(["order_delivered"]);
  });

  it("completes the booking that follows the order", async () => {
    const id = await order("confirmed", "NEEDS_PACKING");
    const booking = uuid();
    await db.query(
      "INSERT INTO public.bookings (id, order_id, status) VALUES ($1, $2, 'confirmed')",
      [booking, id],
    );
    await db.query("UPDATE public.orders SET fulfillment_status = 'COMPLETED' WHERE id = $1", [id]);
    const row = await db.query<{ status: string }>(
      "SELECT status FROM public.bookings WHERE id = $1",
      [booking],
    );
    expect(row.rows[0].status).toBe("completed");
  });

  it.each([
    "cancelled",
    "refunded",
    "voided",
    "failed",
    "returned",
    "draft",
    "archived_historical",
  ])("does not complete an order whose status is %s", async (status) => {
    const id = await order(status, "PACKING");
    await db.query("UPDATE public.orders SET fulfillment_status = 'COMPLETED' WHERE id = $1", [id]);
    expect((await read(id)).status).toBe(status);
  });

  it("does not touch an order that is not at its end, and lets one be reopened", async () => {
    const id = await order("confirmed", "NEEDS_PACKING");
    await db.query(
      "UPDATE public.orders SET fulfillment_status = 'PACKING', status = 'packing' WHERE id = $1",
      [id],
    );
    expect(await read(id)).toMatchObject({ status: "packing", inventory_state: "reserved" });
    await db.query("UPDATE public.orders SET fulfillment_status = 'COMPLETED' WHERE id = $1", [id]);
    expect((await read(id)).status).toBe("completed");
    // Reopened by staff: the stage and the status are written together, and both stand.
    await db.query(
      "UPDATE public.orders SET fulfillment_status = 'PACKING', status = 'packing' WHERE id = $1",
      [id],
    );
    expect(await read(id)).toMatchObject({ status: "packing", inventory_state: "reserved" });
  });

  it("completes an order that is created already at its end", async () => {
    const id = await order("confirmed", "COMPLETED");
    expect(await read(id)).toMatchObject({ status: "completed", inventory_state: "committed" });
  });

  it("can be run again without changing anything", async () => {
    await db.query("DELETE FROM public.told");
    await db.exec(migration);
    const told = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.told");
    expect(told.rows[0].n).toBe(0);
  });
});

describe("which orders count as sold in the app's own figures", () => {
  it("counts an order at every stage of its work, not only the stages a list knew", () => {
    for (const status of [
      "confirmed",
      "paid",
      "packing",
      "sent_to_tailor",
      "received_from_tailor",
      "ready_for_pickup",
      "shipped",
      "delivered",
      "picked_up",
      "completed",
      "Completed",
    ]) {
      expect(countsAsSold(status), status).toBe(true);
    }
  });

  it("does not count an order that was never placed, is waiting, or was undone", () => {
    for (const status of [
      "draft",
      "pending",
      "pending_verification",
      "benefit_rejected",
      "cancelled",
      "canceled",
      "refunded",
      "voided",
      "failed",
      "returned",
      "archived_historical",
      "",
      null,
      undefined,
    ]) {
      expect(countsAsSold(status), String(status)).toBe(false);
    }
  });

  it("is the filter both reads send", () => {
    expect(NOT_SOLD_ORDER_FILTER).toBe(
      "(draft,pending,pending_verification,benefit_rejected,cancelled,canceled,refunded,voided,failed,returned,archived_historical)",
    );
  });
});
