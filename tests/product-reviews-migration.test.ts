import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261022100000_product_reviews_on_store.sql?raw";

// Reviews on each product's page (migration 20261022100000), run in a real Postgres (PGlite) on
// the live review functions: every review of an order that held the product counts in its
// stars; a review's words, with the first name only, show when the customer agreed and the store
// did not hide them; hiding never moves the stars; and only the store's staff who may manage
// customers can hide. The reviews given before the form asked are shown (the owner's decision).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const STORE = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const ABAYA = "00000000-0000-4000-8000-0000000000a1";
const KAFTAN = "00000000-0000-4000-8000-0000000000a2";
const HIDDEN_PRODUCT = "00000000-0000-4000-8000-0000000000a3";
const STAFF = "00000000-0000-4000-8000-0000000000f1";
const CLERK = "00000000-0000-4000-8000-0000000000f2";
const OUTSIDER = "00000000-0000-4000-8000-0000000000f3";

const order = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
const request = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`;
const token = (n: number) => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`;

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  -- Staff of STORE are STAFF and CLERK; only STAFF may manage customers.
  CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT auth.uid() IN ('${STAFF}', '${CLERK}') AND b = '${STORE}' $$;
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT auth.uid() = '${STAFF}' $$;

  CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY, brand_id uuid NOT NULL, invoice_number integer,
    customer_name_snapshot text, customer_phone_snapshot text
  );
  CREATE TABLE public.order_items (order_id uuid NOT NULL, product_id uuid);
  CREATE TABLE public.order_review_requests (
    id uuid PRIMARY KEY, brand_id uuid NOT NULL, order_id uuid NOT NULL, public_token uuid UNIQUE,
    eligible_at timestamptz NOT NULL DEFAULT now() - interval '1 day', status text,
    completed_at timestamptz, sent_at timestamptz, updated_at timestamptz
  );
  CREATE TABLE public.order_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
    brand_id uuid NOT NULL, order_id uuid NOT NULL, rating smallint NOT NULL,
    highlights text[] NOT NULL DEFAULT '{}', comment text,
    reward_code text NOT NULL DEFAULT 'THANKU10', created_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO public.brands VALUES ('${STORE}', 'pura', true), ('${OTHER}', 'other', true);
  INSERT INTO public.products VALUES ('${ABAYA}', '${STORE}', true), ('${KAFTAN}', '${STORE}', true),
    ('${HIDDEN_PRODUCT}', '${STORE}', false);
`;

// The two functions as they were live (pg_get_functiondef, 2026-10-22).
const LIVE = `
CREATE OR REPLACE FUNCTION public.submit_public_order_review(p_token uuid, p_rating integer, p_highlights text[] DEFAULT '{}'::text[], p_comment text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.order_review_requests%ROWTYPE;
  v_allowed text[] := ARRAY['quality','packaging','speed','delivery','service'];
BEGIN
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_RATING'; END IF;
  IF char_length(COALESCE(p_comment, '')) > 600 THEN RAISE EXCEPTION 'COMMENT_TOO_LONG'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_highlights, '{}')) h WHERE NOT h = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'INVALID_HIGHLIGHT';
  END IF;
  SELECT * INTO v_request FROM public.order_review_requests
  WHERE public_token = p_token AND eligible_at <= now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
  INSERT INTO public.order_reviews (request_id, brand_id, order_id, rating, highlights, comment)
  VALUES (v_request.id, v_request.brand_id, v_request.order_id, p_rating,
    COALESCE(p_highlights, '{}'), NULLIF(trim(p_comment), ''))
  ON CONFLICT (request_id) DO NOTHING;
  UPDATE public.order_review_requests SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
  WHERE id = v_request.id;
  RETURN 'THANKU10';
END;
$function$;
GRANT EXECUTE ON FUNCTION public.submit_public_order_review(uuid, integer, text[], text) TO anon, authenticated;
`;

let db: PGlite;

/** An order of `product` by `name`, with a review request that can be answered now. */
async function orderOf(n: number, product: string, name: string, brand = STORE) {
  await db.exec(`
    INSERT INTO public.orders VALUES ('${order(n)}', '${brand}', ${n}, '${name}', '+97333000${n}');
    INSERT INTO public.order_items VALUES ('${order(n)}', '${product}');
    INSERT INTO public.order_review_requests (id, brand_id, order_id, public_token)
      VALUES ('${request(n)}', '${brand}', '${order(n)}', '${token(n)}');
  `);
}

async function as<T>(role: string, uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`SET test.uid = '${uid ?? ""}'; SET ROLE ${role};`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("RESET ROLE;");
  }
}

type Reviews = {
  count: number;
  average: number;
  stars: Record<string, number>;
  highlights: Record<string, number>;
  reviews: Array<{ id: string; rating: number; comment: string | null; name: string | null }>;
};
const productReviews = async (product: string, slug = "pura") =>
  (
    await as<{ r: Reviews | null }>(
      "anon",
      null,
      "SELECT public.storefront_product_reviews($1, $2) AS r",
      [slug, product],
    )
  )[0].r;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(LIVE);
  // A review given before the form asked whether it may be shown.
  await orderOf(1, ABAYA, "Fatima Ali");
  await as(
    "anon",
    null,
    "SELECT public.submit_public_order_review($1, 5, '{quality}', 'Beautiful cut')",
    [token(1)],
  );
  await db.exec(migration);
});

describe("reviews on each product's page", () => {
  it("shows a review given before the form asked, as the owner decided", async () => {
    const reviews = await productReviews(ABAYA);
    expect(reviews?.reviews).toEqual([
      expect.objectContaining({ rating: 5, comment: "Beautiful cut", name: "Fatima" }),
    ]);
  });

  it("shows a new review's words only when the customer agreed, and counts every review", async () => {
    await orderOf(2, ABAYA, "Noor Hassan");
    await orderOf(3, ABAYA, "Sara");
    await as(
      "anon",
      null,
      "SELECT public.submit_public_order_review($1, 4, '{quality,delivery}', 'Fast', true)",
      [token(2)],
    );
    // The page before this change sends no answer: the review stays private.
    await as("anon", null, "SELECT public.submit_public_order_review($1, 2, '{}', 'Too long')", [
      token(3),
    ]);
    const reviews = await productReviews(ABAYA);
    expect(reviews?.count).toBe(3);
    expect(reviews?.average).toBe(3.7);
    expect(reviews?.stars).toMatchObject({ "2": 1, "4": 1, "5": 1 });
    expect(reviews?.highlights).toEqual({ quality: 2, delivery: 1 });
    expect(reviews?.reviews.map((review) => review.comment)).toEqual(["Fast", "Beautiful cut"]);
    // Only the first name leaves the database.
    expect(JSON.stringify(reviews)).not.toMatch(/Hassan|\+973/);
  });

  it("keeps a product's reviews to the orders that held it, in its own store", async () => {
    await orderOf(4, KAFTAN, "Mona");
    await as(
      "anon",
      null,
      "SELECT public.submit_public_order_review($1, 5, '{}', 'Lovely', true)",
      [token(4)],
    );
    expect((await productReviews(KAFTAN))?.count).toBe(1);
    expect((await productReviews(ABAYA))?.count).toBe(3);
    expect(await productReviews(ABAYA, "other")).toBeNull();
    expect(await productReviews(HIDDEN_PRODUCT)).toBeNull();
  });

  it("lets the store's staff who manage customers hide a review's words, never its stars", async () => {
    const [{ id }] = (
      await db.query<{ id: string }>("SELECT id FROM public.order_reviews WHERE request_id = $1", [
        request(2),
      ])
    ).rows;
    await expect(
      as("authenticated", CLERK, "SELECT public.set_order_review_hidden($1, true)", [id]),
    ).rejects.toThrow("NOT_AUTHORIZED");
    await expect(
      as("authenticated", OUTSIDER, "SELECT public.set_order_review_hidden($1, true)", [id]),
    ).rejects.toThrow("NOT_AUTHORIZED");
    await expect(
      as("anon", null, "SELECT public.set_order_review_hidden($1, true)", [id]),
    ).rejects.toThrow(/permission denied/);

    await as("authenticated", STAFF, "SELECT public.set_order_review_hidden($1, true)", [id]);
    const hidden = await productReviews(ABAYA);
    expect(hidden?.reviews.map((review) => review.comment)).toEqual(["Beautiful cut"]);
    expect(hidden?.count).toBe(3);
    expect(hidden?.average).toBe(3.7);
    const [row] = (
      await db.query<{ hidden_by: string }>(
        "SELECT hidden_by FROM public.order_reviews WHERE id = $1",
        [id],
      )
    ).rows;
    expect(row.hidden_by).toBe(STAFF);

    await as("authenticated", STAFF, "SELECT public.set_order_review_hidden($1, false)", [id]);
    expect((await productReviews(ABAYA))?.reviews).toHaveLength(2);
  });

  it("tells the Reviews page whether each review may be shown and whether it is hidden", async () => {
    const rows = await as<{
      customer_name: string;
      show_on_store: boolean;
      hidden_at: string | null;
    }>(
      "authenticated",
      STAFF,
      "SELECT customer_name, show_on_store, hidden_at FROM public.list_brand_order_reviews($1) ORDER BY customer_name",
      [STORE],
    );
    expect(rows.map((row) => [row.customer_name, row.show_on_store])).toEqual([
      ["Fatima Ali", true],
      ["Mona", true],
      ["Noor Hassan", true],
      ["Sara", false],
    ]);
    await expect(
      as("anon", null, "SELECT * FROM public.list_brand_order_reviews($1)", [STORE]),
    ).rejects.toThrow(/permission denied/);
  });
});
