import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import addressSnapshot from "../supabase/migrations/20261001160000_appointment_orders.sql?raw";
import pricedOptions from "../supabase/migrations/20261011100000_priced_options_charged.sql?raw";
import previous from "../supabase/migrations/20261012100000_storefront_order_owner_from_profiles.sql?raw";
import migration from "../supabase/migrations/20261012110000_storefront_order_keeps_the_address.sql?raw";

// The storefront's order builder, run for real: an in-process Postgres (PGlite) with the tables
// the function touches (same columns and unique rules as production), the real trigger that
// copies an address onto an order, and the function itself. It was rewritten once with nothing
// running it, and dropped every delivery address and refused signed-in shoppers; this is the
// test that would have said so.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const NAME = "place_storefront_order_internal_20260710";
const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const BRAND = id("b1");
const OTHER_BRAND = id("b2");
const OWNER = id("a1");
const SHOPPER = id("c1");
const OTHER_SHOPPER = id("c2");
const VARIANT = id("e1");

const functionOf = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tag = sql.includes("$function$", start) ? "$function$" : "$$";
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return sql.slice(start, end + tag.length);
};
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  -- Who is signed in: set per test with set_config('test.uid', ...); empty means a guest.
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;

  CREATE TABLE public.brands (
    id uuid PRIMARY KEY, slug text UNIQUE NOT NULL, subscription_status text NOT NULL DEFAULT 'active',
    trial_ends_at timestamptz, created_by uuid
  );
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY, storefront_mode text NOT NULL DEFAULT 'shop', currency text NOT NULL DEFAULT 'BHD'
  );
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, brand_id uuid, role text, status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, brand_id uuid NOT NULL,
    auth_user_id uuid, name text NOT NULL, phone text, email text,
    region text, block text, road text, house text, flat text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX customers_brand_auth_user_unique ON public.customers (brand_id, auth_user_id)
    WHERE auth_user_id IS NOT NULL;
  CREATE UNIQUE INDEX customers_brand_normalized_email_unique
    ON public.customers (brand_id, (nullif(lower(btrim(email)), '')))
    WHERE nullif(lower(btrim(email)), '') IS NOT NULL;
  CREATE TABLE public.customer_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, brand_id uuid NOT NULL,
    customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    label text, region text, block text, road text, house text, flat text, floor text, landmark text,
    delivery_notes text, formatted_address text, latitude numeric, longitude numeric, place_id text,
    is_default boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, brand_id uuid NOT NULL,
    customer_id uuid, invoice_number integer, status text, payment_method text, payment_status text,
    currency text, notes text, channel text, fulfillment_method text, shipping_address_id uuid,
    shipping numeric, branch_id uuid, subtotal numeric, total numeric, delivery_address_snapshot jsonb
  );
  CREATE TABLE public.products (
    id uuid PRIMARY KEY, brand_id uuid NOT NULL, name text, is_active boolean NOT NULL DEFAULT true,
    is_made_to_order boolean, custom_fields jsonb
  );
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY, product_id uuid NOT NULL, brand_id uuid NOT NULL, selling_price numeric NOT NULL,
    size text, color text, fabric text, sku text, stock_main integer, stock_incubator integer
  );
  CREATE TABLE public.customization_options (
    id uuid PRIMARY KEY, brand_id uuid NOT NULL, name text NOT NULL, price_delta numeric NOT NULL DEFAULT 0,
    product_ids text[] DEFAULT '{}'
  );
  CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, brand_id uuid, order_id uuid,
    product_id uuid, variant_id uuid, description text, quantity integer, unit_price numeric,
    line_total numeric, location text, selected_variant jsonb, custom_field_values jsonb,
    customizations jsonb, customization_total numeric
  );
  -- Stock is not what this test is about.
  CREATE FUNCTION public.order_inventory_transition(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
`;

let db: PGlite;

type Customer = Record<string, string | boolean | undefined>;
async function order(
  customer: Customer,
  options: { uid?: string; fulfillment?: string; slug?: string } = {},
) {
  await db.query("SELECT set_config('test.uid', $1, false)", [options.uid ?? ""]);
  const { rows } = await db.query<{ result: { order_id: string } }>(
    `SELECT public.${NAME}($1, $2::jsonb, $3::jsonb, 'cod', NULL, $4, NULL) AS result`,
    [
      options.slug ?? "pura",
      JSON.stringify(customer),
      JSON.stringify([{ variant_id: VARIANT, quantity: 1 }]),
      options.fulfillment ?? "delivery",
    ],
  );
  const placed = await db.query<Record<string, unknown>>(
    "SELECT * FROM public.orders WHERE id = $1",
    [rows[0].result.order_id],
  );
  return placed.rows[0];
}
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
const count = async (table: string) =>
  Number((await one<{ n: number }>(`SELECT count(*)::int AS n FROM public.${table}`)).n);

const ADDRESS = { region: "Isa Town", block: "805", road: "1045", house: "1045" };
const GUEST = { name: "Sayed", phone: "39955508", email: "sayed@example.com", ...ADDRESS };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(functionOf(pricedOptions, "storefront_line_customizations") + ";");
  await db.exec(functionOf(addressSnapshot, "capture_order_delivery_address_snapshot") + ";");
  await db.exec(`CREATE TRIGGER capture_order_delivery_address_snapshot
    BEFORE INSERT OR UPDATE OF shipping_address_id, fulfillment_method, customer_id, brand_id
    ON public.orders FOR EACH ROW EXECUTE FUNCTION public.capture_order_delivery_address_snapshot();`);
  await db.exec(migration);
});

beforeEach(async () => {
  await db.exec(`
    TRUNCATE public.order_items, public.orders, public.customer_addresses, public.customers,
      public.product_variants, public.products, public.business_settings, public.brands, public.profiles;
    INSERT INTO public.brands (id, slug, created_by) VALUES ('${BRAND}', 'pura', '${OWNER}'), ('${OTHER_BRAND}', 'other', '${OWNER}');
    INSERT INTO public.business_settings (brand_id) VALUES ('${BRAND}'), ('${OTHER_BRAND}');
    INSERT INTO public.products (id, brand_id, name, is_made_to_order) VALUES ('${id("d1")}', '${BRAND}', 'Abaya', true);
    INSERT INTO public.product_variants (id, product_id, brand_id, selling_price) VALUES ('${VARIANT}', '${id("d1")}', '${BRAND}', 28);
  `);
});

describe("the delivery address", () => {
  it("is saved with the order when the shopper gives no label", async () => {
    const placed = await order(GUEST);
    expect(placed.shipping_address_id).not.toBeNull();
    const address = await one("SELECT * FROM public.customer_addresses WHERE id = $1", [
      placed.shipping_address_id,
    ]);
    expect(address).toMatchObject({ ...ADDRESS, flat: null, label: "Home", is_default: true });
    expect(address.customer_id).toBe(placed.customer_id);
  });

  it("is copied onto the order itself, where staff and the courier read it", async () => {
    const placed = await order({ ...GUEST, flat: "4", label: "Office" });
    expect(placed.delivery_address_snapshot).toMatchObject({
      label: "Office",
      region: "Isa Town",
      block: "805",
      road: "1045",
      house: "1045",
      flat: "4",
    });
  });

  it("is kept on the customer as their latest address", async () => {
    const placed = await order(GUEST);
    expect(
      await one("SELECT region, block, road, house FROM public.customers WHERE id = $1", [
        placed.customer_id,
      ]),
    ).toEqual(ADDRESS);
  });

  it("is not saved twice when the same customer orders to the same place", async () => {
    const first = await order(GUEST);
    const second = await order(GUEST);
    expect(second.shipping_address_id).toBe(first.shipping_address_id);
    expect(await count("customer_addresses")).toBe(1);
  });

  it("a new place is a second address, and the first stays the default", async () => {
    await order(GUEST);
    const moved = await order({ ...GUEST, road: "2200" });
    expect(await count("customer_addresses")).toBe(2);
    expect(
      await one("SELECT road, is_default FROM public.customer_addresses WHERE id = $1", [
        moved.shipping_address_id,
      ]),
    ).toEqual({ road: "2200", is_default: false });
  });

  it("belongs to the store's owner like the customer it is for", async () => {
    const placed = await order(GUEST);
    const address = await one("SELECT user_id FROM public.customer_addresses WHERE id = $1", [
      placed.shipping_address_id,
    ]);
    expect(address.user_id).toBe(OWNER);
  });

  it("is not made up for a pickup, or when the shopper gave none", async () => {
    expect((await order(GUEST, { fulfillment: "pickup" })).shipping_address_id).toBeNull();
    const bare = await order({ name: "Noor", phone: "33000000" });
    expect(bare.shipping_address_id).toBeNull();
    expect(bare.delivery_address_snapshot).toBeNull();
    expect(await count("customer_addresses")).toBe(0);
  });
});

describe("whose order it is", () => {
  const linked = (overrides: Record<string, string | null> = {}) =>
    db.query(
      `INSERT INTO public.customers (id, user_id, brand_id, auth_user_id, name, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        overrides.id ?? id("f1"),
        OWNER,
        overrides.brand ?? BRAND,
        "auth" in overrides ? overrides.auth : SHOPPER,
        "Sayed",
        "phone" in overrides ? overrides.phone : "39955508",
        "email" in overrides ? overrides.email : "sayed@example.com",
      ],
    );

  it("a signed-in shopper orders as the customer their account is linked to", async () => {
    await linked();
    const placed = await order(GUEST, { uid: SHOPPER });
    expect(placed.customer_id).toBe(id("f1"));
    expect(await count("customers")).toBe(1);
  });

  it("their account's email is not replaced by what the form says", async () => {
    await linked();
    await order({ ...GUEST, email: "typo@example.com", name: "Sayed Majeed" }, { uid: SHOPPER });
    expect(await one("SELECT name, email FROM public.customers WHERE id = $1", [id("f1")])).toEqual(
      { name: "Sayed Majeed", email: "sayed@example.com" },
    );
  });

  it("a guest who has ordered before is found by phone, then by email", async () => {
    const first = await order(GUEST);
    const byPhone = await order({ ...GUEST, email: undefined });
    const byEmail = await order({ ...GUEST, phone: "36000000" });
    expect(byPhone.customer_id).toBe(first.customer_id);
    expect(byEmail.customer_id).toBe(first.customer_id);
    expect(await count("customers")).toBe(1);
  });

  it("a new customer is owned by the store, with the shopper's account on it when signed in", async () => {
    const guest = await order(GUEST);
    expect(
      await one("SELECT user_id, auth_user_id FROM public.customers WHERE id = $1", [
        guest.customer_id,
      ]),
    ).toEqual({ user_id: OWNER, auth_user_id: null });

    const member = await order(
      { name: "Noor", phone: "33000000", email: "noor@example.com" },
      { uid: OTHER_SHOPPER },
    );
    expect(
      await one("SELECT user_id, auth_user_id FROM public.customers WHERE id = $1", [
        member.customer_id,
      ]),
    ).toEqual({ user_id: OWNER, auth_user_id: OTHER_SHOPPER });
  });

  it("a signed-in shopper takes over the record of their own earlier guest orders", async () => {
    const asGuest = await order(GUEST);
    const signedIn = await order(GUEST, { uid: SHOPPER });
    expect(signedIn.customer_id).toBe(asGuest.customer_id);
  });

  it("a signed-in shopper is never matched to another account's customer", async () => {
    await linked({ auth: OTHER_SHOPPER });
    const placed = await order(GUEST, { uid: SHOPPER });
    expect(placed.customer_id).not.toBe(id("f1"));
    // The email already belongs to the other customer: the order goes through without it.
    expect(
      await one("SELECT auth_user_id, email FROM public.customers WHERE id = $1", [
        placed.customer_id,
      ]),
    ).toEqual({ auth_user_id: SHOPPER, email: null });
  });

  it("an email that belongs to another customer does not stop the order", async () => {
    await linked({ id: id("f2"), auth: null, phone: "36000000", email: "taken@example.com" });
    const first = await order(GUEST);
    const again = await order({ ...GUEST, email: "taken@example.com" });
    expect(again.customer_id).toBe(first.customer_id);
    expect(
      (await one("SELECT email FROM public.customers WHERE id = $1", [first.customer_id])).email,
    ).toBe("sayed@example.com");
  });

  it("a customer of another store is not this store's customer", async () => {
    await linked({ brand: OTHER_BRAND });
    const placed = await order(GUEST, { uid: SHOPPER });
    expect(placed.customer_id).not.toBe(id("f1"));
    expect(placed.brand_id).toBe(BRAND);
  });
});

describe("what the function did before this migration", () => {
  // The previous definition in the same database: the two faults, as they happened.
  let old: PGlite;
  beforeAll(async () => {
    old = new PGlite();
    await old.exec(SCHEMA);
    await old.exec(functionOf(pricedOptions, "storefront_line_customizations") + ";");
    await old.exec(functionOf(previous, NAME) + ";");
    await old.exec(`
      INSERT INTO public.brands (id, slug, created_by) VALUES ('${BRAND}', 'pura', '${OWNER}');
      INSERT INTO public.business_settings (brand_id) VALUES ('${BRAND}');
      INSERT INTO public.products (id, brand_id, name, is_made_to_order) VALUES ('${id("d1")}', '${BRAND}', 'Abaya', true);
      INSERT INTO public.product_variants (id, product_id, brand_id, selling_price) VALUES ('${VARIANT}', '${id("d1")}', '${BRAND}', 28);
    `);
  });
  const oldOrder = (uid: string) =>
    old.query(
      `SELECT set_config('test.uid', $1, false), public.${NAME}('pura', $2::jsonb, $3::jsonb, 'cod', NULL, 'delivery', NULL)`,
      [uid, JSON.stringify(GUEST), JSON.stringify([{ variant_id: VARIANT, quantity: 1 }])],
    );

  it("dropped the address of a delivery order", async () => {
    await oldOrder("");
    const { rows } = await old.query<{ shipping_address_id: string | null }>(
      "SELECT shipping_address_id FROM public.orders",
    );
    expect(rows[0].shipping_address_id).toBeNull();
    expect((await old.query("SELECT 1 FROM public.customer_addresses")).rows).toHaveLength(0);
  });

  it("refused a signed-in shopper who already had a customer record", async () => {
    await old.exec(
      "TRUNCATE public.order_items, public.orders, public.customer_addresses, public.customers",
    );
    await old.exec(
      `INSERT INTO public.customers (user_id, brand_id, auth_user_id, name, phone, email)
       VALUES ('${OWNER}', '${BRAND}', '${SHOPPER}', 'Sayed', '36111111', 'sayed@example.com')`,
    );
    await expect(oldOrder(SHOPPER)).rejects.toThrow(/customers_brand_normalized_email_unique/);
  });
});

describe("the rest of the function", () => {
  it("is the previous definition outside the customer and address steps", () => {
    const outside = (sql: string) => {
      const body = functionOf(sql, NAME);
      const before = body.slice(0, body.indexOf("-- 5. Customer resolution & upsert"));
      const after = body.slice(body.indexOf("-- 7. Generate invoice number"));
      return squash(before + after);
    };
    const withoutNewVariables = outside(migration).replace(
      " v_free_email text; v_region text; v_block text; v_road text; v_house text; v_flat text;",
      "",
    );
    expect(withoutNewVariables).toBe(outside(previous));
  });
});
