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
import rulesOnly from "../supabase/migrations/20261009120000_advance_payment_rules_only_scope.sql?raw";
import payInFull from "../supabase/migrations/20261009140000_advance_pay_in_full.sql?raw";
import {
  ADVANCE_SCOPES,
  advanceDue,
  type AdvanceOrder,
  type AdvanceScope,
} from "../src/lib/payments/advance-payment";
import {
  advanceRuleToJson,
  advanceRulesDue,
  defaultAdvanceRules,
  type AdvanceRuleDef,
} from "../src/lib/payments/advance-rules";

// The checkout's preview (TypeScript) must say what the database will charge
// (order_advance_due and advance_rules_due): the same orders, run through both.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });

const ABAYA = "00000000-0000-4000-8000-0000000000e1";
const SCARF = "00000000-0000-4000-8000-0000000000e2";
const BAG = "00000000-0000-4000-8000-0000000000e3";
const CATEGORY: Record<string, string> = { [ABAYA]: "abayas", [SCARF]: "scarves", [BAG]: "bags" };

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text);
    CREATE TABLE public.customers (id uuid PRIMARY KEY, brand_id uuid, user_id uuid);
    CREATE TABLE public.products (id uuid PRIMARY KEY, category text);
    INSERT INTO public.products VALUES ('${ABAYA}', 'abayas'), ('${SCARF}', 'scarves'), ('${BAG}', 'bags');
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY,
      advance_payment_enabled boolean, advance_payment_percent numeric, advance_payment_scope text);
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, customer_id uuid, channel text DEFAULT 'admin',
      payment_method text, total numeric NOT NULL DEFAULT 0, shipping numeric NOT NULL DEFAULT 0,
      fulfillment_method text NOT NULL DEFAULT 'delivery', advance_scope text,
      payment_status text, status text, advance_paid numeric DEFAULT 0, benefit_receipt_key text,
      benefit_verified_at timestamptz, benefit_verified_by uuid, benefit_receipt_delete_after timestamptz,
      updated_at timestamptz);
    CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, product_id uuid,
      line_total numeric NOT NULL DEFAULT 0, location text NOT NULL DEFAULT 'main');
  `);
  await db.exec(enforcement);
  await db.exec(scopeRule);
  await db.exec(rulesTable);
  await db.exec(rulesEngine);
  await db.exec(conditions);
  await db.exec(conditionsEngine);
  await db.exec(destination);
  await db.exec(destinationEngine);
  await db.exec(rulesOnly);
  // Only the small function of the pay-in-full migration: the rest of it needs the real schema.
  const start = payInFull.indexOf("CREATE OR REPLACE FUNCTION public.advance_full_payment_rules");
  await db.exec(
    payInFull.slice(start, payInFull.indexOf("$function$;", start) + "$function$;".length),
  );
});

const FULFILLMENTS: AdvanceOrder["fulfillment"][] = [
  "delivery",
  "pickup",
  "digital",
  "appointment",
];
type Shape = {
  name: string;
  total: number;
  shipping: number;
  lines: Array<{ amount: number; custom: boolean; product: string | null }>;
};
const line = (amount: number, custom: boolean, product: string | null = null) => ({
  amount,
  custom,
  product,
});
const SHAPES: Shape[] = [
  { name: "one ready-made line", total: 100, shipping: 0, lines: [line(100, false)] },
  { name: "one made-to-order line", total: 100, shipping: 0, lines: [line(100, true)] },
  { name: "mixed", total: 100, shipping: 0, lines: [line(60, true), line(40, false)] },
  {
    name: "mixed with a delivery fee",
    total: 105,
    shipping: 5,
    lines: [line(60, true), line(40, false)],
  },
  {
    name: "mixed with a discount",
    total: 90,
    shipping: 0,
    lines: [line(60, true), line(40, false)],
  },
  {
    name: "odd fils",
    total: 41.25,
    shipping: 2.5,
    lines: [line(20.125, true), line(18.625, false)],
  },
  {
    name: "many lines",
    total: 133.7,
    shipping: 3.7,
    lines: [
      line(10.1, true),
      line(20.2, false),
      line(30.3, true),
      line(40.4, false),
      line(28.7, true),
    ],
  },
  {
    name: "products and categories",
    total: 110,
    shipping: 10,
    lines: [line(50, true, ABAYA), line(30, false, SCARF), line(20, false, BAG)],
  },
  {
    name: "products with a discount",
    total: 90,
    shipping: 0,
    lines: [line(50, true, ABAYA), line(30, false, SCARF), line(20, false, BAG)],
  },
];

async function sqlDue(
  shape: Shape,
  fulfillment: string,
  call: (id: string) => Promise<string | null>,
  returning = false,
  country: string | null = null,
) {
  const row = (
    await db.query<{ id: string }>(
      `INSERT INTO public.orders (total, shipping, fulfillment_method, advance_percent, advance_scope, advance_returning, destination_country)
       VALUES ($1, $2, $3, 10, 'all', $4, $5) RETURNING id`,
      [shape.total, shape.shipping, fulfillment, returning, country],
    )
  ).rows[0];
  for (const l of shape.lines) {
    await db.query(
      "INSERT INTO public.order_items (order_id, product_id, line_total, location) VALUES ($1, $2, $3, $4)",
      [row.id, l.product, l.amount, l.custom ? "custom" : "main"],
    );
  }
  const value = await call(row.id);
  return value === null ? null : Number(value);
}

const asOrder = (shape: Shape, fulfillment: AdvanceOrder["fulfillment"]): AdvanceOrder => ({
  total: shape.total,
  shipping: shape.shipping,
  fulfillment,
  lines: shape.lines.map((l) => ({
    amount: l.amount,
    madeToOrder: l.custom,
    productId: l.product,
    category: l.product ? CATEGORY[l.product] : null,
  })),
});

describe("the checkout's preview and the database agree on the advance", () => {
  it("under the store's general rule: every scope, fulfillment, percentage and order shape", async () => {
    let compared = 0;
    for (const scope of ADVANCE_SCOPES as readonly AdvanceScope[]) {
      for (const fulfillment of FULFILLMENTS) {
        for (const percent of [10, 30, 33.33, 50, 100]) {
          for (const shape of SHAPES) {
            const sql = await sqlDue(shape, fulfillment, async (id) => {
              await db.query(
                "UPDATE public.orders SET advance_percent = $2, advance_scope = $3 WHERE id = $1",
                [id, percent, scope],
              );
              return (
                await db.query<{ d: string | null }>("SELECT public.order_advance_due($1) AS d", [
                  id,
                ])
              ).rows[0].d;
            });
            const ts = advanceDue(asOrder(shape, fulfillment), {
              enabled: true,
              percent,
              scope,
              rules: [],
            });
            expect(ts, `${scope} / ${fulfillment} / ${percent}% / ${shape.name}`).toBe(sql);
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBe(ADVANCE_SCOPES.length * 4 * 5 * SHAPES.length);
  });

  const rule = (over: Partial<AdvanceRuleDef>): AdvanceRuleDef => ({
    fulfillment: [],
    madeToOrder: null,
    productIds: [],
    categorySlugs: [],
    kind: "percent",
    value: 30,
    min: null,
    max: null,
    includeFee: false,
    minTotal: null,
    maxTotal: null,
    customer: "any",
    destination: "any",
    countries: [],
    ...over,
  });
  const RULE_SETS: Array<{ name: string; rules: AdvanceRuleDef[] }> = [
    { name: "made to order 50%", rules: [rule({ madeToOrder: true, value: 50 })] },
    { name: "ready-made 10%", rules: [rule({ madeToOrder: false, value: 10 })] },
    {
      name: "a product, a category, then the rest",
      rules: [
        rule({ productIds: [ABAYA], value: 50 }),
        rule({ categorySlugs: ["scarves"], value: 10 }),
        ...defaultAdvanceRules(30, "all"),
      ],
    },
    {
      name: "a fixed amount for a product",
      rules: [
        rule({ productIds: [ABAYA], kind: "fixed", value: 20 }),
        ...defaultAdvanceRules(25, "all"),
      ],
    },
    {
      name: "least and most",
      rules: [
        rule({ categorySlugs: ["bags"], value: 10, min: 5, max: 8 }),
        rule({ madeToOrder: true, value: 7.5, min: 1, max: 100 }),
      ],
    },
    {
      name: "delivery with the fee, pickup and digital full",
      rules: [
        rule({ fulfillment: ["delivery"], value: 40, includeFee: true }),
        rule({ fulfillment: ["pickup", "digital"], value: 100 }),
      ],
    },
    {
      name: "the fee taken by the first rule that asks for it",
      rules: [
        rule({ madeToOrder: true, value: 20, includeFee: true }),
        rule({ value: 30, includeFee: true }),
      ],
    },
    {
      name: "orders from 100 to 120 at 50%, then the rest",
      rules: [rule({ minTotal: 100, maxTotal: 120, value: 50 }), ...defaultAdvanceRules(20, "all")],
    },
    {
      name: "a new customer and a returning one",
      rules: [
        rule({ customer: "new", value: 50, includeFee: true }),
        rule({ customer: "returning", value: 10 }),
      ],
    },
    {
      name: "big orders from a returning customer, by category",
      rules: [
        rule({
          customer: "returning",
          minTotal: 90,
          categorySlugs: ["bags"],
          kind: "fixed",
          value: 7,
        }),
        rule({ minTotal: 90, madeToOrder: true, value: 25, min: 3 }),
      ],
    },
    {
      name: "abroad in full, with the fee, then local at a fifth",
      rules: [
        rule({ destination: "abroad", value: 100, includeFee: true }),
        rule({ destination: "local", value: 20 }),
      ],
    },
    {
      name: "chosen countries abroad, for big orders, then the general rule",
      rules: [
        rule({ destination: "abroad", countries: ["SA", "AE"], minTotal: 90, value: 60 }),
        rule({ destination: "abroad", kind: "fixed", value: 15 }),
        ...defaultAdvanceRules(25, "all"),
      ],
    },
    {
      name: "a returning customer abroad, delivery only",
      rules: [
        rule({
          destination: "abroad",
          customer: "returning",
          fulfillment: ["delivery"],
          madeToOrder: true,
          value: 40,
        }),
      ],
    },
    {
      name: "a rule that reaches nothing, then a fixed one above the total",
      rules: [
        rule({ productIds: ["00000000-0000-4000-8000-0000000000ff"], value: 90 }),
        rule({ kind: "fixed", value: 500 }),
      ],
    },
  ];

  // Who is ordering and where it is going, in four combinations that cover each side of both.
  const WHO: Array<{ returning: boolean; country: string | null }> = [
    { returning: false, country: null },
    { returning: true, country: "BH" },
    { returning: false, country: "SA" },
    { returning: true, country: "KW" },
  ];

  it("under a store's own rules: every rule set, fulfillment, customer, destination and order shape", async () => {
    let compared = 0;
    for (const set of RULE_SETS) {
      for (const fulfillment of FULFILLMENTS) {
        for (const { returning, country } of WHO) {
          for (const shape of SHAPES) {
            const json = JSON.stringify(set.rules.map(advanceRuleToJson));
            const sql = await sqlDue(
              shape,
              fulfillment,
              async (id) =>
                (
                  await db.query<{ d: string | null }>(
                    "SELECT public.advance_rules_due($1, $2::jsonb) AS d",
                    [id, json],
                  )
                ).rows[0].d,
              returning,
              country,
            );
            const ts = advanceRulesDue(
              { ...asOrder(shape, fulfillment), returning, country },
              set.rules,
            );
            expect(
              ts,
              `${set.name} / ${fulfillment} / ${returning} / ${country} / ${shape.name}`,
            ).toBe(sql);
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBe(RULE_SETS.length * 4 * WHO.length * SHAPES.length);
  });
});

describe("paying the whole amount (the customer's choice at checkout)", () => {
  it("asks the whole total for every fulfillment and order shape, whatever the store's rules", async () => {
    for (const fulfillment of FULFILLMENTS) {
      for (const shape of SHAPES) {
        const due = await sqlDue(shape, fulfillment, async (id) => {
          await db.query(
            "UPDATE public.orders SET advance_rules = public.advance_full_payment_rules() WHERE id = $1",
            [id],
          );
          return (
            await db.query<{ d: string | null }>("SELECT public.order_advance_due($1) AS d", [id])
          ).rows[0].d;
        });
        expect(due, `${fulfillment} / ${shape.name}`).toBeCloseTo(shape.total, 3);
      }
    }
  });
});
