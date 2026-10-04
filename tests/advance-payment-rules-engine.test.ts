import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import enforcement from "../supabase/migrations/20261003120000_advance_payment_enforcement.sql?raw";
import scopeRule from "../supabase/migrations/20261003140000_advance_payment_scope_rule.sql?raw";
import rulesTable from "../supabase/migrations/20261003150000_advance_payment_rules.sql?raw";
import rulesEngine from "../supabase/migrations/20261003160000_advance_payment_rules_engine.sql?raw";
import conditions from "../supabase/migrations/20261004100000_advance_payment_conditions.sql?raw";
import conditionsEngine from "../supabase/migrations/20261004110000_advance_payment_conditions_engine.sql?raw";
import destination from "../supabase/migrations/20261005100000_advance_payment_destination.sql?raw";
import destinationEngine from "../supabase/migrations/20261005120000_advance_payment_destination_engine.sql?raw";

// A store's own advance-payment rules, as the database decides them (PGlite): ordered rules
// that reach lines by fulfillment, made-to-order or ready-made, product and category, then the
// store's general rule for whatever they leave.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SHOP = "00000000-0000-4000-8000-0000000000c1";
const OTHER = "00000000-0000-4000-8000-0000000000c2";
const OFF = "00000000-0000-4000-8000-0000000000c3";
const ABAYA = "00000000-0000-4000-8000-0000000000d1";
const SCARF = "00000000-0000-4000-8000-0000000000d2";
const BAG = "00000000-0000-4000-8000-0000000000d3";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text);
    CREATE TABLE public.customers (id uuid PRIMARY KEY, brand_id uuid, user_id uuid);
    CREATE TABLE public.products (id uuid PRIMARY KEY, category text);
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY,
      advance_payment_enabled boolean NOT NULL DEFAULT false,
      advance_payment_percent numeric(5, 2) NOT NULL DEFAULT 30,
      advance_payment_scope text NOT NULL DEFAULT 'all');
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, customer_id uuid, channel text NOT NULL DEFAULT 'admin',
      payment_method text, total numeric NOT NULL DEFAULT 0, shipping numeric NOT NULL DEFAULT 0,
      fulfillment_method text NOT NULL DEFAULT 'delivery', advance_scope text,
      payment_status text NOT NULL DEFAULT 'unpaid', status text NOT NULL DEFAULT 'draft',
      advance_paid numeric NOT NULL DEFAULT 0, benefit_receipt_key text, benefit_verified_at timestamptz,
      benefit_verified_by uuid, benefit_receipt_delete_after timestamptz, updated_at timestamptz);
    CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, product_id uuid,
      line_total numeric NOT NULL DEFAULT 0, location text NOT NULL DEFAULT 'main');
    INSERT INTO public.brands VALUES ('${SHOP}', 'shop'), ('${OTHER}', 'other'), ('${OFF}', 'off');
    INSERT INTO public.products VALUES ('${ABAYA}', 'abayas'), ('${SCARF}', 'scarves'), ('${BAG}', 'bags');
    INSERT INTO public.business_settings (brand_id, advance_payment_enabled, advance_payment_percent, advance_payment_scope)
      VALUES ('${SHOP}', true, 30, 'all'), ('${OTHER}', true, 30, 'all'), ('${OFF}', false, 30, 'all');
  `);
  await db.exec(enforcement);
  await db.exec(scopeRule);
  await db.exec(rulesTable);
  await db.exec(rulesEngine);
  await db.exec(conditions);
  await db.exec(conditionsEngine);
  await db.exec(destination);
  await db.exec(destinationEngine);
});

type RuleInput = {
  name?: string;
  order?: number;
  fulfillment?: string[];
  madeToOrder?: boolean | null;
  products?: string[];
  categories?: string[];
  kind?: "percent" | "fixed";
  value: number;
  min?: number | null;
  max?: number | null;
  fee?: boolean;
  active?: boolean;
  minTotal?: number | null;
  maxTotal?: number | null;
  customer?: "any" | "new" | "returning";
  destination?: "any" | "local" | "abroad";
  countries?: string[];
};

const arr = (values: string[] | undefined) => (values?.length ? `{${values.join(",")}}` : "{}");

async function addRule(brand: string, r: RuleInput) {
  const row = await db.query<{ id: string }>(
    `INSERT INTO public.advance_payment_rules (brand_id, name_en, sort_order, fulfillment, made_to_order,
       product_ids, category_slugs, amount_kind, amount_value, min_amount, max_amount, include_delivery_fee, is_active, min_order_total, max_order_total, customer_kind, destination_kind, destination_countries)
     VALUES ($1, $2, $3, $4::text[], $5, $6::uuid[], $7::text[], $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::text[]) RETURNING id`,
    [
      brand,
      r.name ?? "Rule",
      r.order ?? 0,
      arr(r.fulfillment),
      r.madeToOrder ?? null,
      arr(r.products),
      arr(r.categories),
      r.kind ?? "percent",
      r.value,
      r.min ?? null,
      r.max ?? null,
      r.fee ?? false,
      r.active ?? true,
      r.minTotal ?? null,
      r.maxTotal ?? null,
      r.customer ?? "any",
      r.destination ?? "any",
      arr(r.countries),
    ],
  );
  return row.rows[0].id;
}

const clearRules = (brand: string) =>
  db.query("DELETE FROM public.advance_payment_rules WHERE brand_id = $1", [brand]);

type Line = { amount: number; product?: string; custom?: boolean };
type Placed = {
  brand?: string;
  method?: string;
  channel?: string;
  fulfillment?: string;
  shipping?: number;
  total?: number;
  customer?: string | null;
  status?: string;
  country?: string | null;
  lines: Line[];
};

async function place(order: Placed) {
  const sum = order.lines.reduce((s, l) => s + l.amount, 0);
  const shipping = order.shipping ?? 0;
  await db.exec("BEGIN");
  try {
    const row = (
      await db.query<{ id: string }>(
        `INSERT INTO public.orders (brand_id, channel, payment_method, fulfillment_method, total, shipping, customer_id, status, destination_country)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          order.brand ?? SHOP,
          order.channel ?? "storefront",
          order.method ?? "card",
          order.fulfillment ?? "delivery",
          order.total ?? sum + shipping,
          shipping,
          order.customer ?? null,
          order.status ?? "draft",
          order.country ?? null,
        ],
      )
    ).rows[0];
    for (const line of order.lines) {
      await db.query(
        "INSERT INTO public.order_items (order_id, product_id, line_total, location) VALUES ($1, $2, $3, $4)",
        [row.id, line.product ?? null, line.amount, line.custom ? "custom" : "main"],
      );
    }
    await db.exec("COMMIT");
    return row.id;
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

const due = async (id: string) => {
  const v = (await db.query<{ d: string | null }>("SELECT public.order_advance_due($1) AS d", [id]))
    .rows[0].d;
  return v === null ? null : Number(v);
};
const owed = async (order: Placed) => due(await place(order));

describe("a store's own rules, then its general rule", () => {
  it("a store with no rule of its own behaves as before: the general rule only", async () => {
    await clearRules(SHOP);
    expect(await owed({ lines: [{ amount: 100 }] })).toBe(30);
  });

  it("takes the made-to-order lines under a rule of its own and the rest under the general rule", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { madeToOrder: true, value: 50 });
    // 60 made to order at 50% = 30, the 40 left at the general 30% = 12.
    expect(await owed({ lines: [{ amount: 60, custom: true }, { amount: 40 }] })).toBe(42);
    expect(await owed({ lines: [{ amount: 100 }] })).toBe(30);
  });

  it("reaches chosen products and chosen categories", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { products: [ABAYA], value: 50, order: 1 });
    await addRule(SHOP, { categories: ["scarves"], value: 10, order: 2 });
    // abaya 60 at 50% = 30; scarf 30 at 10% = 3; bag 10 at the general 30% = 3.
    expect(
      await owed({
        lines: [
          { amount: 60, product: ABAYA },
          { amount: 30, product: SCARF },
          { amount: 10, product: BAG },
        ],
      }),
    ).toBe(36);
  });

  it("reaches ready-made lines only, or lines of a chosen way of fulfilling", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { madeToOrder: false, value: 10, order: 1 });
    expect(await owed({ lines: [{ amount: 60, custom: true }, { amount: 40 }] })).toBe(22);
    await clearRules(SHOP);
    await addRule(SHOP, { fulfillment: ["pickup", "digital"], value: 100 });
    expect(await owed({ lines: [{ amount: 100 }], fulfillment: "pickup" })).toBe(100);
    expect(await owed({ lines: [{ amount: 100 }], fulfillment: "delivery" })).toBe(30);
  });

  it("gives a line to the first rule that reaches it, by order, and skips a switched-off rule", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { name: "second", products: [ABAYA], value: 20, order: 2 });
    await addRule(SHOP, { name: "first", products: [ABAYA], value: 60, order: 1 });
    await addRule(SHOP, { name: "off", products: [ABAYA], value: 90, order: 0, active: false });
    expect(await owed({ lines: [{ amount: 100, product: ABAYA }] })).toBe(60);
  });

  it("asks a fixed amount once, never above what it reaches, with a least and a most", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { products: [ABAYA], kind: "fixed", value: 20, order: 1 });
    expect(
      await owed({
        lines: [
          { amount: 70, product: ABAYA },
          { amount: 30, product: BAG },
        ],
      }),
    ).toBe(29);
    // Two lines of the same product still ask the fixed amount once.
    expect(
      await owed({
        lines: [
          { amount: 35, product: ABAYA },
          { amount: 35, product: ABAYA },
        ],
      }),
    ).toBe(20);
    // A fixed amount above its basis asks the basis.
    expect(await owed({ lines: [{ amount: 12, product: ABAYA }] })).toBe(12);
    await clearRules(SHOP);
    await addRule(SHOP, { categories: ["bags"], value: 10, min: 5, max: 8, order: 1 });
    expect(await owed({ lines: [{ amount: 20, product: BAG }] })).toBe(5);
    expect(await owed({ lines: [{ amount: 100, product: BAG }] })).toBe(8);
  });

  it("adds the delivery fee to the first rule that asks for it and reached a line", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { fulfillment: ["delivery"], value: 40, fee: true, order: 1 });
    // 100 of lines plus a fee of 5: 40% of 105 = 42; a pickup falls to the general 30% of 100.
    expect(await owed({ lines: [{ amount: 100 }], shipping: 5 })).toBe(42);
    expect(await owed({ lines: [{ amount: 100 }], fulfillment: "pickup" })).toBe(30);
    await clearRules(SHOP);
    await addRule(SHOP, { fulfillment: ["delivery"], value: 40, fee: false, order: 1 });
    expect(await owed({ lines: [{ amount: 100 }], shipping: 5 })).toBe(40);
  });

  it("is never more than the order total", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { products: [ABAYA], kind: "fixed", value: 500 });
    await addRule(SHOP, { categories: ["bags"], kind: "fixed", value: 500 });
    expect(
      await owed({
        lines: [
          { amount: 30, product: ABAYA },
          { amount: 20, product: BAG },
        ],
      }),
    ).toBe(50);
  });
});

describe("the rules an order is placed under", () => {
  it("are kept on the order, so editing a rule later does not move it", async () => {
    await clearRules(SHOP);
    const ruleId = await addRule(SHOP, { products: [ABAYA], value: 50 });
    const id = await place({ lines: [{ amount: 100, product: ABAYA }] });
    expect(await due(id)).toBe(50);
    await db.query("UPDATE public.advance_payment_rules SET amount_value = 10 WHERE id = $1", [
      ruleId,
    ]);
    expect(await due(id)).toBe(50);
    await db.query("DELETE FROM public.advance_payment_rules WHERE id = $1", [ruleId]);
    expect(await due(id)).toBe(50);
    // A new order is placed under the rules as they are now.
    expect(await owed({ lines: [{ amount: 100, product: ABAYA }] })).toBe(30);
  });

  it("are only the store's own: another store's rules never reach this order", async () => {
    await clearRules(SHOP);
    await clearRules(OTHER);
    await addRule(OTHER, { products: [ABAYA], value: 90 });
    expect(await owed({ lines: [{ amount: 100, product: ABAYA }] })).toBe(30);
    expect(await owed({ brand: OTHER, lines: [{ amount: 100, product: ABAYA }] })).toBe(90);
  });

  it("are not applied when the store has the rule switched off, or to staff-made orders", async () => {
    await clearRules(OFF);
    await addRule(OFF, { products: [ABAYA], value: 90 });
    expect(await owed({ brand: OFF, lines: [{ amount: 100, product: ABAYA }] })).toBeNull();
    await clearRules(SHOP);
    await addRule(SHOP, { products: [ABAYA], value: 90 });
    expect(await owed({ channel: "admin", lines: [{ amount: 100, product: ABAYA }] })).toBeNull();
  });
});

describe("cash on delivery under a store's own rules", () => {
  const cod = (lines: Line[]) => place({ method: "cod", lines });

  it("is refused only for the orders a rule reaches", async () => {
    await clearRules(SHOP);
    // The general rule covers only made-to-order lines; a rule of its own adds the abaya.
    await db.query(
      "UPDATE public.business_settings SET advance_payment_scope = 'made_to_order' WHERE brand_id = $1",
      [SHOP],
    );
    await addRule(SHOP, { products: [ABAYA], value: 40 });
    expect(await cod([{ amount: 100, product: BAG }])).toBeTruthy();
    await expect(cod([{ amount: 100, product: ABAYA }])).rejects.toThrow(
      /ADVANCE_PAYMENT_REQUIRED/,
    );
    await expect(cod([{ amount: 100, product: BAG, custom: true }])).rejects.toThrow(
      /ADVANCE_PAYMENT_REQUIRED/,
    );
    await db.query(
      "UPDATE public.business_settings SET advance_payment_scope = 'all' WHERE brand_id = $1",
      [SHOP],
    );
  });
});

describe("the rule table's own checks", () => {
  it("refuses a percentage over 100, a most below the least, and an unknown way of fulfilling", async () => {
    await expect(addRule(SHOP, { value: 120 })).rejects.toThrow();
    await expect(addRule(SHOP, { value: 10, min: 9, max: 5 })).rejects.toThrow();
    await expect(addRule(SHOP, { value: 10, fulfillment: ["teleport"] })).rejects.toThrow();
    await expect(addRule(SHOP, { value: 0 })).rejects.toThrow();
  });
});

describe("a rule that looks at the order's total", () => {
  it("reaches an order only within its least and most", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { minTotal: 100, value: 50, order: 1 });
    // At 100 or more the rule takes the lines at 50%; below it the general 30% does.
    expect(await owed({ lines: [{ amount: 100 }] })).toBe(50);
    expect(await owed({ lines: [{ amount: 99.5 }] })).toBe(29.85);
    await clearRules(SHOP);
    await addRule(SHOP, { minTotal: 50, maxTotal: 150, value: 10, order: 1 });
    expect(await owed({ lines: [{ amount: 150 }] })).toBe(15);
    expect(await owed({ lines: [{ amount: 151 }] })).toBe(45.3);
    expect(await owed({ lines: [{ amount: 49 }] })).toBe(14.7);
  });

  it("counts the order's total with its delivery fee", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { minTotal: 105, value: 50, fee: true, order: 1 });
    expect(await owed({ lines: [{ amount: 100 }], shipping: 5 })).toBe(52.5);
    expect(await owed({ lines: [{ amount: 100 }], shipping: 4 })).toBe(31.2);
  });
});

describe("a rule that looks at the customer", () => {
  const CUSTOMER = "00000000-0000-4000-8000-0000000000f1";
  const STRANGER = "00000000-0000-4000-8000-0000000000f2";

  it("asks a new customer one thing and a returning customer another", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { customer: "new", value: 50, order: 1 });
    await addRule(SHOP, { customer: "returning", value: 10, order: 2 });
    // A first order: new. Once it is confirmed, the next order is returning.
    const first = await place({ customer: CUSTOMER, lines: [{ amount: 100 }] });
    expect(await due(first)).toBe(50);
    await db.query("UPDATE public.orders SET status = 'confirmed' WHERE id = $1", [first]);
    expect(await owed({ customer: CUSTOMER, lines: [{ amount: 100 }] })).toBe(10);
    // Another customer, or a guest with no customer record, is new.
    expect(await owed({ customer: STRANGER, lines: [{ amount: 100 }] })).toBe(50);
    expect(await owed({ customer: null, lines: [{ amount: 100 }] })).toBe(50);
  });

  it("does not count an order that is still pending, cancelled or a draft", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { customer: "returning", value: 10, order: 1 });
    const buyer = "00000000-0000-4000-8000-0000000000f3";
    for (const status of ["pending", "cancelled", "draft"]) {
      await place({ customer: buyer, status, lines: [{ amount: 10 }] });
    }
    expect(await owed({ customer: buyer, lines: [{ amount: 100 }] })).toBe(30);
    await place({ customer: buyer, status: "completed", lines: [{ amount: 10 }] });
    expect(await owed({ customer: buyer, lines: [{ amount: 100 }] })).toBe(10);
  });

  it("keeps the answer on the order: later orders do not turn an earlier one returning", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { customer: "new", value: 50, order: 1 });
    const buyer = "00000000-0000-4000-8000-0000000000f4";
    const first = await place({ customer: buyer, status: "confirmed", lines: [{ amount: 100 }] });
    await place({ customer: buyer, status: "confirmed", lines: [{ amount: 100 }] });
    expect(await due(first)).toBe(50);
  });

  it("is only about the same store's orders", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { customer: "returning", value: 10, order: 1 });
    const buyer = "00000000-0000-4000-8000-0000000000f5";
    await place({ brand: OTHER, customer: buyer, status: "completed", lines: [{ amount: 10 }] });
    expect(await owed({ customer: buyer, lines: [{ amount: 100 }] })).toBe(30);
  });
});

describe("what the checkout may ask about the signed-in customer", () => {
  const USER = "00000000-0000-4000-8000-0000000000a9";
  const OTHER_USER = "00000000-0000-4000-8000-0000000000aa";
  const CUSTOMER_ID = "00000000-0000-4000-8000-0000000000b9";
  const ask = async (uid: string | null, slug = "shop") => {
    await db.exec(`SET test.uid = '${uid ?? ""}'`);
    return (
      await db.query<{ r: boolean }>("SELECT public.advance_customer_is_returning_rpc($1) AS r", [
        slug,
      ])
    ).rows[0].r;
  };

  it("is true for a customer with a confirmed order, about themselves only", async () => {
    await db.query("INSERT INTO public.customers VALUES ($1, $2, $3)", [CUSTOMER_ID, SHOP, USER]);
    expect(await ask(USER)).toBe(false);
    await place({ customer: CUSTOMER_ID, status: "pending", lines: [{ amount: 10 }] });
    expect(await ask(USER)).toBe(false);
    await place({ customer: CUSTOMER_ID, status: "confirmed", lines: [{ amount: 10 }] });
    expect(await ask(USER)).toBe(true);
    expect(await ask(OTHER_USER)).toBe(false);
    expect(await ask(null)).toBe(false);
    expect(await ask(USER, "other")).toBe(false);
    await db.exec("SET test.uid = ''");
  });
});

describe("the new columns' own checks", () => {
  it("refuses a most below the least order total, and an unknown kind of customer", async () => {
    await expect(addRule(SHOP, { value: 10, minTotal: 50, maxTotal: 20 })).rejects.toThrow();
    await expect(
      addRule(SHOP, { value: 10, customer: "vip" as unknown as "any" }),
    ).rejects.toThrow();
    await expect(addRule(SHOP, { value: 10, maxTotal: 0 })).rejects.toThrow();
  });
});

describe("a rule that looks at where the order is going", () => {
  const place100 = (country: string | null, over: Partial<Placed> = {}) =>
    owed({ country, lines: [{ amount: 100 }], ...over });

  it("local reaches an order going to Bahrain, or to no country at all", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { destination: "local", value: 10, order: 1 });
    expect(await place100("BH")).toBe(10);
    expect(await place100(null)).toBe(10);
    expect(await place100(null, { fulfillment: "pickup" })).toBe(10);
    // Abroad goes to the general 30%.
    expect(await place100("SA")).toBe(30);
  });

  it("abroad reaches an order going to another country, and only the listed ones", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { destination: "abroad", value: 100, order: 1 });
    expect(await place100("SA")).toBe(100);
    expect(await place100("AE")).toBe(100);
    expect(await place100("BH")).toBe(30);
    expect(await place100(null)).toBe(30);
    await clearRules(SHOP);
    await addRule(SHOP, { destination: "abroad", countries: ["SA", "KW"], value: 60, order: 1 });
    expect(await place100("KW")).toBe(60);
    expect(await place100("AE")).toBe(30);
  });

  it("works together with the delivery fee and the other conditions", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, {
      destination: "abroad",
      fulfillment: ["delivery"],
      minTotal: 100,
      value: 50,
      fee: true,
      order: 1,
    });
    expect(await place100("SA", { shipping: 10, total: 110 })).toBe(55);
    expect(await place100("SA", { shipping: 10, total: 110, fulfillment: "pickup" })).toBe(33);
    expect(await place100("BH", { shipping: 10, total: 110 })).toBe(33);
  });

  it("is kept in the rules an order was placed under", async () => {
    await clearRules(SHOP);
    await addRule(SHOP, { destination: "abroad", value: 100, order: 1 });
    const id = await place({ country: "SA", lines: [{ amount: 100 }] });
    await clearRules(SHOP);
    await addRule(SHOP, { destination: "local", value: 10, order: 1 });
    expect(await due(id)).toBe(100);
  });

  it("refuses a country written wrongly, countries without abroad, and a bad order country", async () => {
    await expect(
      addRule(SHOP, { value: 10, destination: "abroad", countries: ["sa"] }),
    ).rejects.toThrow();
    await expect(
      addRule(SHOP, { value: 10, destination: "local", countries: ["SA"] }),
    ).rejects.toThrow();
    await expect(addRule(SHOP, { value: 10, destination: "elsewhere" as "any" })).rejects.toThrow();
    await expect(place({ country: "Saudi", lines: [{ amount: 10 }] })).rejects.toThrow();
  });
});
