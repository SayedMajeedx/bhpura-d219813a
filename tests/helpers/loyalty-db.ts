import { PGlite } from "@electric-sql/pglite";
import suite from "../../supabase/migrations/20260829102904_loyalty_and_abandoned_carts_suite.sql?raw";
import engine from "../../supabase/migrations/20261014110000_loyalty_points_follow_the_order.sql?raw";

/**
 * A real Postgres (PGlite) with the loyalty tables and engine as they are live (the suite's tables
 * and point calculation, then the engine of migration 20261014110000), the tables the bonuses read
 * (customers, orders, the review requests and reviews, the store's settings and promo codes) and
 * `auth.uid()` read from the setting `test.uid`. The migrations under test run after it, then the
 * store's programme is written (none when `program` is null).
 */
export const BRAND = "00000000-0000-4000-8000-0000000000b1";
export const PROMO = "00000000-0000-4000-8000-000000000011";

function suitePart(from: string, to: string) {
  const start = suite.indexOf(from);
  const end = suite.indexOf(to, start);
  if (start < 0 || end < 0) throw new Error(`suite part not found: ${from}`);
  return suite.slice(start, end);
}

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE SCHEMA cron;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql
    AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE cron.job (jobid serial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
  CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
    LANGUAGE sql AS $$ INSERT INTO cron.job (jobname, schedule, command) VALUES ($1, $2, $3) RETURNING jobid::bigint $$;
  CREATE FUNCTION cron.unschedule(job_name text) RETURNS boolean
    LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobname = $1 RETURNING true $$;
  CREATE TABLE public.brands (
    id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true, name_ar text, name_en text,
    slug text, logo_url text
  );
  CREATE TABLE public.customers (
    id uuid PRIMARY KEY, brand_id uuid, auth_user_id uuid, name text, phone text, email text
  );
  CREATE TABLE public.profiles (id uuid PRIMARY KEY);
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY, business_name text, logo_url text, whatsapp_number text,
    currency text, order_number_prefix text, order_number_digits smallint,
    review_reward_promo_id uuid
  );
  CREATE TABLE public.promo_codes (
    id uuid PRIMARY KEY, brand_id uuid, code text, discount_type text, discount_value numeric,
    is_active boolean, start_date timestamptz, end_date timestamptz, max_redemptions integer
  );
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY, brand_id uuid NOT NULL, customer_id uuid, invoice_number integer,
    status text, payment_status text DEFAULT 'unpaid', subtotal numeric NOT NULL DEFAULT 0,
    discount numeric NOT NULL DEFAULT 0, tax_amount numeric NOT NULL DEFAULT 0,
    shipping numeric NOT NULL DEFAULT 0, total numeric NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(), customer_name_snapshot text
  );
  CREATE TABLE public.order_review_requests (
    id uuid PRIMARY KEY, brand_id uuid NOT NULL, order_id uuid NOT NULL, public_token uuid NOT NULL,
    eligible_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'ready',
    completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.order_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
    brand_id uuid NOT NULL, order_id uuid NOT NULL, rating smallint NOT NULL,
    highlights text[] NOT NULL DEFAULT '{}', comment text, reward_code text,
    show_on_store boolean NOT NULL DEFAULT false
  );
  INSERT INTO public.brands (id, slug, name_ar) VALUES ('${BRAND}', 'pura', 'بيورا');
  INSERT INTO public.business_settings (brand_id, review_reward_promo_id) VALUES ('${BRAND}', '${PROMO}');
  INSERT INTO public.promo_codes VALUES
    ('${PROMO}', '${BRAND}', 'THANKS10', 'percentage', 10, true, NULL, NULL, NULL);
`;

export async function loyaltyDatabase(
  migrations: string[],
  program: Record<string, unknown> | null = {},
): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(
    suitePart(
      "CREATE TABLE IF NOT EXISTS public.brand_loyalty_programs",
      "-- 2. ABANDONED CARTS RECOVERY SCHEMAS",
    ) +
      suitePart(
        "CREATE OR REPLACE FUNCTION public.rpc_calculate_order_loyalty_points",
        "CREATE OR REPLACE FUNCTION public.rpc_award_order_loyalty_points",
      ),
  );
  await db.exec(engine);
  for (const migration of migrations) await db.exec(migration);
  if (program) {
    const settings = { holding_period_days: 0, first_order_bonus_points: 0, ...program };
    const cols = Object.keys(settings);
    await db.exec(
      `INSERT INTO public.brand_loyalty_programs (brand_id, ${cols.join(", ")})
       VALUES ('${BRAND}', ${cols.map((c) => `'${settings[c as keyof typeof settings]}'`).join(", ")})`,
    );
  }
  return db;
}
