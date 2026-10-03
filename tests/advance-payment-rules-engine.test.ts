import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import enforcement from "../supabase/migrations/20261003120000_advance_payment_enforcement.sql?raw";
import scopeRule from "../supabase/migrations/20261003140000_advance_payment_scope_rule.sql?raw";
import rulesTable from "../supabase/migrations/20261003150000_advance_payment_rules.sql?raw";
import rulesEngine from "../supabase/migrations/20261003160000_advance_payment_rules_engine.sql?raw";

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
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY);
    CREATE TABLE public.products (id uuid PRIMARY KEY, category text);
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY,
      advance_payment_enabled boolean NOT NULL DEFAULT false,
      advance_payment_percent numeric(5, 2) NOT NULL DEFAULT 30,
      advance_payment_scope text NOT NULL DEFAULT 'all');
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, channel text NOT NULL DEFAULT 'admin',
      payment_method text, total numeric NOT NULL DEFAULT 0, shipping numeric NOT NULL DEFAULT 0,
      fulfillment_method text NOT NULL DEFAULT 'delivery', advance_scope text,
      payment_status text NOT NULL DEFAULT 'unpaid', status text NOT NULL DEFAULT 'draft',
      advance_paid numeric NOT NULL DEFAULT 0, benefit_receipt_key text, benefit_verified_at timestamptz,
      benefit_verified_by uuid, benefit_receipt_delete_after timestamptz, updated_at timestamptz);
    CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, product_id uuid,
      line_total numeric NOT NULL DEFAULT 0, location text NOT NULL DEFAULT 'main');
    INSERT INTO public.brands VALUES ('${SHOP}'), ('${OTHER}'), ('${OFF}');
    INSERT INTO public.products VALUES ('${ABAYA}', 'abayas'), ('${SCARF}', 'scarves'), ('${BAG}', 'bags');
    INSERT INTO public.business_settings (brand_id, advance_payment_enabled, advance_payment_percent, advance_payment_scope)
      VALUES ('${SHOP}', true, 30, 'all'), ('${OTHER}', true, 30, 'all'), ('${OFF}', false, 30, 'all');
  `);
  await db.exec(enforcement);
  await db.exec(scopeRule);
  await db.exec(rulesTable);
  await db.exec(rulesEngine);
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
};

const arr = (values: string[] | undefined) => (values?.length ? `{${values.join(",")}}` : "{}");

async function addRule(brand: string, r: RuleInput) {
  const row = await db.query<{ id: string }>(
    `INSERT INTO public.advance_payment_rules (brand_id, name_en, sort_order, fulfillment, made_to_order,
       product_ids, category_slugs, amount_kind, amount_value, min_amount, max_amount, include_delivery_fee, is_active)
     VALUES ($1, $2, $3, $4::text[], $5, $6::uuid[], $7::text[], $8, $9, $10, $11, $12, $13) RETURNING id`,
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
  lines: Line[];
};

async function place(order: Placed) {
  const sum = order.lines.reduce((s, l) => s + l.amount, 0);
  const shipping = order.shipping ?? 0;
  await db.exec("BEGIN");
  try {
    const row = (
      await db.query<{ id: string }>(
        `INSERT INTO public.orders (brand_id, channel, payment_method, fulfillment_method, total, shipping)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          order.brand ?? SHOP,
          order.channel ?? "storefront",
          order.method ?? "card",
          order.fulfillment ?? "delivery",
          order.total ?? sum + shipping,
          shipping,
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
