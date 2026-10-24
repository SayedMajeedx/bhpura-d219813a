import { describe, expect, it } from "vitest";
import previous from "../supabase/migrations/20261014130000_partner_pickup_points.sql?raw";
import migration from "../supabase/migrations/20261024140000_delivery_day_and_time.sql?raw";
import homeLayout from "../supabase/migrations/20261023140000_storefront_home_layout.sql?raw";

// place_storefront_order is the checkout's entry point and has been redefined many times, so the
// migration that lets a shopper pick a day and time must change nothing else in it: its body is
// the live definition (equal to 20261014130000's, read from production on 2026-10-24) with one
// statement added. What that statement calls is run in a real Postgres by
// tests/delivery-schedule-parity.test.ts.

const functionOf = (sql: string) => {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.place_storefront_order(p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text, p_notes text DEFAULT NULL::text, p_fulfillment",
  );
  const open = sql.indexOf("$function$", start);
  const end = sql.indexOf("$function$", open + 1);
  return start < 0 ? "" : sql.slice(start, end + "$function$".length);
};
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

const ADDED = `  -- ADDED (20261024140000): the day, and the time window, the shopper picked for the order,
  -- checked against the store's delivery schedule; refused (DELIVERY_TIME_UNAVAILABLE) when the
  -- store does not offer it.
  IF NULLIF(btrim(COALESCE(p_customer ->> 'requested_date', '')), '') IS NOT NULL THEN
    PERFORM public.set_order_requested_time(
      v_order_id, p_customer ->> 'requested_date', p_customer ->> 'requested_slot'
    );
  END IF;
`;

/** The columns a view's SELECT names (`bs.x`, `b.x`), in order. */
const viewColumns = (sql: string) => {
  const body = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW public.brand_public_settings"));
  return [...body.slice(0, body.indexOf(" FROM ")).matchAll(/\b(?:bs|b)\.([a-z_0-9]+)/g)].map(
    (match) => match[1],
  );
};

describe("the migration that lets a shopper pick a day and time", () => {
  it("redefines the same builder (same arguments) as the live one", () => {
    const signature = (sql: string) => functionOf(sql).split("RETURNS")[0];
    expect(functionOf(migration)).not.toBe("");
    expect(squash(signature(migration))).toBe(squash(signature(previous)));
  });

  it("changes one thing in it: after a partner pickup, the day and time are recorded", () => {
    const before = squash(functionOf(previous));
    const after = squash(functionOf(migration));
    expect(after).toContain(squash(ADDED));
    expect(after.replace(squash(ADDED), "").replace(/\s+/g, " ")).toBe(before);
  });

  it("keeps the public settings view's columns and adds the schedule at its end", () => {
    // The view as the home layout migration left it gained the photo shape and the layout later;
    // the schedule comes last of all.
    const after = viewColumns(migration);
    expect(after.at(-1)).toBe("delivery_schedule");
    expect(after.slice(-3, -1)).toEqual(["product_card_aspect_ratio", "storefront_home_layout"]);
    expect(after.slice(0, viewColumns(homeLayout).length)).toEqual(viewColumns(homeLayout));
  });

  it("lets only the server record an order's time, and writes no store's schedule", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.set_order_requested_time\(uuid, text, text\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).not.toMatch(/UPDATE\s+public\.business_settings/i);
    expect(migration).toMatch(/delivery_schedule jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  });
});
