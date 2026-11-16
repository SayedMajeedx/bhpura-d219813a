import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261211100000_expense_budgets.sql?raw";

// A monthly budget per expense category (migration 20261211100000), run in a real Postgres
// (PGlite) as a store's finance staff, a member without the permission, and a visitor.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PURA = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE TABLE public.brands (id uuid PRIMARY KEY);
  INSERT INTO public.brands VALUES ('${PURA}'), ('${OTHER}');
  -- The caller's rights, as the live function reads them: a test sets who is asking.
  CREATE FUNCTION public.can_view_brand_costs(_brand_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT current_setting('test.finance_brand', true) = _brand_id::text;
  $$;
  GRANT EXECUTE ON FUNCTION public.can_view_brand_costs(uuid) TO authenticated;
  GRANT USAGE ON SCHEMA public TO authenticated, anon;
`;

let db: PGlite;
const as = async (role: string, brand: string, sql: string) => {
  await db.exec(`SET test.finance_brand = '${brand}'; SET ROLE ${role};`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("RESET ROLE");
  }
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(migration);
});

describe("expense budgets", () => {
  it("are written and read by the store's finance staff only", async () => {
    await as(
      "authenticated",
      PURA,
      `insert into expense_budgets (brand_id, category, monthly_amount) values ('${PURA}', ' Rent ', 50)`,
    );
    const own = await as(
      "authenticated",
      PURA,
      "select category, monthly_amount from expense_budgets",
    );
    expect(own.rows).toEqual([{ category: "Rent", monthly_amount: "50.000" }]);
    const other = await as("authenticated", OTHER, "select * from expense_budgets");
    expect(other.rows).toEqual([]);
    await expect(
      as(
        "authenticated",
        OTHER,
        `insert into expense_budgets (brand_id, category, monthly_amount) values ('${PURA}', 'Ads', 10)`,
      ),
    ).rejects.toThrow();
    await expect(as("anon", PURA, "select * from expense_budgets")).rejects.toThrow();
  });

  it("keep one budget per category, and only a positive amount", async () => {
    await expect(
      as(
        "authenticated",
        PURA,
        `insert into expense_budgets (brand_id, category, monthly_amount) values ('${PURA}', 'rent', 60)`,
      ),
    ).rejects.toThrow();
    await expect(
      as(
        "authenticated",
        PURA,
        `insert into expense_budgets (brand_id, category, monthly_amount) values ('${PURA}', 'Ads', 0)`,
      ),
    ).rejects.toThrow();
  });
});
