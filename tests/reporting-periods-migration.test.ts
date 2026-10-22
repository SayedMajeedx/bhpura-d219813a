import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import migration from "../supabase/migrations/20261021150000_reporting_periods.sql?raw";

// The monthly statement's one request (migration 20261021150000): for each period it asks the
// overview's own five report functions and returns their answers as they are, in order. The five
// are stand-ins here that echo what they were asked, so the test sees exactly which bounds,
// time zone, store and "historical" switch each received. Run in a real Postgres.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;

const STAND_INS = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE FUNCTION public.rpc_reporting_overview(a timestamptz, b timestamptz, tz text, h boolean, s text)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_array(jsonb_build_object('fn','overview','from',a,'to',b,'tz',tz,'historical',h,'slug',s)) $$;
  CREATE FUNCTION public.rpc_reporting_processed_returns(a timestamptz, b timestamptz, tz text, s text)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_array(jsonb_build_object('fn','returns','from',a,'tz',tz,'slug',s)) $$;
  CREATE FUNCTION public.rpc_reporting_order_cogs(a timestamptz, b timestamptz, h boolean, s text)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_array(jsonb_build_object('fn','cogs','from',a,'historical',h)) $$;
  CREATE FUNCTION public.rpc_reporting_processing_fees(a timestamptz, b timestamptz, h boolean, s text)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_array(jsonb_build_object('fn','fees','from',a)) $$;
  CREATE FUNCTION public.rpc_reporting_incubator_sales(a timestamptz, b timestamptz, tz text, i text, s text)
    RETURNS jsonb LANGUAGE sql AS $$
      SELECT jsonb_build_object('summary', jsonb_build_array(jsonb_build_object('fn','incubator','interval',i)),
                                'timeseries', '[]'::jsonb) $$;
`;

const periods = (list: Array<[string, string]>) =>
  JSON.stringify(list.map(([from, to]) => ({ from, to })));
const call = async (list: Array<[string, string]>, historical = false) =>
  (
    await db.query<{ r: Array<Record<string, unknown>> }>(
      "SELECT public.rpc_reporting_periods($1::jsonb, 'Asia/Bahrain', $2, 'pura') AS r",
      [periods(list), historical],
    )
  ).rows[0].r;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STAND_INS);
  await db.exec(migration);
});

describe("several periods in one request", () => {
  it("asks the overview's own functions for each period, in order, as the caller asked", async () => {
    const result = await call(
      [
        ["2026-09-01T00:00:00+03:00", "2026-09-30T23:59:59.999+03:00"],
        ["2026-10-01T00:00:00+03:00", "2026-10-31T23:59:59.999+03:00"],
      ],
      true,
    );
    expect(result).toHaveLength(2);
    const [september, october] = result;
    expect(Date.parse(String(september.from))).toBe(Date.parse("2026-09-01T00:00:00+03:00"));
    expect(Date.parse(String(october.to))).toBe(Date.parse("2026-10-31T23:59:59.999+03:00"));
    const overview = (october.overview as Array<Record<string, unknown>>)[0];
    expect(overview).toMatchObject({
      fn: "overview",
      tz: "Asia/Bahrain",
      historical: true,
      slug: "pura",
    });
    expect(Date.parse(String(overview.from))).toBe(Date.parse("2026-10-01T00:00:00+03:00"));
    expect((october.returns as Array<Record<string, unknown>>)[0]).toMatchObject({ fn: "returns" });
    expect((october.cogs as Array<Record<string, unknown>>)[0]).toMatchObject({
      fn: "cogs",
      historical: true,
    });
    expect((october.fees as Array<Record<string, unknown>>)[0]).toMatchObject({ fn: "fees" });
    // Partner shops' figures: the summary only; their time series is not needed.
    expect(october.incubator_summary).toEqual([{ fn: "incubator", interval: "year" }]);
  });

  it("refuses no period, more than three years of months, or a period that ends before it starts", async () => {
    await expect(call([])).rejects.toThrow("INVALID_PERIODS");
    const many = Array.from({ length: 37 }, (): [string, string] => [
      "2026-01-01T00:00:00Z",
      "2026-01-31T00:00:00Z",
    ]);
    await expect(call(many)).rejects.toThrow("INVALID_PERIODS");
    await expect(call([["2026-02-01T00:00:00Z", "2026-01-01T00:00:00Z"]])).rejects.toThrow(
      "INVALID_PERIODS",
    );
  });

  it("runs with the caller's own rights, for signed-in staff only", async () => {
    const { rows } = await db.query<{ definer: boolean; anon: boolean; staff: boolean }>(
      `SELECT p.prosecdef AS definer,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS staff
         FROM pg_proc p WHERE p.proname = 'rpc_reporting_periods'`,
    );
    expect(rows[0]).toEqual({ definer: false, anon: false, staff: true });
  });
});
