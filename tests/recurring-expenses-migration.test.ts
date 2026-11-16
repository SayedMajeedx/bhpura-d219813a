import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261210100000_recurring_expenses.sql?raw";
import { datesDueBy, monthsText, recurringDate } from "../src/features/expenses/lib/recurring";

// A recurring expense repeats by itself (migration 20261210100000), run in a real Postgres
// (PGlite) on the expenses table as it stands live. The owner's report of 2026-11-16: Pura's
// partner shop rent, saved as monthly from August, stayed in August alone.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const USER = "00000000-0000-4000-8000-0000000000a1";
const RENT = "00000000-0000-4000-8000-0000000000e1";

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE TABLE public.expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL, brand_id uuid NOT NULL,
    category text NOT NULL, description text, amount numeric NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'BHD', expense_date date NOT NULL DEFAULT current_date,
    notes text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
    line_items jsonb, store_name text, receipt_time text, tax_amount numeric, tax_rate numeric,
    receipt_url text, expense_type text DEFAULT 'opex', is_recurring boolean DEFAULT false,
    recurrence_period text DEFAULT 'monthly', next_recurrence_date date, vendor_id uuid,
    quantity numeric, unit_type text, unit_cost numeric
  );
  -- As live: the rent saved as monthly on 18 Aug, and a one-off packaging purchase.
  INSERT INTO public.expenses (id, user_id, brand_id, category, description, amount, expense_date,
    expense_type, is_recurring, recurrence_period)
  VALUES ('${RENT}', '${USER}', '${BRAND}', 'Rent', 'ايجار حاضنة دار لولوة', 50, '2026-08-18',
    'opex', true, 'monthly'),
    (gen_random_uuid(), '${USER}', '${BRAND}', 'Packaging', 'اكياس', 3.1, '2026-08-16', 'cogs',
    false, 'monthly');
  SET boutq.today = '2026-11-16';
`;

let db: PGlite;
const copiesOf = async (id: string) =>
  (
    await db.query<{ expense_date: string; amount: string; is_recurring: boolean }>(
      "select to_char(expense_date, 'YYYY-MM-DD') as expense_date, amount, is_recurring from expenses where recurring_source_id = $1 order by expense_date",
      [id],
    )
  ).rows;
const run = (sql: string, params: unknown[] = []) => db.query(sql, params);
const today = (day: string) => db.exec(`SET boutq.today = '${day}'`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(migration);
});

describe("an expense that repeats every month", () => {
  it("fills the months since a template saved before the migration", async () => {
    const copies = await copiesOf(RENT);
    // Today is the 16th: November's rent falls on the 18th.
    expect(copies.map((c) => c.expense_date)).toEqual(["2026-09-18", "2026-10-18"]);
    expect(copies.every((c) => Number(c.amount) === 50 && c.is_recurring === false)).toBe(true);
    const template = (
      await run(
        "select recurring_generated, to_char(next_recurrence_date, 'YYYY-MM-DD') as next from expenses where id = $1",
        [RENT],
      )
    ).rows[0] as { recurring_generated: number; next: string };
    expect(template).toEqual({ recurring_generated: 2, next: "2026-11-18" });
  });

  it("writes the next month when its day comes, once", async () => {
    await today("2026-11-18");
    await run("select expenses_materialize_recurring()");
    await run("select expenses_materialize_recurring()");
    expect((await copiesOf(RENT)).map((c) => c.expense_date)).toEqual([
      "2026-09-18",
      "2026-10-18",
      "2026-11-18",
    ]);
  });

  it("fills an earlier month's months at once when saved, and keeps the 31st after a short month", async () => {
    await today("2026-05-01");
    const { rows } = await run(
      `insert into expenses (user_id, brand_id, category, amount, expense_date, is_recurring)
       values ($1, $2, 'Rent', 100, '2026-01-31', true) returning id`,
      [USER, BRAND],
    );
    const id = (rows[0] as { id: string }).id;
    expect((await copiesOf(id)).map((c) => c.expense_date)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("does not bring back a deleted copy, and stops when its repeat is turned off", async () => {
    await today("2026-11-18");
    await run(
      "delete from expenses where recurring_source_id = $1 and expense_date = '2026-10-18'",
      [RENT],
    );
    await run("update expenses set is_recurring = false where id = $1", [RENT]);
    await today("2027-01-20");
    await run("select expenses_materialize_recurring()");
    expect((await copiesOf(RENT)).map((c) => c.expense_date)).toEqual(["2026-09-18", "2026-11-18"]);
  });

  it("starts again from the next date to come, never filling the months it was off", async () => {
    await run("update expenses set is_recurring = true where id = $1", [RENT]);
    expect((await copiesOf(RENT)).map((c) => c.expense_date)).toEqual(["2026-09-18", "2026-11-18"]);
    await today("2027-02-18");
    await run("select expenses_materialize_recurring()");
    expect((await copiesOf(RENT)).map((c) => c.expense_date)).toEqual([
      "2026-09-18",
      "2026-11-18",
      "2027-02-18",
    ]);
  });

  it("repeats a yearly expense once a year, and never makes a copy a template", async () => {
    await today("2028-03-01");
    const { rows } = await run(
      `insert into expenses (user_id, brand_id, category, amount, expense_date, is_recurring, recurrence_period)
       values ($1, $2, 'Licence', 30, '2026-02-01', true, 'yearly') returning id`,
      [USER, BRAND],
    );
    const id = (rows[0] as { id: string }).id;
    expect((await copiesOf(id)).map((c) => c.expense_date)).toEqual(["2027-02-01", "2028-02-01"]);
    await run("update expenses set is_recurring = true where recurring_source_id = $1", [id]);
    expect((await copiesOf(id)).every((c) => c.is_recurring === false)).toBe(true);
    // A one-off expense is left alone.
    const oneOff = await run(
      "select count(*)::int as n from expenses where category = 'Packaging'",
    );
    expect((oneOff.rows[0] as { n: number }).n).toBe(1);
  });

  it("is written by the database alone: the browser cannot call it", async () => {
    const grants = await run(
      "select has_function_privilege('authenticated', 'public.expenses_materialize_recurring(uuid)', 'execute') as can",
    );
    expect((grants.rows[0] as { can: boolean }).can).toBe(false);
  });
});

describe("the screens' twin of the database's dates", () => {
  it("names the same day as Postgres for every start, period and step", async () => {
    const starts = [
      "2026-01-31",
      "2026-01-30",
      "2026-02-28",
      "2024-02-29",
      "2026-08-18",
      "2026-12-31",
    ];
    for (const start of starts) {
      for (const period of ["monthly", "yearly"]) {
        for (let step = 1; step <= 30; step++) {
          const { rows } = await run(
            "select to_char(expenses_recurring_date($1::date, $2, $3), 'YYYY-MM-DD') as day",
            [start, period, step],
          );
          expect(recurringDate(start, period, step)).toBe((rows[0] as { day: string }).day);
        }
      }
    }
  });

  it("says which months a save fills", () => {
    const dates = datesDueBy("2026-08-18", "monthly", "2026-11-16");
    expect(dates).toEqual(["2026-09-18", "2026-10-18"]);
    expect(monthsText(datesDueBy("2026-08-18", "monthly", "2026-11-20"), "en")).toBe(
      "Sep, Oct and Nov 2026",
    );
    expect(monthsText(dates, "ar")).toBe("سبتمبر وأكتوبر 2026");
  });
});
