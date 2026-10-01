import { beforeAll, describe, expect, it, vi } from "vitest";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";

// A service's add-ons, extra hours and the new offers (with another service,
// stacking, chosen dates), run for real in Postgres (PGlite).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: EngineDb;
beforeAll(async () => {
  db = await createEngineDb();
});

type Line = {
  id: string;
  parent_item_id: string | null;
  option_id: string | null;
  option_quantity: number | null;
  name_en: string | null;
  unit_price: string;
  product_id: string | null;
};
const linesOf = (bookingId: string) =>
  db.rows<Line>(
    `select id, parent_item_id, option_id, option_quantity, name_en, unit_price, product_id
       from booking_items where booking_id = $1 order by name_en`,
    [bookingId],
  );
const bookingByRef = (reference: string) =>
  db.one<{ id: string; total: string; discount_amount: string; discount_label_en: string | null }>(
    "select id, total, discount_amount, discount_label_en from bookings where reference = $1",
    [reference],
  );
const bookingById = (id: string) =>
  db.one<{ total: string; discount_amount: string; discount_label_en: string | null }>(
    "select total, discount_amount, discount_label_en from bookings where id = $1",
    [id],
  );
const num = (value: string | number) => Number(value);

/** A booth at 70 with the add-ons a photo-booth site sells. */
async function boothStore() {
  const brand = await db.store({ dailyCapacity: 5, leadDays: 0 });
  const booth = await db.service(brand, { name: "Booth", price: 70 });
  const staff = await db.option(booth.id, brand, {
    name: "Attendant",
    mode: "required",
    price: 15,
  });
  const prints = await db.option(booth.id, brand, {
    name: "Prints",
    mode: "default_on",
    price: 30,
  });
  const magnets = await db.option(booth.id, brand, {
    name: "Magnets",
    mode: "optional",
    price: 25,
  });
  const envelopes = await db.option(booth.id, brand, {
    name: "Envelopes",
    mode: "optional",
    tiers: { step: 50, prices: [15, 12.5, 10] },
    max: 200,
  });
  const note = await db.option(booth.id, brand, { name: "Safety", mode: "included", price: 99 });
  return { brand, booth, staff, prints, magnets, envelopes, note };
}
const ask = (brand: string, day: number, item: Parameters<typeof db.request>[4][number]) =>
  db.request(brand, db.day(day), "18:00", 180, [item]);

describe("what an add-on costs", () => {
  const price = (mode: string, flat: number, tiers: object | null, quantity: number) =>
    db
      .one<{ p: string }>("select service_option_price($1, $2, $3::jsonb, $4) as p", [
        mode,
        flat,
        tiers ? JSON.stringify(tiers) : null,
        quantity,
      ])
      .then((row) => num(row.p));

  it("is flat, free when included, or by blocks that get cheaper", async () => {
    expect(await price("optional", 25, null, 1)).toBe(25);
    expect(await price("required", 15, null, 1)).toBe(15);
    expect(await price("included", 15, null, 1)).toBe(0);
    const tiers = { step: 50, prices: [15, 12.5, 10] };
    expect(await price("optional", 15, tiers, 50)).toBe(15);
    expect(await price("optional", 15, tiers, 100)).toBe(27.5);
    expect(await price("optional", 15, tiers, 150)).toBe(37.5);
    expect(await price("optional", 15, tiers, 200)).toBe(47.5);
    expect(await price("optional", 15, tiers, 0)).toBe(0);
  });
});

describe("a booking with add-ons", () => {
  it("brings the ones that come with it: included, required and on by default", async () => {
    const { brand, booth, staff, prints, note } = await boothStore();
    const asked = await ask(brand, 5, { product_id: booth.id, variant_id: booth.variantId });
    // 70 + the attendant 15 + the prints 30 (on by default); the safety note is free.
    expect(asked).toMatchObject({ total: 115, options_total: 45 });
    const lines = await linesOf((await bookingByRef(String(asked.reference))).id);
    const service = lines.find((l) => l.product_id === booth.id)!;
    const options = lines.filter((l) => l.option_id);
    expect(options.map((l) => [l.name_en, num(l.unit_price)])).toEqual([
      ["Attendant", 15],
      ["Prints", 30],
      ["Safety", 0],
    ]);
    // Each sits under the service line, and none holds a place of its own.
    expect(options.every((l) => l.parent_item_id === service.id && l.product_id === null)).toBe(
      true,
    );
    expect(options.map((l) => l.option_id).sort()).toEqual([note, staff, prints].sort());
  });

  it("drops what the customer took off, never what is required, and adds what they chose", async () => {
    const { brand, booth, magnets, envelopes } = await boothStore();
    const asked = await ask(brand, 5, {
      product_id: booth.id,
      variant_id: booth.variantId,
      options: [{ option_id: magnets }, { option_id: envelopes, quantity: 100 }],
    });
    // The prints were left out (the customer sent a choice); the attendant stays.
    // 70 + 15 + 25 + envelopes 100 (15 + 12.5).
    expect(asked.total).toBe(137.5);
    const lines = await linesOf((await bookingByRef(String(asked.reference))).id);
    const named = lines
      .filter((l) => l.option_id)
      .map((l) => [l.name_en, num(l.unit_price), l.option_quantity]);
    expect(named).toEqual([
      ["Attendant", 15, null],
      ["Envelopes × 100", 27.5, 100],
      ["Magnets", 25, null],
      ["Safety", 0, null],
    ]);
  });

  it("refuses an add-on the service does not have, a bad block of envelopes, or too many", async () => {
    const { brand, booth, envelopes } = await boothStore();
    const other = await db.service(brand, { name: "Phone" });
    const foreign = await db.option(other.id, brand, { name: "Elsewhere" });
    const refused = (options: Array<{ option_id: string; quantity?: number }>) =>
      db
        .refusal(ask(brand, 5, { product_id: booth.id, variant_id: booth.variantId, options }))
        .then((r) => r?.message);
    expect(await refused([{ option_id: foreign }])).toBe("BOOKING_OPTION_NOT_FOUND");
    expect(await refused([{ option_id: "00000000-0000-4000-8000-000000000009" }])).toBe(
      "BOOKING_OPTION_NOT_FOUND",
    );
    expect(await refused([{ option_id: envelopes, quantity: 75 }])).toBe(
      "BOOKING_OPTION_QUANTITY_INVALID",
    );
    expect(await refused([{ option_id: envelopes, quantity: 250 }])).toBe(
      "BOOKING_OPTION_QUANTITY_INVALID",
    );
    expect(await refused([{ option_id: envelopes, quantity: 0 }])).toBe(
      "BOOKING_OPTION_QUANTITY_INVALID",
    );
  });

  it("ignores a switched-off add-on", async () => {
    const brand = await db.store({ dailyCapacity: 5, leadDays: 0 });
    const booth = await db.service(brand, { price: 70 });
    await db.option(booth.id, brand, { mode: "required", price: 15, active: false });
    const asked = await ask(brand, 5, { product_id: booth.id, variant_id: booth.variantId });
    expect(asked.total).toBe(70);
  });

  it("does not use up the service's capacity or the store's daily places", async () => {
    const brand = await db.store({ dailyCapacity: 1, leadDays: 0 });
    const booth = await db.service(brand, { name: "Booth", price: 70, capacity: 1 });
    await db.option(booth.id, brand, { mode: "required", price: 15 });
    await db.staff(brand, db.day(5), "18:00", 120, [
      { product_id: booth.id, variant_id: booth.variantId, unit_price: 70 },
    ]);
    // The booth is the only thing with a limit: the store's one place is still free.
    expect((await db.dayState(brand, db.day(5))).state).toBe("available");
    expect(
      (
        await db.refusal(
          db.staff(brand, db.day(5), "19:00", 60, [
            { product_id: booth.id, variant_id: booth.variantId },
          ]),
        )
      )?.message,
    ).toBe("BOOKING_SERVICE_FULL");
  });

  it("goes with a package, which still holds what it includes", async () => {
    const brand = await db.store({ dailyCapacity: 5, leadDays: 0 });
    const booth = await db.service(brand, { name: "Booth", capacity: 1 });
    const pkg = await db.servicePackage(brand, [{ id: booth.id }], { name: "Gold", price: 100 });
    const gift = await db.option(pkg.id, brand, { name: "Frame", mode: "required", price: 10 });
    const made = await db.staff(brand, db.day(5), "18:00", 120, [
      { product_id: pkg.id, variant_id: pkg.variantId, unit_price: 100, name_en: "Gold" },
    ]);
    const lines = await linesOf(made.id);
    expect(lines.filter((l) => l.product_id === booth.id && !l.option_id)).toHaveLength(1);
    expect(lines.find((l) => l.option_id === gift)).toBeTruthy();
    expect(num((await bookingById(made.id)).total)).toBe(110);
    // The included booth is taken.
    expect(
      (
        await db.refusal(
          db.staff(brand, db.day(5), "12:00", 60, [
            { product_id: booth.id, variant_id: booth.variantId },
          ]),
        )
      )?.message,
    ).toBe("BOOKING_SERVICE_FULL");
  });

  it("is chosen by staff too, and is on the order as a line of its own", async () => {
    const { brand, booth, magnets } = await boothStore();
    const made = await db.staff(brand, db.day(5), "18:00", 180, [
      {
        product_id: booth.id,
        variant_id: booth.variantId,
        unit_price: 70,
        name_en: "Booth",
        options: [{ option_id: magnets }],
      },
    ]);
    // 70 + the attendant 15 + magnets 25 (the prints are off: a choice was sent).
    expect(num((await bookingById(made.id)).total)).toBe(110);
    const order = await db.rows<{ description: string; line_total: string }>(
      `select oi.description, oi.line_total from order_items oi
         join bookings b on b.order_id = oi.order_id where b.id = $1 order by oi.description`,
      [made.id],
    );
    expect(order.map((l) => [l.description, num(l.line_total)])).toEqual([
      ["+ Attendant", 15],
      ["+ Magnets", 25],
      ["+ Safety", 0],
      ["Booth", 70],
    ]);
    const total = await db.one<{ subtotal: string; total: string }>(
      "select o.subtotal, o.total from orders o join bookings b on b.order_id = o.id where b.id = $1",
      [made.id],
    );
    expect([num(total.subtotal), num(total.total)]).toEqual([110, 110]);
  });
});

describe("a booking longer than the longest length", () => {
  const lengths = [
    { minutes: 180, price: 70 },
    { minutes: 300, price: 110 },
  ];

  it("costs the longest length plus the price of each extra hour", async () => {
    // A store allows a few requests an hour from one phone, so each length gets its own store.
    const price = async (minutes: number) => {
      const brand = await db.store({ dailyCapacity: 5, leadDays: 0, minDuration: 120, step: 60 });
      const booth = await db.service(brand, { name: "Booth", lengths, extraHour: 20 });
      const asked = await db.request(brand, db.day(5), "12:00", minutes, [
        { product_id: booth.id },
      ]);
      return asked.total;
    };
    expect(await price(180)).toBe(70);
    expect(await price(300)).toBe(110);
    // One, two and three hours over the 5-hour price.
    expect(await price(360)).toBe(130);
    expect(await price(420)).toBe(150);
    expect(await price(480)).toBe(170);
  });

  it("is not offered when the service has no extra-hour price", async () => {
    const brand = await db.store({ dailyCapacity: 5, leadDays: 0, minDuration: 120, step: 60 });
    const booth = await db.service(brand, { name: "Booth", lengths });
    const refused = await db.refusal(
      db.request(brand, db.day(5), "12:00", 360, [{ product_id: booth.id }]),
    );
    expect(refused?.message).toBe("BOOKING_DURATION_NOT_OFFERED");
  });
});

describe("offers that need another service, add up, or cover chosen dates", () => {
  const rule = (
    brand: string,
    r: {
      value: number;
      name?: string;
      products?: string[];
      requires?: string[];
      stackable?: boolean;
      min?: number;
      max?: number | null;
      from?: string;
      to?: string;
    },
  ) =>
    db.pg.query(
      `insert into booking_discount_rules (brand_id, name_en, name_ar, kind, value, min_days, max_days,
         product_ids, requires_product_ids, stackable, event_from, event_to)
       values ($1, $2, $2, 'percent', $3, $4, $5, $6::uuid[], $7::uuid[], $8, $9, $10)`,
      [
        brand,
        r.name ?? "Offer",
        r.value,
        r.min ?? 0,
        r.max ?? null,
        r.products ? `{${r.products.join(",")}}` : null,
        r.requires ? `{${r.requires.join(",")}}` : null,
        r.stackable ?? false,
        r.from ?? null,
        r.to ?? null,
      ],
    );
  async function pair() {
    const brand = await db.store({ dailyCapacity: 9, leadDays: 0 });
    const booth = await db.service(brand, { name: "Booth", price: 70 });
    const phone = await db.service(brand, { name: "Phone", price: 40 });
    return { brand, booth, phone };
  }
  const book = (
    brand: string,
    day: number,
    ...services: Array<{ id: string; variantId: string; price: number }>
  ) =>
    db.staff(
      brand,
      db.day(day),
      "12:00",
      60,
      services.map((s) => ({ product_id: s.id, variant_id: s.variantId, unit_price: s.price })),
    );
  const discountOf = async (id: string) => num((await bookingById(id)).discount_amount);

  it("takes half off the phone only when it is booked with a booth", async () => {
    const { brand, booth, phone } = await pair();
    await rule(brand, {
      value: 50,
      name: "Phone with a booth",
      products: [phone.id],
      requires: [booth.id],
    });
    expect(await discountOf((await book(brand, 5, { ...phone, price: 40 })).id)).toBe(0);
    expect(await discountOf((await book(brand, 6, { ...booth, price: 70 })).id)).toBe(0);
    const both = await book(brand, 7, { ...booth, price: 70 }, { ...phone, price: 40 });
    expect(await discountOf(both.id)).toBe(20);
    expect((await bookingById(both.id)).discount_label_en).toBe("Phone with a booth");
  });

  it("adds a stackable offer to the best other one, and names both", async () => {
    const { brand, booth, phone } = await pair();
    await rule(brand, { value: 10, name: "This week", min: 0, max: 14 });
    await rule(brand, { value: 5, name: "Smaller", min: 0, max: 14 });
    await rule(brand, {
      value: 50,
      name: "Phone with a booth",
      products: [phone.id],
      requires: [booth.id],
      stackable: true,
    });
    const both = await book(brand, 5, { ...booth, price: 70 }, { ...phone, price: 40 });
    // The best plain offer is 10% of 110 = 11; the phone's half is 20 on top.
    expect(await discountOf(both.id)).toBe(31);
    expect((await bookingById(both.id)).discount_label_en).toBe("This week + Phone with a booth");
    expect(num((await bookingById(both.id)).total)).toBe(79);
  });

  it("without stacking, only the best of them applies", async () => {
    const { brand, booth, phone } = await pair();
    await rule(brand, { value: 10, name: "This week" });
    await rule(brand, {
      value: 50,
      name: "Phone with a booth",
      products: [phone.id],
      requires: [booth.id],
    });
    const both = await book(brand, 5, { ...booth, price: 70 }, { ...phone, price: 40 });
    expect(await discountOf(both.id)).toBe(20);
  });

  it("is a gift on the dates it is set for: the service is free", async () => {
    const { brand, phone } = await pair();
    await rule(brand, {
      value: 100,
      name: "Memory phone gift",
      products: [phone.id],
      from: db.day(6),
      to: db.day(6),
    });
    const onTheDay = await book(brand, 6, { ...phone, price: 40 });
    expect(await discountOf(onTheDay.id)).toBe(40);
    expect(num((await bookingById(onTheDay.id)).total)).toBe(0);
    expect(await discountOf((await book(brand, 7, { ...phone, price: 40 })).id)).toBe(0);
    expect(await discountOf((await book(brand, 5, { ...phone, price: 40 })).id)).toBe(0);
  });

  it("takes nothing off the add-ons", async () => {
    const brand = await db.store({ dailyCapacity: 9, leadDays: 0 });
    const booth = await db.service(brand, { name: "Booth", price: 70 });
    await db.option(booth.id, brand, { mode: "required", price: 30 });
    await rule(brand, { value: 10 });
    const made = await book(brand, 5, { ...booth, price: 70 });
    // 10% of the booth's 70, not of 100.
    expect(await discountOf(made.id)).toBe(7);
    expect(num((await bookingById(made.id)).total)).toBe(93);
  });
});

describe("a shop store's checkout of a booking", () => {
  it("carries the add-ons, the extra hours and the offer to the order, and charges the deposit on the real total", async () => {
    const brand = await db.store({ dailyCapacity: 5, leadDays: 0, minDuration: 120, step: 60 });
    const slug = await db.slugOf(brand);
    await db.pg.query("update business_settings set storefront_mode = 'shop' where brand_id = $1", [
      brand,
    ]);
    await db.pg.query("update booking_settings set deposit_percent = 50 where brand_id = $1", [
      brand,
    ]);
    const booth = await db.service(brand, {
      name: "Booth",
      lengths: [
        { minutes: 180, price: 70 },
        { minutes: 300, price: 110 },
      ],
      extraHour: 20,
    });
    await db.option(booth.id, brand, { name: "Attendant", mode: "required", price: 15 });
    const magnets = await db.option(booth.id, brand, {
      name: "Magnets",
      mode: "optional",
      price: 25,
    });
    await db.pg.query(
      `insert into booking_discount_rules (brand_id, name_en, kind, value, min_days, max_days)
       values ($1, 'This week', 'percent', 10, 0, 14)`,
      [brand],
    );

    const held = await db.one<{
      hold_booking: {
        booking_id: string;
        hold_token: string;
        total: number;
        discount: number;
        options_total: number;
        items: Array<{ variant_id: string; unit_price: number; quantity: number }>;
      };
    }>(
      `select hold_booking($1, $2::date, '12:00'::time, 360, $3::jsonb, $4::jsonb, '{}'::jsonb, null)`,
      [
        brand,
        db.day(5),
        JSON.stringify([{ product_id: booth.id, options: [{ option_id: magnets }] }]),
        JSON.stringify({ name: "Sara", phone: "39990017" }),
      ],
    );
    const hold = held.hold_booking;
    // 5 h price 110 + 1 extra hour 20 = 130; add-ons 15 + 25; 10% of 130 off.
    expect(hold).toMatchObject({ discount: 13, options_total: 40, total: 157 });
    // The cart carries the service alone, at the price the booking set.
    expect(hold.items.map((i) => num(i.unit_price))).toEqual([130]);

    const placed = await db.one<{ place_booking_order: Record<string, unknown> }>(
      `select place_booking_order($1, $2::uuid, $3, $4::jsonb, $5::jsonb, 'card')`,
      [
        hold.booking_id,
        hold.hold_token,
        slug,
        JSON.stringify({ name: "Sara", phone: "39990017" }),
        JSON.stringify(hold.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity }))),
      ],
    );
    const result = placed.place_booking_order;
    expect(result).toMatchObject({ total: 157, booking_status: "hold" });
    // A card pays the deposit: half of the real total (after the offer).
    expect(num(String(result.deposit_amount))).toBe(78.5);

    const order = await db.one<{ subtotal: string; discount: string; total: string }>(
      "select subtotal, discount, total from orders where id = $1",
      [result.order_id],
    );
    expect([num(order.subtotal), num(order.discount), num(order.total)]).toEqual([170, 13, 157]);
    const lines = await db.rows<{ description: string; line_total: string }>(
      "select description, line_total from order_items where order_id = $1 order by description",
      [result.order_id],
    );
    expect(lines.map((l) => [l.description, num(l.line_total)])).toEqual([
      ["+ Attendant", 15],
      ["+ Extra time", 20],
      ["+ Magnets", 25],
      ["Booth", 110],
    ]);
  });
});

describe("the store's pictures and questions, and who may call what", () => {
  it("are readable by the public and written by the store's staff", async () => {
    const rows = await db.rows<{
      tablename: string;
      policyname: string;
      roles: string;
      cmd: string;
    }>(
      `select tablename, policyname, roles::text, cmd from pg_policies
        where tablename in ('store_gallery_items', 'store_faq_items', 'service_options')
        order by tablename, policyname`,
    );
    const by = (table: string, cmd: string) =>
      rows.filter((r) => r.tablename === table && r.cmd === cmd).map((r) => r.roles);
    expect(by("store_gallery_items", "SELECT").join()).toMatch(/anon/);
    expect(by("store_faq_items", "SELECT").join()).toMatch(/anon/);
    expect(by("service_options", "SELECT").join()).toMatch(/anon/);
    expect(by("store_gallery_items", "ALL").join()).not.toMatch(/anon/);
    expect(by("store_faq_items", "ALL").join()).not.toMatch(/anon/);
    expect(by("service_options", "ALL").join()).not.toMatch(/anon/);
  });

  it("keeps the option writer out of the browser's hands, and the offers list public", async () => {
    const grants = await db.rows<{ fn: string; anon: boolean; authed: boolean }>(
      `select fn, has_function_privilege('anon', fn, 'execute') as anon,
              has_function_privilege('authenticated', fn, 'execute') as authed
         from unnest(array[
           'apply_booking_options(uuid, uuid, uuid, jsonb, boolean)', 'get_booking_discounts(uuid)'
         ]) as fn`,
    );
    expect(Object.fromEntries(grants.map((g) => [g.fn.split("(")[0], [g.anon, g.authed]]))).toEqual(
      {
        apply_booking_options: [false, false],
        get_booking_discounts: [true, true],
      },
    );
  });

  it("refuses an add-on for something that is not a service of the store", async () => {
    const brand = await db.store({ dailyCapacity: 1 });
    const other = await db.store({ dailyCapacity: 1 });
    const foreign = await db.service(other, { name: "Foreign" });
    const insert = db.pg.query(
      "insert into service_options (brand_id, product_id, name_en) values ($1, $2, 'x')",
      [brand, foreign.id],
    );
    expect((await db.refusal(insert))?.message).toBe("OPTION_PRODUCT_INVALID");
  });
});
