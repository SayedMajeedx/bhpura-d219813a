import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261013140000_public_writes_are_bounded.sql?raw";

// Two tables let a visitor insert any row at all (migration 20261013140000). Run in a real
// Postgres (PGlite) with the tables, grants and policies as they are live, then written to as a
// visitor: a request to open a store can no longer be written from a browser, and a shared cart
// must look like one.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  CREATE TABLE public.tenant_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_name text NOT NULL, email text,
    status text NOT NULL DEFAULT 'pending', payment_status text, created_at timestamptz DEFAULT now()
  );
  ALTER TABLE public.tenant_requests ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow public insert to tenant_requests" ON public.tenant_requests
    FOR INSERT TO public WITH CHECK (true);
  CREATE POLICY "Super admins read tenant requests" ON public.tenant_requests
    FOR SELECT TO authenticated USING (current_setting('test.super_admin', true) = 'yes');
  CREATE POLICY "Super admins update tenant requests" ON public.tenant_requests
    FOR UPDATE TO authenticated USING (current_setting('test.super_admin', true) = 'yes');
  GRANT INSERT, TRUNCATE ON public.tenant_requests TO anon;
  GRANT ALL ON public.tenant_requests TO authenticated, service_role;

  CREATE TABLE public.shared_carts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, brand_id uuid,
    brand_slug text NOT NULL, items jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
  );
  ALTER TABLE public.shared_carts ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow public insert shared_carts" ON public.shared_carts
    FOR INSERT TO public WITH CHECK (true);
  GRANT ALL ON public.shared_carts TO anon, authenticated, service_role;
  CREATE FUNCTION public.get_shared_cart_by_code(_code text) RETURNS SETOF public.shared_carts
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
      SELECT * FROM public.shared_carts
      WHERE code = _code AND (expires_at IS NULL OR expires_at > now()) LIMIT 1;
    $$;

  -- Stand-ins for the scheduler.
  CREATE SCHEMA cron;
  CREATE TABLE cron.job (jobid serial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
  CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
    LANGUAGE sql AS $$ INSERT INTO cron.job (jobname, schedule, command) VALUES ($1, $2, $3) RETURNING jobid::bigint $$;
  CREATE FUNCTION cron.unschedule(job_name text) RETURNS boolean
    LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobname = $1 RETURNING true $$;
`;

let db: PGlite;

/** Runs one statement as a role, and says how the database answered. */
async function as(
  role: "anon" | "authenticated" | "service_role",
  sql: string,
  params?: unknown[],
) {
  await db.exec(`SET ROLE ${role}`);
  try {
    return { rows: (await db.query<Record<string, unknown>>(sql, params)).rows, error: null };
  } catch (error) {
    return { rows: [], error: (error as Error).message };
  } finally {
    await db.exec("RESET ROLE");
  }
}

const line = { product_id: "p1", name: "Abaya", price: 25, qty: 1 };
const share = (code: string, items: unknown, slug = "store") =>
  as(
    "anon",
    "INSERT INTO public.shared_carts (code, brand_id, brand_slug, items) VALUES ($1, NULL, $2, $3::jsonb)",
    [code, slug, JSON.stringify(items)],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  // A link made before the migration, already past its date.
  await db.exec(`
    INSERT INTO public.shared_carts (code, brand_slug, items, created_at, expires_at)
    VALUES ('old222', 'store', '[{"product_id":"p0"}]', now() - interval '100 days', now() - interval '10 days');
  `);
  await db.exec(migration);
});

describe("a request to open a store", () => {
  it("cannot be written from a browser, by a visitor or by someone signed in", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      const reply = await as(
        role,
        "INSERT INTO public.tenant_requests (store_name, status, payment_status) VALUES ('x', 'approved', 'paid')",
      );
      expect(reply.error).toMatch(/permission denied/);
    }
    expect((await db.query("SELECT 1 FROM public.tenant_requests")).rows).toHaveLength(0);
  });

  it("is still written by the server, and read and decided by a super admin", async () => {
    const saved = await as(
      "service_role",
      "INSERT INTO public.tenant_requests (store_name) VALUES ('New store')",
    );
    expect(saved.error).toBeNull();

    await db.exec("SET test.super_admin = 'yes'");
    expect(
      (await as("authenticated", "SELECT store_name FROM public.tenant_requests")).rows,
    ).toEqual([{ store_name: "New store" }]);
    const decided = await as(
      "authenticated",
      "UPDATE public.tenant_requests SET status = 'approved' RETURNING status",
    );
    expect(decided.rows).toEqual([{ status: "approved" }]);
    await db.exec("RESET test.super_admin");
  });
});

describe("a shared cart", () => {
  it("is saved by a visitor as the storefront sends it, and opened by its code", async () => {
    expect((await share("abc234", [line, line])).error).toBeNull();
    const opened = await as("anon", "SELECT * FROM public.get_shared_cart_by_code('abc234')");
    expect(opened.rows).toHaveLength(1);
    expect(opened.rows[0].items).toEqual([line, line]);
    // The expiry is the table's own: ninety days from now.
    const days = await db.query<{ days: number }>(
      "SELECT round(extract(epoch FROM expires_at - created_at) / 86400)::int AS days FROM public.shared_carts WHERE code = 'abc234'",
    );
    expect(days.rows[0].days).toBe(90);
  });

  it("is refused when it is not a cart", async () => {
    const tooMany = Array.from({ length: 101 }, () => line);
    const tooBig = [{ ...line, name: "x".repeat(300_000) }];
    expect((await share("abc235", [])).error).toMatch(/shared_carts_items_bounded/);
    expect((await share("abc236", { not: "a list" })).error).toMatch(/shared_carts_items_bounded/);
    expect((await share("abc237", tooMany)).error).toMatch(/shared_carts_items_bounded/);
    expect((await share("abc238", tooBig)).error).toMatch(/shared_carts_items_bounded/);
    expect((await share("AB", [line])).error).toMatch(/shared_carts_code_shape/);
    expect((await share("abc23!", [line])).error).toMatch(/shared_carts_code_shape/);
    expect((await share("abc239", [line], "s".repeat(81))).error).toMatch(
      /shared_carts_slug_bounded/,
    );
    // A full cart of a hundred ordinary lines is still a cart.
    expect((await share("abc240", tooMany.slice(0, 100))).error).toBeNull();
  });

  it("cannot be given a date of its own, read, changed or deleted by a visitor", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      const forever = await as(
        role,
        `INSERT INTO public.shared_carts (code, brand_slug, items, expires_at)
         VALUES ('never22', 'store', '[{"product_id":"p1"}]', now() + interval '50 years')`,
      );
      expect(forever.error).toMatch(/permission denied/);
      for (const sql of [
        "SELECT code FROM public.shared_carts",
        "UPDATE public.shared_carts SET items = '[]'",
        "DELETE FROM public.shared_carts",
      ]) {
        expect((await as(role, sql)).error).toMatch(/permission denied/);
      }
    }
  });
});

describe("links past their date", () => {
  it("are removed by the nightly job, which only the scheduler can run", async () => {
    const job = await db.query<{ schedule: string; command: string }>(
      "SELECT schedule, command FROM cron.job WHERE jobname = 'shared_carts_cleanup_nightly'",
    );
    expect(job.rows).toHaveLength(1);
    expect(job.rows[0].schedule).toBe("23 3 * * *");

    for (const role of ["anon", "authenticated"] as const) {
      expect((await as(role, "SELECT public.delete_expired_shared_carts()")).error).toMatch(
        /permission denied/,
      );
    }
    const before = await db.query("SELECT 1 FROM public.shared_carts WHERE code = 'old222'");
    expect(before.rows).toHaveLength(1);
    // Run as the scheduler runs it.
    const ran = await db.query<{ deleted: number }>(
      job.rows[0].command.replace("SELECT", "SELECT (").replace(";", ") AS deleted"),
    );
    expect(ran.rows[0].deleted).toBe(1);
    const left = await db.query<{ code: string }>("SELECT code FROM public.shared_carts");
    expect(left.rows.map((row) => row.code).sort()).toEqual(["abc234", "abc240"]);
  });

  it("applying the migration again changes nothing", async () => {
    await db.exec(migration);
    const jobs = await db.query(
      "SELECT 1 FROM cron.job WHERE jobname = 'shared_carts_cleanup_nightly'",
    );
    expect(jobs.rows).toHaveLength(1);
    expect((await share("abc241", [line])).error).toBeNull();
  });
});
