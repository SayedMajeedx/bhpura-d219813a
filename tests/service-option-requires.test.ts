import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanSelection,
  optionAvailable,
  optionsPayload,
  optionsTotal,
  type ServiceOption,
} from "../src/lib/bookings/service-options";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";

// An add-on that needs another (magnets need the prints), run for real in Postgres (PGlite) and
// in the rule the booking page uses.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: EngineDb;
beforeAll(async () => {
  db = await createEngineDb();
});

const optionNames = async (reference: unknown) => {
  const booking = await db.one<{ id: string }>("select id from bookings where reference = $1", [
    String(reference),
  ]);
  const rows = await db.rows<{ name_en: string }>(
    "select name_en from booking_items where booking_id = $1 and option_id is not null order by name_en",
    [booking.id],
  );
  return rows.map((row) => row.name_en);
};
const ask = (brand: string, item: Parameters<typeof db.request>[4][number]) =>
  db.request(brand, db.day(5), "18:00", 180, [item]);

/** A booth whose magnets and envelopes need its prints. */
async function printsStore() {
  const brand = await db.store({ dailyCapacity: 5, leadDays: 0 });
  const booth = await db.service(brand, { name: "Booth", price: 70 });
  const prints = await db.option(booth.id, brand, {
    name: "Prints",
    mode: "default_on",
    price: 30,
  });
  const magnets = await db.option(booth.id, brand, {
    name: "Magnets",
    mode: "optional",
    price: 25,
    requires: prints,
  });
  const envelopes = await db.option(booth.id, brand, {
    name: "Envelopes",
    mode: "optional",
    tiers: { step: 50, prices: [15, 12.5, 10] },
    requires: prints,
  });
  return { brand, booth, prints, magnets, envelopes };
}

describe("an add-on that needs another, in the database", () => {
  it("is booked and priced with the one it needs", async () => {
    const { brand, booth, prints, magnets } = await printsStore();
    const asked = await ask(brand, {
      product_id: booth.id,
      variant_id: booth.variantId,
      options: [{ option_id: prints }, { option_id: magnets }],
    });
    expect(asked.total).toBe(70 + 30 + 25);
    expect(await optionNames(asked.reference)).toEqual(["Magnets", "Prints"]);
  });

  it("is refused when the customer chose it without the one it needs", async () => {
    const { brand, booth, magnets, envelopes } = await printsStore();
    for (const options of [[{ option_id: magnets }], [{ option_id: envelopes, quantity: 50 }]]) {
      const refused = await db.refusal(
        ask(brand, { product_id: booth.id, variant_id: booth.variantId, options }),
      );
      expect(refused?.message).toBe("BOOKING_OPTION_REQUIRES_OTHER");
    }
  });

  it("never appears on its own when nothing was chosen", async () => {
    const { brand, booth } = await printsStore();
    const asked = await ask(brand, { product_id: booth.id, variant_id: booth.variantId });
    expect(await optionNames(asked.reference)).toEqual(["Prints"]);
  });

  it("must need an add-on of its own service that needs nothing, and not be needed itself", async () => {
    const { brand, booth, prints, magnets } = await printsStore();
    const other = await db.service(brand, { name: "Phone" });
    const foreign = await db.option(other.id, brand, { name: "Elsewhere" });
    const set = (id: string, requires: string) =>
      db
        .refusal(
          db.pg.query("update service_options set requires_option_id = $2 where id = $1", [
            id,
            requires,
          ]),
        )
        .then((refusal) => refusal?.message);
    expect(await set(prints, foreign)).toBe("OPTION_REQUIRES_INVALID");
    // The prints would need the magnets, which need the prints.
    expect(await set(prints, magnets)).toBe("OPTION_REQUIRES_INVALID");
    // A chain of three.
    const third = await db.option(booth.id, brand, { name: "Third", price: 5 });
    expect(await set(third, magnets)).toBe("OPTION_REQUIRES_INVALID");
  });
});

describe("an add-on that needs another, as the customer chooses", () => {
  const base = (id: string, over: Partial<ServiceOption> = {}): ServiceOption => ({
    id,
    product_id: "p",
    name_en: id,
    name_ar: null,
    description_en: null,
    description_ar: null,
    mode: "optional",
    price: 10,
    extra_hour_price: null,
    requires_option_id: null,
    tiers: null,
    max_quantity: null,
    sort_order: 0,
    is_active: true,
    ...over,
  });
  const prints = base("prints", { mode: "default_on" });
  const magnets = base("magnets", { requires_option_id: "prints" });
  const all = [prints, magnets];

  it("is available only while the one it needs is chosen", () => {
    expect(optionAvailable(magnets, all, {})).toBe(false);
    expect(optionAvailable(magnets, all, { prints: 1 })).toBe(true);
    expect(optionAvailable(prints, all, {})).toBe(true);
  });

  it("goes when the one it needs is taken off", () => {
    expect(cleanSelection(all, { prints: 1, magnets: 1 })).toEqual({ prints: 1, magnets: 1 });
    expect(cleanSelection(all, { magnets: 1 })).toEqual({});
  });

  it("counts what comes with the service as chosen, and a switched-off add-on as not", () => {
    const staff = base("staff", { mode: "required" });
    const needsStaff = base("x", { requires_option_id: "staff" });
    expect(optionAvailable(needsStaff, [staff, needsStaff], {})).toBe(true);
    expect(optionAvailable(needsStaff, [{ ...staff, is_active: false }, needsStaff], {})).toBe(
      false,
    );
  });

  it("is neither priced nor sent while unavailable", () => {
    expect(optionsTotal(all, { magnets: 1 })).toBe(0);
    expect(optionsPayload(all, { magnets: 1 })).toEqual([]);
    expect(optionsTotal(all, { prints: 1, magnets: 1 })).toBe(20);
  });
});
