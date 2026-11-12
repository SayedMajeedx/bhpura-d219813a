import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import offers from "../supabase/migrations/20261027100000_store_offers.sql?raw";
import language from "../supabase/migrations/20261109100000_order_email_language.sql?raw";
import migration from "../supabase/migrations/20261202100000_gift_orders.sql?raw";
import addonsMigration from "../supabase/migrations/20261203100000_gift_addons.sql?raw";
import staffSide from "../supabase/migrations/20261204100000_gift_staff_side.sql?raw";

// A gift order by the store's own settings (migration 20261202100000), run in a real Postgres
// with the live order builder (place_storefront_order as 20261109100000 left it, its core stubbed
// as in tests/order-email-language-migration.test.ts): a store that set nothing behaves as before
// (gift orders on, a free card), a priced card is a line of the order at the store's price, taxed
// and never discounted by a code, and the store's switches are held by the database.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const ABAYA = "00000000-0000-4000-8000-00000000a001";
const ABAYA_2 = "00000000-0000-4000-8000-00000000a002";
const DRESS = "00000000-0000-4000-8000-00000000d001";
const SCARF = "00000000-0000-4000-8000-00000000f001";
const FOREIGN = "00000000-0000-4000-8000-00000000e001";
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

const ADDED = `  -- ADDED (20261202100000): a gift order's details and its message card, at the store's own
  -- price, written after the code and the offers (neither reaches it) and before the tax, which
  -- the order's subtotal is read again for.
  PERFORM public.apply_order_gift(v_order_id, p_customer -> 'gift');
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
  // What the gift's line and details are written to, as the live tables have them.
  await db.exec(`
    ALTER TABLE public.orders ADD COLUMN user_id uuid, ADD COLUMN payment_method text;
    ALTER TABLE public.order_items ADD COLUMN brand_id uuid, ADD COLUMN user_id uuid,
      ADD COLUMN description text, ADD COLUMN name_en text, ADD COLUMN name_ar text,
      ADD COLUMN unit_price numeric(14,3) NOT NULL DEFAULT 0,
      ADD COLUMN location text NOT NULL DEFAULT 'main';
    -- The core builder writes the method the shopper chose.
    CREATE FUNCTION public.note_payment_method() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.payment_method := current_setting('test.method', true); RETURN NEW; END $$;
    CREATE TRIGGER trg_note_method BEFORE INSERT ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.note_payment_method();
  `);
  await db.exec(offers);
  await db.exec(language);
  await db.exec(migration);
  await db.exec(addonsMigration);
  // Step three's tables: a line's cost, and who may see the store's costs (as the test says).
  await db.exec(`
    ALTER TABLE public.order_items ADD COLUMN unit_cost numeric(14,3);
    CREATE FUNCTION public.can_view_brand_costs(uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT coalesce(current_setting('test.finance', true), 'yes') = 'yes' $$;
    CREATE FUNCTION public.order_counts_as_sold(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.reporting_counts_order(text, boolean) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.reporting_brand_id(text) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  `);
  await db.exec(staffSide);
});

const staff = (sql: string, params: unknown[] = []) => db.query(sql, params);

/** An order of one 25.000 abaya placed through the real builder, with what checkout sends. */
async function place(
  gift: Record<string, unknown> | null,
  options: { method?: string; promo?: string | null; store?: string } = {},
) {
  const method = options.method ?? "cod";
  await db.exec(`SET test.method = '${method}'`);
  const items = [{ product_id: ABAYA, variant_id: variantOf(ABAYA), quantity: 1, line_total: 25 }];
  try {
    const result = await db.query<{ r: { order_id: string; total: number } }>(
      `SELECT public.place_storefront_order($1, $2::jsonb, $3::jsonb, $4, NULL,
         'pickup', NULL, NULL, NULL, $5) AS r`,
      [
        options.store ?? "store",
        JSON.stringify({ ...(gift ? { gift } : {}) }),
        JSON.stringify(items),
        method,
        options.promo ?? null,
      ],
    );
    return { id: result.rows[0].r.order_id, total: Number(result.rows[0].r.total), error: null };
  } catch (error) {
    return { id: "", total: 0, error: (error as Error).message };
  }
}

const orderOf = async (id: string) =>
  (
    await db.query<Record<string, unknown>>(
      `SELECT subtotal::float AS subtotal, discount::float AS discount,
              tax_amount::float AS tax, total::float AS total, gift
         FROM public.orders WHERE id = $1`,
      [id],
    )
  ).rows[0];

const linesOf = async (id: string) =>
  (
    await db.query<Record<string, unknown>>(
      `SELECT name_en, name_ar, product_id, variant_id, quantity, unit_price::float AS unit_price,
              line_total::float AS line_total, location
         FROM public.order_items WHERE order_id = $1 AND product_id IS NULL`,
      [id],
    )
  ).rows;

const settings = (enabled: boolean, card: boolean, price: number, prepaid: boolean) =>
  staff("SELECT public.set_gift_order_settings($1, $2, $3, $4, $5)", [
    BRAND,
    enabled,
    card,
    price,
    prepaid,
  ]);

describe("the migration's order builder", () => {
  it("is the live one, with one statement added before the tax", () => {
    const before = squash(builderOf(language));
    const after = squash(builderOf(migration));
    expect(before).not.toBe("");
    expect(after).toContain(squash(ADDED));
    expect(after.replace(squash(ADDED), "").replace(/\s+/g, " ")).toBe(before);
  });
});

describe("a store that set nothing", () => {
  it("offers gift orders with a free card, to a visitor too", async () => {
    const { rows } = await db.query<{ r: unknown }>(
      "SELECT public.storefront_gift_order_options('store') AS r",
    );
    expect(rows[0].r).toEqual({ enabled: true, card: true, card_price: 0, prepaid: false });
    const none = await db.query<{ r: unknown }>(
      "SELECT public.storefront_gift_order_options('nowhere') AS r",
    );
    expect(none.rows[0].r).toBeNull();
  });

  it("keeps a gift order's details on the order and charges nothing for the card", async () => {
    const plain = await place(null);
    const gift = await place({
      recipient: "  Noor  ",
      message: "Eid Mubarak",
      from: "Sara",
      card: true,
      design: "type:cream",
    });
    expect(gift.error).toBeNull();
    expect(gift.total).toBe(plain.total);
    expect(await linesOf(gift.id)).toEqual([]);
    expect((await orderOf(gift.id)).gift).toEqual({
      recipient: "Noor",
      message: "Eid Mubarak",
      from: "Sara",
      card: true,
      card_price: 0,
      design: "type:cream",
    });
    // An order that is not a gift carries nothing.
    expect((await orderOf(plain.id)).gift).toBeNull();
  });
});

describe("a store that prices its gift message card", () => {
  it("adds the card as a line at the store's price, taxed, whatever the browser says", async () => {
    await settings(true, true, 1.5, false);
    const plain = await place(null);
    const gift = await place({ recipient: "Noor", card: true, card_price: 0, price: 0 });
    expect(await linesOf(gift.id)).toEqual([
      {
        name_en: "Gift message card",
        name_ar: "بطاقة إهداء",
        product_id: null,
        variant_id: null,
        quantity: 1,
        unit_price: 1.5,
        line_total: 1.5,
        location: "main",
      },
    ]);
    const order = await orderOf(gift.id);
    expect(order.subtotal).toBe(26.5);
    // 10% VAT on the card as on the piece.
    expect(order.tax).toBeCloseTo(2.65, 3);
    expect(gift.total).toBeCloseTo(plain.total + 1.65, 3);
    expect(order.gift).toMatchObject({ card: true, card_price: 1.5 });
  });

  it("charges nothing for a gift sent without the card, and keeps no message", async () => {
    const plain = await place(null);
    const gift = await place({ recipient: "Noor", message: "kept only with a card", card: false });
    expect(gift.total).toBe(plain.total);
    expect(await linesOf(gift.id)).toEqual([]);
    expect((await orderOf(gift.id)).gift).toEqual({
      recipient: "Noor",
      card: false,
      card_price: 0,
    });
  });

  it("never lets a promo code take anything off the card", async () => {
    const coded = await place(null, { promo: "OFF5" });
    const gift = await place({ card: true }, { promo: "OFF5" });
    const [a, b] = [await orderOf(coded.id), await orderOf(gift.id)];
    expect(b.discount).toBe(a.discount);
    expect(b.subtotal).toBe((a.subtotal as number) + 1.5);
  });

  it("drops a design that is not one of the cards'", async () => {
    const gift = await place({ card: true, design: "<script>" });
    const kept = (await orderOf(gift.id)).gift as Record<string, unknown>;
    expect(kept).toMatchObject({ card: true, card_price: 1.5 });
    expect(kept.design).toBeUndefined();
    // The details name the line that charges the card.
    expect(kept.card_item_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("the store's switches", () => {
  it("refuse a cash gift order when gifts are paid first, and take a paid one", async () => {
    await settings(true, true, 1.5, true);
    expect((await place({ card: true }, { method: "cod" })).error).toMatch(/GIFT_ORDER_PREPAID/);
    expect((await place({ card: true }, { method: "card" })).error).toBeNull();
    // An order that is not a gift is paid as the store allows.
    expect((await place(null, { method: "cod" })).error).toBeNull();
  });

  it("refuse a card the store does not offer, and a gift when gifts are off", async () => {
    await settings(true, false, 1.5, false);
    expect((await place({ card: true })).error).toMatch(/GIFT_MESSAGE_CARD_NOT_OFFERED/);
    expect((await place({ recipient: "Noor", card: false })).error).toBeNull();
    await settings(false, true, 1.5, false);
    expect((await place({ recipient: "Noor" })).error).toMatch(/GIFT_ORDER_NOT_OFFERED/);
    expect((await place(null)).error).toBeNull();
    await settings(true, true, 0, false);
  });

  it("are set by settings staff only, within bounds", async () => {
    await db.exec(
      "CREATE OR REPLACE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$",
    );
    await expect(settings(true, true, 2, false)).rejects.toThrow(/FORBIDDEN/);
    await db.exec(
      "CREATE OR REPLACE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$",
    );
    await expect(settings(true, true, -1, false)).rejects.toThrow(/GIFT_CARD_PRICE_INVALID/);
    await expect(settings(true, true, 5000, false)).rejects.toThrow(/GIFT_CARD_PRICE_INVALID/);
  });

  it("leave the builder's helpers to the server", async () => {
    for (const fn of ["apply_order_gift(uuid, jsonb)", "gift_order_options(uuid)"]) {
      const { rows } = await db.query<{ anon: boolean; user: boolean }>(
        `SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE') AS anon,
                has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') AS "user"`,
      );
      expect(rows[0]).toEqual({ anon: false, user: false });
    }
  });
});

// Step two (migration 20261203100000): the store's add-ons, a bouquet among them, each priced by
// the store and written as its own line of a gift order; a code never reaches them.
const addon = async (
  fields: Partial<{
    id: string | null;
    name_ar: string;
    name_en: string;
    price: number;
    available: boolean;
    brand: string;
  }> = {},
) => {
  const { rows } = await db.query<{ id: string }>(
    "SELECT (public.save_gift_addon($1, $3, $4, NULL, NULL, $5, $6, $7, 0, $2)).id AS id",
    [
      fields.brand ?? BRAND,
      fields.id ?? null,
      fields.name_ar ?? "باقة ورد",
      fields.name_en ?? "Flower bouquet",
      "https://media.boutq.store/brands/b1/product/rose.jpg",
      fields.price ?? 12,
      fields.available ?? true,
    ],
  );
  return rows[0].id;
};

const shown = async (slug = "store") =>
  (
    await db.query<{ r: Array<Record<string, unknown>> }>(
      "SELECT public.storefront_gift_addons($1) AS r",
      [slug],
    )
  ).rows[0].r;

describe("the store's add-ons", () => {
  it("are shown to a visitor while available, by the store's price and words", async () => {
    await settings(true, true, 0, false);
    const rose = await addon();
    const hidden = await addon({ name_en: "Chocolates", name_ar: "شوكولاتة", available: false });
    const list = await shown();
    expect(list.map((a) => a.id)).toContain(rose);
    expect(list.map((a) => a.id)).not.toContain(hidden);
    expect(list.find((a) => a.id === rose)).toMatchObject({
      name_ar: "باقة ورد",
      name_en: "Flower bouquet",
      price: 12,
      image_url: "https://media.boutq.store/brands/b1/product/rose.jpg",
    });
    // None while the store takes no gift orders.
    await settings(false, true, 0, false);
    expect(await shown()).toEqual([]);
    await settings(true, true, 0, false);
  });

  it("are a line each of a gift order at the store's price, taxed, and named on the gift", async () => {
    const rose = await addon({ price: 12 });
    const plain = await place(null);
    const gift = await place({ recipient: "Noor", addons: [{ id: rose, quantity: 2, price: 0 }] });
    expect(gift.error).toBeNull();
    const lines = await db.query<Record<string, unknown>>(
      `SELECT name_en, name_ar, quantity, unit_price::float AS unit_price,
              line_total::float AS line_total, product_id, variant_id
         FROM public.order_items WHERE order_id = $1 AND product_id IS NULL`,
      [gift.id],
    );
    expect(lines.rows).toEqual([
      {
        name_en: "Flower bouquet",
        name_ar: "باقة ورد",
        quantity: 2,
        unit_price: 12,
        line_total: 24,
        product_id: null,
        variant_id: null,
      },
    ]);
    const order = await orderOf(gift.id);
    expect(order.subtotal).toBe(49);
    // 10% VAT on the bouquets as on the piece.
    expect(gift.total).toBeCloseTo(plain.total + 26.4, 3);
    expect((order.gift as Record<string, unknown>).addons).toEqual([
      { id: rose, name_ar: "باقة ورد", name_en: "Flower bouquet", quantity: 2, price: 12 },
    ]);
  });

  it("add to a priced card, and a code takes nothing off either", async () => {
    await settings(true, true, 1.5, false);
    const rose = await addon({ price: 10 });
    const coded = await place(null, { promo: "OFF5" });
    const gift = await place({ card: true, addons: [{ id: rose }] }, { promo: "OFF5" });
    const [a, b] = [await orderOf(coded.id), await orderOf(gift.id)];
    expect(b.discount).toBe(a.discount);
    expect(b.subtotal).toBe((a.subtotal as number) + 11.5);
    await settings(true, true, 0, false);
  });

  it("refuse one that is off, archived, another store's, unknown, or too many", async () => {
    const off = await addon({ available: false });
    const gone = await addon();
    await db.query("SELECT public.archive_gift_addon($1)", [gone]);
    const foreign = await addon({ brand: OTHER });
    const rose = await addon();
    for (const addons of [
      [{ id: off }],
      [{ id: gone }],
      [{ id: foreign }],
      [{ id: "00000000-0000-4000-8000-00000000dead" }],
      [{ id: "not-an-id" }],
      [{ id: rose, quantity: 11 }],
      [{ id: rose, quantity: 0 }],
    ]) {
      expect((await place({ recipient: "Noor", addons })).error).toMatch(/GIFT_ADDON_UNAVAILABLE/);
    }
    // An archived one is no longer shown, and its row stays for the orders that hold it.
    expect((await shown()).map((a) => a.id)).not.toContain(gone);
    const kept = await db.query(
      "SELECT archived_at IS NOT NULL AS archived FROM public.gift_addons WHERE id = $1",
      [gone],
    );
    expect(kept.rows[0]).toEqual({ archived: true });
  });

  it("are changed and removed by settings staff only, within bounds", async () => {
    const rose = await addon({ price: 12 });
    await addon({ id: rose, price: 14, name_en: "Large bouquet" });
    const row = await db.query<{ price: number; name_en: string; name_ar: string }>(
      "SELECT price::float AS price, name_en, name_ar FROM public.gift_addons WHERE id = $1",
      [rose],
    );
    expect(row.rows[0]).toEqual({ price: 14, name_en: "Large bouquet", name_ar: "باقة ورد" });
    await expect(addon({ price: 0 })).rejects.toThrow(/GIFT_ADDON_PRICE_INVALID/);
    await expect(addon({ name_ar: " ", name_en: "" })).rejects.toThrow(/GIFT_ADDON_NAME_REQUIRED/);
    await db.exec(
      "CREATE OR REPLACE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$",
    );
    await expect(addon()).rejects.toThrow(/FORBIDDEN/);
    await expect(db.query("SELECT public.archive_gift_addon($1)", [rose])).rejects.toThrow(
      /GIFT_ADDON_NOT_FOUND/,
    );
    await db.exec(
      "CREATE OR REPLACE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$",
    );
    const visitor = await db.query<{ save: boolean; read: boolean }>(
      `SELECT has_function_privilege('anon', 'public.save_gift_addon(uuid, text, text, text, text, text, numeric, boolean, integer, uuid)', 'EXECUTE') AS save,
              has_function_privilege('anon', 'public.storefront_gift_addons(text)', 'EXECUTE') AS read`,
    );
    expect(visitor.rows[0]).toEqual({ save: false, read: true });
  });
});

// Step three (migration 20261204100000): each gift line says what it is and carries the store's
// cost, which only staff who see the finances read or set.
describe("a gift line's kind and cost", () => {
  const giftLines = async (id: string) =>
    (
      await db.query<Record<string, unknown>>(
        `SELECT name_en, gift_line, unit_cost::float AS unit_cost
           FROM public.order_items WHERE order_id = $1 AND product_id IS NULL ORDER BY gift_line`,
        [id],
      )
    ).rows;
  const setCost = (addon: string | null, cost: number | null) =>
    db.query("SELECT public.set_gift_item_cost($1, $2, $3)", [BRAND, addon, cost]);

  it("marks the card and each add-on, at the cost the store set when it was sold", async () => {
    await settings(true, true, 1.5, false);
    const rose = await addon({ price: 12 });
    await setCost(null, 0.4);
    await setCost(rose, 7);
    const gift = await place({ card: true, addons: [{ id: rose, quantity: 2 }] });
    expect(await giftLines(gift.id)).toEqual([
      { name_en: "Flower bouquet", gift_line: "addon", unit_cost: 7 },
      { name_en: "Gift message card", gift_line: "card", unit_cost: 0.4 },
    ]);
    // A later change of cost leaves the lines already sold as they were.
    await setCost(rose, 9);
    expect((await giftLines(gift.id))[0].unit_cost).toBe(7);
    // With no cost set, a line carries none (the margins count it as missing).
    await setCost(null, null);
    const later = await place({ card: true });
    expect(await giftLines(later.id)).toEqual([
      { name_en: "Gift message card", gift_line: "card", unit_cost: null },
    ]);
    await settings(true, true, 0, false);
  });

  it("keeps the costs for staff who see the finances", async () => {
    const rose = await addon();
    await db.exec("SET test.finance = 'no'");
    await expect(setCost(rose, 3)).rejects.toThrow(/FORBIDDEN/);
    await db.exec("SET test.finance = 'yes'");
    await expect(setCost(rose, -1)).rejects.toThrow(/GIFT_COST_INVALID/);
    await expect(setCost("00000000-0000-4000-8000-00000000dead", 3)).rejects.toThrow(
      /GIFT_ADDON_NOT_FOUND/,
    );
    const { rows } = await db.query<Record<string, boolean>>(
      `SELECT has_function_privilege('anon', 'public.set_gift_item_cost(uuid, uuid, numeric)', 'EXECUTE') AS set_by_visitor,
              has_function_privilege('authenticated', 'public.gift_item_cost(uuid, uuid)', 'EXECUTE') AS read_by_staff,
              has_table_privilege('anon', 'public.gift_item_costs', 'SELECT') AS read_by_visitor`,
    );
    expect(rows[0]).toEqual({
      set_by_visitor: false,
      read_by_staff: false,
      read_by_visitor: false,
    });
  });
});
