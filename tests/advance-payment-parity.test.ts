import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import enforcement from "../supabase/migrations/20261003120000_advance_payment_enforcement.sql?raw";
import scopeRule from "../supabase/migrations/20261003140000_advance_payment_scope_rule.sql?raw";
import {
  ADVANCE_SCOPES,
  advanceDue,
  type AdvanceOrder,
  type AdvanceScope,
} from "../src/lib/payments/advance-payment";

// The checkout's preview (TypeScript) must say what the database will charge
// (order_advance_due): the same orders, run through both.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY,
      advance_payment_enabled boolean, advance_payment_percent numeric, advance_payment_scope text);
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, channel text DEFAULT 'admin',
      payment_method text, total numeric NOT NULL DEFAULT 0, shipping numeric NOT NULL DEFAULT 0,
      fulfillment_method text NOT NULL DEFAULT 'delivery', advance_scope text,
      payment_status text, status text, advance_paid numeric DEFAULT 0, benefit_receipt_key text,
      benefit_verified_at timestamptz, benefit_verified_by uuid, benefit_receipt_delete_after timestamptz,
      updated_at timestamptz);
    CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
      line_total numeric NOT NULL DEFAULT 0, location text NOT NULL DEFAULT 'main');
  `);
  await db.exec(enforcement);
  await db.exec(scopeRule);
});

const FULFILLMENTS: AdvanceOrder["fulfillment"][] = [
  "delivery",
  "pickup",
  "digital",
  "appointment",
];
const SHAPES: Array<{
  name: string;
  total: number;
  shipping: number;
  lines: number[];
  custom: boolean[];
}> = [
  { name: "one ready-made line", total: 100, shipping: 0, lines: [100], custom: [false] },
  { name: "one made-to-order line", total: 100, shipping: 0, lines: [100], custom: [true] },
  { name: "mixed", total: 100, shipping: 0, lines: [60, 40], custom: [true, false] },
  {
    name: "mixed with a delivery fee",
    total: 105,
    shipping: 5,
    lines: [60, 40],
    custom: [true, false],
  },
  { name: "mixed with a discount", total: 90, shipping: 0, lines: [60, 40], custom: [true, false] },
  { name: "odd fils", total: 41.25, shipping: 2.5, lines: [20.125, 18.625], custom: [true, false] },
  {
    name: "many lines",
    total: 133.7,
    shipping: 3.7,
    lines: [10.1, 20.2, 30.3, 40.4, 28.7],
    custom: [true, false, true, false, true],
  },
];
const PERCENTS = [10, 30, 33.33, 50, 100];

describe("the checkout's preview and the database agree on the advance", () => {
  it("gives the same amount across scopes, fulfillments, percentages and order shapes", async () => {
    let compared = 0;
    for (const scope of ADVANCE_SCOPES as readonly AdvanceScope[]) {
      for (const fulfillment of FULFILLMENTS) {
        for (const percent of PERCENTS) {
          for (const shape of SHAPES) {
            const row = (
              await db.query<{ id: string }>(
                `INSERT INTO public.orders (total, shipping, fulfillment_method, advance_percent, advance_scope)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [shape.total, shape.shipping, fulfillment, percent, scope],
              )
            ).rows[0];
            for (const [index, amount] of shape.lines.entries()) {
              await db.query(
                "INSERT INTO public.order_items (order_id, line_total, location) VALUES ($1, $2, $3)",
                [row.id, amount, shape.custom[index] ? "custom" : "main"],
              );
            }
            const sql = (
              await db.query<{ d: string | null }>("SELECT public.order_advance_due($1) AS d", [
                row.id,
              ])
            ).rows[0].d;
            const ts = advanceDue(
              {
                total: shape.total,
                shipping: shape.shipping,
                fulfillment,
                lines: shape.lines.map((amount, i) => ({ amount, madeToOrder: shape.custom[i] })),
              },
              { enabled: true, percent, scope },
            );
            expect(ts, `${scope} / ${fulfillment} / ${percent}% / ${shape.name}`).toBe(
              sql === null ? null : Number(sql),
            );
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBe(4 * 4 * 5 * 7);
  });
});
