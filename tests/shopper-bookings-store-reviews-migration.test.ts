import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import migration from "../supabase/migrations/20261023120000_shopper_bookings_and_store_reviews.sql?raw";

// A shopper's own bookings and a store's reviews (migration 20261023120000), run in a real
// Postgres (PGlite) on the tables they read, with the signed-in account set per query.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, is_active boolean DEFAULT true);
  CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY, currency text);
  CREATE TABLE public.booking_settings (brand_id uuid PRIMARY KEY, timezone text);
  CREATE TABLE public.customers (id uuid PRIMARY KEY, brand_id uuid, auth_user_id uuid);
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY, brand_id uuid, customer_id uuid, public_invoice_token uuid,
    total numeric, advance_paid numeric DEFAULT 0, currency text, customer_name_snapshot text
  );
  CREATE TABLE public.bookings (
    id uuid PRIMARY KEY, brand_id uuid, reference text, status text, event_date date,
    starts_at timestamptz, ends_at timestamptz, customer_id uuid, order_id uuid,
    location jsonb, notes text, cancel_reason text, hold_token uuid, total numeric
  );
  CREATE TABLE public.booking_items (
    id serial PRIMARY KEY, booking_id uuid, name_en text, name_ar text, quantity integer,
    parent_item_id integer, option_id uuid
  );
  CREATE TABLE public.order_reviews (
    id uuid PRIMARY KEY, brand_id uuid, order_id uuid, rating integer, highlights text[],
    comment text, created_at timestamptz, show_on_store boolean, hidden_at timestamptz
  );
`;

const STORE = "00000000-0000-4000-8000-000000000001";
const OTHER_STORE = "00000000-0000-4000-8000-000000000002";
const SARA = "00000000-0000-4000-8000-0000000000a1";
const NOOR = "00000000-0000-4000-8000-0000000000a2";

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(SCHEMA);
  await pg.exec(migration);
  await pg.exec(`
    INSERT INTO brands VALUES ('${STORE}', 'aurora', true), ('${OTHER_STORE}', 'other', true);
    INSERT INTO business_settings VALUES ('${STORE}', 'BHD'), ('${OTHER_STORE}', 'KWD');
    INSERT INTO booking_settings VALUES ('${STORE}', 'Asia/Bahrain');
    INSERT INTO customers VALUES
      ('00000000-0000-4000-8000-0000000000c1', '${STORE}', '${SARA}'),
      ('00000000-0000-4000-8000-0000000000c2', '${STORE}', '${NOOR}'),
      ('00000000-0000-4000-8000-0000000000c3', '${OTHER_STORE}', '${SARA}');
    INSERT INTO orders VALUES
      ('00000000-0000-4000-8000-0000000000d1', '${STORE}', '00000000-0000-4000-8000-0000000000c1',
       '00000000-0000-4000-8000-0000000000e1', 100, 40, 'BHD', 'Sara Ali'),
      ('00000000-0000-4000-8000-0000000000d2', '${STORE}', '00000000-0000-4000-8000-0000000000c1',
       '00000000-0000-4000-8000-0000000000e2', 55, 0, 'BHD', 'Sara Ali'),
      ('00000000-0000-4000-8000-0000000000d3', '${STORE}', '00000000-0000-4000-8000-0000000000c2',
       null, 30, 30, 'BHD', 'Noor'),
      ('00000000-0000-4000-8000-0000000000d4', '${OTHER_STORE}', '00000000-0000-4000-8000-0000000000c3',
       null, 20, 20, 'KWD', 'Sara');
    INSERT INTO bookings VALUES
      -- Sara's: confirmed (the customer on the booking), a transfer waiting for its check (the
      -- customer only on its order), a hold still in checkout, one that ran out, a cancelled one.
      ('00000000-0000-4000-8000-0000000000b1', '${STORE}', 'BK-ONE', 'confirmed', '2026-10-25',
       '2026-10-25T15:00:00Z', '2026-10-25T18:00:00Z', '00000000-0000-4000-8000-0000000000c1',
       '00000000-0000-4000-8000-0000000000d1', '{"area":"Juffair"}', 'staff note',
       null, '00000000-0000-4000-8000-0000000000f1', 100),
      ('00000000-0000-4000-8000-0000000000b2', '${STORE}', 'BK-TWO', 'hold', '2026-11-02',
       '2026-11-02T15:00:00Z', '2026-11-02T18:00:00Z', null,
       '00000000-0000-4000-8000-0000000000d2', null, null, null, null, 55),
      ('00000000-0000-4000-8000-0000000000b3', '${STORE}', 'BK-CART', 'hold', '2026-11-03',
       '2026-11-03T15:00:00Z', '2026-11-03T18:00:00Z', '00000000-0000-4000-8000-0000000000c1',
       null, null, null, null, null, 40),
      ('00000000-0000-4000-8000-0000000000b4', '${STORE}', 'BK-GONE', 'expired', '2026-11-04',
       '2026-11-04T15:00:00Z', '2026-11-04T18:00:00Z', '00000000-0000-4000-8000-0000000000c1',
       null, null, null, null, null, 40),
      ('00000000-0000-4000-8000-0000000000b5', '${STORE}', 'BK-OFF', 'cancelled', '2026-10-20',
       '2026-10-20T15:00:00Z', '2026-10-20T18:00:00Z', '00000000-0000-4000-8000-0000000000c1',
       null, null, null, 'Owner double booked', null, 40),
      -- Noor's, and Sara's at another store.
      ('00000000-0000-4000-8000-0000000000b6', '${STORE}', 'BK-NOOR', 'confirmed', '2026-10-26',
       '2026-10-26T15:00:00Z', '2026-10-26T18:00:00Z', '00000000-0000-4000-8000-0000000000c2',
       '00000000-0000-4000-8000-0000000000d3', null, null, null, null, 30),
      ('00000000-0000-4000-8000-0000000000b7', '${OTHER_STORE}', 'BK-ELSEWHERE', 'confirmed',
       '2026-10-27', '2026-10-27T15:00:00Z', '2026-10-27T18:00:00Z',
       '00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000d4',
       null, null, null, null, 20);
    INSERT INTO booking_items (booking_id, name_en, name_ar, quantity, parent_item_id, option_id) VALUES
      ('00000000-0000-4000-8000-0000000000b1', 'Photo booth', 'فوتوبوث', 1, null, null),
      ('00000000-0000-4000-8000-0000000000b1', 'Props', 'إكسسوارات', 1, 1, null),
      ('00000000-0000-4000-8000-0000000000b1', 'Extra prints', 'طباعة إضافية', 1, null,
       '00000000-0000-4000-8000-0000000000aa');
    INSERT INTO order_reviews VALUES
      ('00000000-0000-4000-8000-000000000101', '${STORE}', '00000000-0000-4000-8000-0000000000d1',
       5, '{on_time,quality}', 'Wonderful night', '2026-10-26T10:00:00Z', true, null),
      ('00000000-0000-4000-8000-000000000102', '${STORE}', '00000000-0000-4000-8000-0000000000d3',
       4, '{on_time}', 'Kept to myself', '2026-10-27T10:00:00Z', false, null),
      ('00000000-0000-4000-8000-000000000103', '${STORE}', '00000000-0000-4000-8000-0000000000d2',
       3, '{}', 'Hidden by the store', '2026-10-28T10:00:00Z', true, '2026-10-28T11:00:00Z'),
      ('00000000-0000-4000-8000-000000000104', '${OTHER_STORE}', '00000000-0000-4000-8000-0000000000d4',
       1, '{}', 'Another store', '2026-10-28T10:00:00Z', true, null);
  `);
});

type Mine = {
  reference: string;
  status: string;
  timezone: string;
  location: Record<string, string> | null;
  services: Array<{ name_en: string; name_ar: string; quantity: number }>;
  invoice_token: string | null;
  total: number;
  paid: number;
  currency: string;
  [key: string]: unknown;
};

/** The caller's bookings with a store, signed in as `uid` (none: a visitor). */
async function myBookings(uid: string | null, brand = STORE): Promise<Mine[]> {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('test.uid', $1, true)`, [uid ?? ""]);
    const { rows } = await tx.query<{ b: Mine[] }>("select storefront_my_bookings($1) b", [brand]);
    return rows[0].b;
  });
}

describe("a shopper's bookings", () => {
  it("are their own with the store: confirmed, a transfer waiting, and cancelled, latest first", async () => {
    const mine = await myBookings(SARA);
    expect(mine.map((b) => b.reference)).toEqual(["BK-TWO", "BK-ONE", "BK-OFF"]);
    const confirmed = mine.find((b) => b.reference === "BK-ONE")!;
    expect(confirmed).toMatchObject({
      status: "confirmed",
      timezone: "Asia/Bahrain",
      location: { area: "Juffair" },
      invoice_token: "00000000-0000-4000-8000-0000000000e1",
      total: 100,
      paid: 40,
      currency: "BHD",
    });
    // The booked service only: not what a package includes, not an add-on.
    expect(confirmed.services).toEqual([
      { name_en: "Photo booth", name_ar: "فوتوبوث", quantity: 1 },
    ]);
  });

  it("never carry the hold token, the store's notes or its reason for cancelling", async () => {
    for (const booking of await myBookings(SARA)) {
      expect(Object.keys(booking).sort()).toEqual(
        [
          "currency",
          "ends_at",
          "event_date",
          "invoice_token",
          "location",
          "paid",
          "reference",
          "services",
          "starts_at",
          "status",
          "timezone",
          "total",
        ].sort(),
      );
    }
  });

  it("are nobody else's: another shopper, another store, a visitor", async () => {
    expect((await myBookings(NOOR)).map((b) => b.reference)).toEqual(["BK-NOOR"]);
    expect((await myBookings(SARA, OTHER_STORE)).map((b) => b.reference)).toEqual(["BK-ELSEWHERE"]);
    expect(await myBookings(null)).toEqual([]);
  });

  it("cannot be asked for by a visitor at all", async () => {
    const { rows } = await pg.query<{ anon: boolean; auth: boolean }>(
      `select has_function_privilege('anon', 'storefront_my_bookings(uuid)', 'execute') anon,
              has_function_privilege('authenticated', 'storefront_my_bookings(uuid)', 'execute') auth`,
    );
    expect(rows[0]).toEqual({ anon: false, auth: true });
  });
});

describe("a store's reviews", () => {
  type Reviews = {
    count: number;
    average: number;
    stars: Record<string, number>;
    highlights: Record<string, number>;
    reviews: Array<{ comment: string; name: string | null }>;
  };
  const storeReviews = async (slug: string) =>
    (await pg.query<{ r: Reviews | null }>("select storefront_store_reviews($1) r", [slug])).rows[0]
      .r;

  it("count every review's stars once, and show only the words the customer shared and the store kept", async () => {
    const reviews = (await storeReviews("aurora"))!;
    expect(reviews.count).toBe(3);
    expect(Number(reviews.average)).toBe(4);
    expect(reviews.stars).toEqual({ "1": 0, "2": 0, "3": 1, "4": 1, "5": 1 });
    expect(reviews.highlights).toEqual({ on_time: 2, quality: 1 });
    expect(reviews.reviews).toEqual([
      expect.objectContaining({ comment: "Wonderful night", name: "Sara" }),
    ]);
  });

  it("is nothing for a store that does not exist, and readable by a visitor", async () => {
    expect(await storeReviews("nowhere")).toBeNull();
    const { rows } = await pg.query<{ anon: boolean }>(
      `select has_function_privilege('anon', 'storefront_store_reviews(text, integer)', 'execute') anon`,
    );
    expect(rows[0].anon).toBe(true);
  });
});
