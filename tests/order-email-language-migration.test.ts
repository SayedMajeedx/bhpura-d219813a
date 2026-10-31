import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import offers from "../supabase/migrations/20261027100000_store_offers.sql?raw";
import migration from "../supabase/migrations/20261109100000_order_email_language.sql?raw";

// Order emails in the shopper's language (migration 20261109100000), run in a real Postgres with
// the live order builder (place_storefront_order as 20261027100000 left it, its core stubbed as in
// tests/store-offers-migration.test.ts): the language checkout sends is kept on the order and on
// its "order placed" email, which is queued while the order is written; later emails read the
// order's language, a staff order the customer's last one, and English stays the fallback.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const ABAYA = "00000000-0000-4000-8000-00000000a001";
const ABAYA_2 = "00000000-0000-4000-8000-00000000a002";
const DRESS = "00000000-0000-4000-8000-00000000d001";
const SCARF = "00000000-0000-4000-8000-00000000f001";
const FOREIGN = "00000000-0000-4000-8000-00000000e001";
const SARA = "00000000-0000-4000-8000-0000000000c1";
const variantOf = (product: string) => product.replace(/(.{8})$/, (tail) => `9${tail.slice(1)}`);

const builderOf = (sql: string) => {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.place_storefront_order(p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text, p_notes text DEFAULT NULL::text, p_fulfillment",
  );
  const open = sql.indexOf("$function$", start);
  const end = sql.indexOf("$function$", open + 1);
  return start < 0 ? "" : sql.slice(start, end + "$function$".length);
};
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

const ADDED = `  -- ADDED (20261109100000): the language the shopper ordered in, so the order's emails (placed,
  -- payment approved, delivered) speak it; every one went out in English.
  PERFORM public.set_order_language(v_order_id, p_customer ->> 'lang');
`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
    CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, is_active boolean);
    INSERT INTO public.brands VALUES ('${BRAND}', 'store', true), ('${OTHER}', 'other', true);
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY,
      default_tax_rate numeric(5,2) NOT NULL DEFAULT 10, vat_inclusive boolean DEFAULT false,
      advance_allow_full_payment boolean DEFAULT true);
    INSERT INTO public.business_settings (brand_id) VALUES ('${BRAND}'), ('${OTHER}');
    CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid, category text);
    INSERT INTO public.products VALUES ('${ABAYA}', '${BRAND}', 'abayas'),
      ('${ABAYA_2}', '${BRAND}', 'abayas'), ('${DRESS}', '${BRAND}', 'dresses'),
      ('${SCARF}', '${BRAND}', NULL), ('${FOREIGN}', '${OTHER}', 'abayas');
    CREATE TABLE public.product_variants (id uuid PRIMARY KEY, brand_id uuid, product_id uuid,
      selling_price numeric(14,3), original_price numeric(14,3));
    INSERT INTO public.product_variants VALUES
      ('${variantOf(ABAYA)}', '${BRAND}', '${ABAYA}', 25, NULL),
      ('${variantOf(ABAYA_2)}', '${BRAND}', '${ABAYA_2}', 24, 30),
      ('${variantOf(DRESS)}', '${BRAND}', '${DRESS}', 8, NULL),
      ('${variantOf(SCARF)}', '${BRAND}', '${SCARF}', 5, NULL),
      ('${variantOf(FOREIGN)}', '${OTHER}', '${FOREIGN}', 99, NULL);
    CREATE TABLE public.pending_benefit_receipts (id uuid PRIMARY KEY, brand_id uuid,
      uploaded_at timestamptz, consumed_at timestamptz, expires_at timestamptz,
      public_url text, object_key text);
    CREATE TABLE public.idempotency_claims (brand_id uuid, idempotency_key text,
      request_hash text, order_id uuid, UNIQUE (brand_id, idempotency_key));
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, customer_id uuid,
      invoice_number integer, status text DEFAULT 'pending', payment_status text DEFAULT 'unpaid',
      subtotal numeric(14,3) NOT NULL DEFAULT 0, discount numeric(14,3) NOT NULL DEFAULT 0,
      shipping numeric(14,3) NOT NULL DEFAULT 0, tax_rate numeric(5,2) NOT NULL DEFAULT 0,
      tax_amount numeric(14,3) NOT NULL DEFAULT 0, total numeric(14,3) NOT NULL DEFAULT 0,
      promo_code text, promo_code_id uuid, idempotency_key text, request_hash text,
      advance_rules jsonb, destination_country text, delivery_address_snapshot jsonb,
      benefit_receipt_url text, benefit_receipt_key text,
      confirmation_email_token uuid DEFAULT gen_random_uuid());
    CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid REFERENCES public.orders(id), product_id uuid, variant_id uuid,
      quantity integer NOT NULL DEFAULT 1, line_total numeric(14,3) NOT NULL DEFAULT 0);
    CREATE TABLE public.customers (id uuid PRIMARY KEY, auth_user_id uuid);
    CREATE TABLE public.loyalty_accounts (brand_id uuid, customer_id uuid, current_tier_key text);
    CREATE TABLE public.brand_loyalty_tiers (brand_id uuid, tier_key text, free_shipping boolean);
    CREATE TABLE public.brand_loyalty_programs (brand_id uuid, is_enabled boolean);
    CREATE FUNCTION public.advance_full_payment_rules() RETURNS jsonb LANGUAGE sql
      AS $$ SELECT '[]'::jsonb $$;
    CREATE FUNCTION public.assign_order_pickup_partner(uuid, uuid) RETURNS void LANGUAGE sql
      AS $$ SELECT $$;
    CREATE FUNCTION public.set_order_requested_time(uuid, text, text) RETURNS void LANGUAGE sql
      AS $$ SELECT $$;
    -- The store's delivery fee: 2.000 wherever it goes.
    CREATE FUNCTION public.storefront_delivery_fee(uuid, text, text, integer) RETURNS numeric
      LANGUAGE sql AS $$ SELECT 2::numeric $$;
    -- A promo code is worth what the test says ('code_discount' in the customer).
    CREATE FUNCTION public.validate_promo_code(p_brand_slug text, p_code text, p_subtotal numeric,
      p_items jsonb DEFAULT NULL, p_customer_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql
      AS $$ SELECT CASE WHEN upper(p_code) = 'BAD' THEN jsonb_build_object('valid', false)
        ELSE jsonb_build_object('valid', true, 'discount_amount',
          least(p_subtotal, substring(p_code from '[0-9.]+')::numeric)) END $$;
    -- The order and its lines as the core builder leaves them: lines priced by the test, the
    -- promo code's discount applied.
    CREATE FUNCTION public.place_storefront_order_core(p_brand_slug text, p_customer jsonb,
      p_items jsonb, p_payment_method text, p_notes text, p_fulfillment text, p_branch_id uuid,
      p_digital_channel text, p_digital_contact text, p_promo_code text)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE v_id uuid; v_sub numeric; v_code numeric := 0;
    BEGIN
      SELECT COALESCE(sum((i->>'line_total')::numeric), 0) INTO v_sub
        FROM jsonb_array_elements(p_items) i;
      IF p_promo_code IS NOT NULL THEN
        v_code := (public.validate_promo_code(p_brand_slug, p_promo_code, v_sub) ->> 'discount_amount')::numeric;
      END IF;
      INSERT INTO public.orders (brand_id, subtotal, discount, promo_code, promo_code_id, total)
      VALUES ('${BRAND}', v_sub, v_code, p_promo_code,
        CASE WHEN p_promo_code IS NULL THEN NULL ELSE gen_random_uuid() END, v_sub - v_code)
      RETURNING id INTO v_id;
      INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, line_total)
      SELECT v_id, (i->>'product_id')::uuid, (i->>'variant_id')::uuid, (i->>'quantity')::int,
             (i->>'line_total')::numeric
        FROM jsonb_array_elements(p_items) i;
      RETURN jsonb_build_object('success', true, 'order_id', v_id, 'discount', v_code);
    END $$;
  `);
  // The email queue as 20260724200000 made it, and the trigger that fills it (20261012130000's,
  // its "order placed" branch: queued while the order is written).
  await db.exec(`
    CREATE TABLE public.order_email_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
      brand_id uuid NOT NULL,
      event_type text NOT NULL,
      language text NOT NULL DEFAULT 'en' CHECK (language IN ('ar', 'en')),
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (order_id, event_type));
    CREATE FUNCTION public.enqueue_order_email_event(p_order_id uuid, p_brand_id uuid,
      p_event_type text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
      AS $$ BEGIN
        INSERT INTO public.order_email_events (order_id, brand_id, event_type)
        VALUES (p_order_id, p_brand_id, p_event_type) ON CONFLICT (order_id, event_type) DO NOTHING;
      END $$;
    CREATE FUNCTION public.automate_order_email_events() RETURNS trigger LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public AS $$ BEGIN
        IF TG_OP = 'INSERT' THEN
          PERFORM public.enqueue_order_email_event(NEW.id, NEW.brand_id, 'order_placed');
        ELSIF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
          PERFORM public.enqueue_order_email_event(NEW.id, NEW.brand_id, 'order_delivered');
        END IF;
        RETURN NEW;
      END $$;
    CREATE TRIGGER trg_orders_email_events AFTER INSERT OR UPDATE ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.automate_order_email_events();
    ALTER TABLE public.orders ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  `);
  await db.exec(offers);
  await db.exec(migration);
});

/** An order placed through the real builder, with what checkout sends in p_customer. */
async function place(customer: Record<string, unknown>) {
  const items = [{ product_id: ABAYA, variant_id: variantOf(ABAYA), quantity: 1, line_total: 25 }];
  const result = await db.query<{ r: { order_id: string } }>(
    `SELECT public.place_storefront_order('store', $1::jsonb, $2::jsonb, 'cod', NULL,
       'delivery', NULL, NULL, NULL, NULL) AS r`,
    [JSON.stringify({ country_code: "BH", ...customer }), JSON.stringify(items)],
  );
  return result.rows[0].r.order_id;
}

const languageOf = async (order: string) =>
  (
    await db.query<{ language: string | null }>(
      "SELECT language FROM public.orders WHERE id = $1",
      [order],
    )
  ).rows[0].language;

const emails = async (order: string) =>
  (
    await db.query<{ event_type: string; language: string }>(
      "SELECT event_type, language FROM public.order_email_events WHERE order_id = $1 ORDER BY event_type",
      [order],
    )
  ).rows;

describe("the migration's order builder", () => {
  it("is the live one, with one statement added after the requested day and time", () => {
    const before = squash(builderOf(offers));
    const after = squash(builderOf(migration));
    expect(before).not.toBe("");
    expect(after).toContain(squash(ADDED));
    expect(after.replace(squash(ADDED), "").replace(/\s+/g, " ")).toBe(before);
  });
});

describe("an order placed on the storefront", () => {
  it("keeps the shopper's Arabic, and its 'order placed' email is in Arabic", async () => {
    const order = await place({ lang: "ar" });
    expect(await languageOf(order)).toBe("ar");
    expect(await emails(order)).toEqual([{ event_type: "order_placed", language: "ar" }]);
  });

  it("keeps English for a shopper reading in English", async () => {
    const order = await place({ lang: "en" });
    expect(await languageOf(order)).toBe("en");
    expect(await emails(order)).toEqual([{ event_type: "order_placed", language: "en" }]);
  });

  it("sends its later emails in the same language", async () => {
    const order = await place({ lang: "ar" });
    await db.query("UPDATE public.orders SET status = 'completed' WHERE id = $1", [order]);
    expect(await emails(order)).toEqual([
      { event_type: "order_delivered", language: "ar" },
      { event_type: "order_placed", language: "ar" },
    ]);
  });

  it("is left as it was when checkout sends no language, or one it does not know", async () => {
    for (const lang of [undefined, "fr", ""]) {
      const order = await place(lang === undefined ? {} : { lang });
      expect(await languageOf(order)).toBeNull();
      expect(await emails(order)).toEqual([{ event_type: "order_placed", language: "en" }]);
    }
  });
});

describe("an order with no language of its own (staff typed it in)", () => {
  it("takes the language of the customer's latest order that has one", async () => {
    await db.query(
      `INSERT INTO public.orders (brand_id, customer_id, language, created_at) VALUES
         ($1, $2, 'en', now() - interval '3 days'), ($1, $2, 'ar', now() - interval '1 day')`,
      [BRAND, SARA],
    );
    const staff = (
      await db.query<{ id: string }>(
        "INSERT INTO public.orders (brand_id, customer_id) VALUES ($1, $2) RETURNING id",
        [BRAND, SARA],
      )
    ).rows[0].id;
    expect(await emails(staff)).toEqual([{ event_type: "order_placed", language: "ar" }]);
  });

  it("never another store's customer record, and English when nothing is known", async () => {
    const elsewhere = (
      await db.query<{ id: string }>(
        "INSERT INTO public.orders (brand_id, customer_id) VALUES ($1, $2) RETURNING id",
        [OTHER, SARA],
      )
    ).rows[0].id;
    expect(await emails(elsewhere)).toEqual([{ event_type: "order_placed", language: "en" }]);
  });
});

describe("setting an order's language", () => {
  it("changes the emails still to go, never one already sent", async () => {
    const order = await place({});
    await db.query(
      "UPDATE public.order_email_events SET status = 'processed' WHERE order_id = $1",
      [order],
    );
    await db.query("UPDATE public.orders SET status = 'completed' WHERE id = $1", [order]);
    await db.query("SELECT public.set_order_language($1, 'ar')", [order]);
    expect(await emails(order)).toEqual([
      { event_type: "order_delivered", language: "ar" },
      { event_type: "order_placed", language: "en" },
    ]);
  });

  it("is for the server only", async () => {
    const { rows } = await db.query<{ fn: string; anon: boolean; auth: boolean }>(
      `SELECT f AS fn,
         has_function_privilege('anon', f, 'EXECUTE') AS anon,
         has_function_privilege('authenticated', f, 'EXECUTE') AS auth
       FROM unnest(ARRAY['public.set_order_language(uuid, text)',
         'public.order_email_language(uuid)',
         'public.enqueue_order_email_event(uuid, uuid, text)']) AS f`,
    );
    expect(rows.every((r) => !r.anon && !r.auth)).toBe(true);
  });
});
