import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261012140000_customer_push_names_its_own_store.sql?raw";
import { notificationUrl, storeHome } from "../supabase/functions/send-customer-push/link";
import { campaignTitleExample } from "../src/lib/data/push";

// A shopper's order notification names its own store and opens its own account page. The
// trigger was written when one store had a customer app: it thanked every store's customer for
// choosing Pura Line and sent them to Pura's account page. The trigger runs here in a real
// Postgres (PGlite); the sender's link rule and the campaign screen's example are pure.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const PURA = "00000000-0000-4000-8000-0000000000a1";
const ZH = "00000000-0000-4000-8000-0000000000a2";
const ENGLISH_ONLY = "00000000-0000-4000-8000-0000000000a3";
const NAMELESS = "00000000-0000-4000-8000-0000000000a4";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";

let db: PGlite;

const SCHEMA = `
  CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, name_ar text, name_en text);
  INSERT INTO public.brands VALUES
    ('${PURA}', 'pura', 'بيورا لاين', 'Pura Line'),
    ('${ZH}', 'ZH', 'زد إتش', 'ZH Abayas'),
    ('${ENGLISH_ONLY}', 'qoffee', '  ', 'Qoffee'),
    ('${NAMELESS}', 'plain', NULL, NULL);
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, customer_id uuid,
    invoice_number int, total numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'BHD',
    status text NOT NULL DEFAULT 'pending', payment_status text NOT NULL DEFAULT 'unpaid',
    fulfillment_status text NOT NULL DEFAULT 'ON_HOLD'
  );
  CREATE TABLE public.customer_push_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, customer_id uuid,
    order_id uuid, event_type text, dedupe_key text, title text, body text, target_url text,
    payload jsonb, UNIQUE (brand_id, dedupe_key)
  );
  CREATE FUNCTION public.format_currency_amount(numeric, text) RETURNS text LANGUAGE sql
    AS $$ SELECT $1::text || ' ' || $2 $$;
  CREATE FUNCTION public.format_localized_order_status(text, text, text) RETURNS text LANGUAGE sql
    AS $$ SELECT COALESCE($1, $2) $$;
`;
const TRIGGER = `
  CREATE TRIGGER enqueue_customer_order_push AFTER INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enqueue_customer_order_push();
`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(migration);
  await db.exec(TRIGGER);
});

async function place(brand: string, customer: string | null = CUSTOMER) {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO public.orders (brand_id, customer_id, invoice_number, total) VALUES ($1, $2, 1001, 30) RETURNING id",
    [brand, customer],
  );
  return rows[0].id;
}
const complete = (id: string) =>
  db.query(
    "UPDATE public.orders SET status = 'completed', fulfillment_status = 'COMPLETED' WHERE id = $1",
    [id],
  );
const events = async (id: string) =>
  (
    await db.query<{ title: string; body: string; target_url: string | null }>(
      "SELECT title, body, target_url FROM public.customer_push_events WHERE order_id = $1 ORDER BY dedupe_key",
      [id],
    )
  ).rows;

describe("a shopper's order notification", () => {
  it("opens the account page of the store the order was placed with", async () => {
    const [zh] = await events(await place(ZH));
    expect(zh.target_url).toBe("https://zh.boutq.store/zh/account");
    const [pura] = await events(await place(PURA));
    expect(pura.target_url).toBe("https://pura.boutq.store/pura/account");
  });

  it("thanks the customer for choosing that store, in its Arabic name", async () => {
    const id = await place(ZH);
    await complete(id);
    const delivered = (await events(id)).find((event) => event.title.startsWith("اكتمل"));
    expect(delivered?.body).toBe(
      "تم تسليم طلبك بنجاح. نتمنى أن ينال إعجابك! شكراً لاختيارك زد إتش.",
    );
    expect(delivered?.target_url).toBe("https://zh.boutq.store/zh/account");
  });

  it("never names another store", async () => {
    for (const brand of [ZH, ENGLISH_ONLY, NAMELESS]) {
      const id = await place(brand);
      await complete(id);
      for (const event of await events(id)) {
        expect(`${event.title} ${event.body} ${event.target_url}`).not.toMatch(/pura/i);
      }
    }
  });

  it("uses the English name of a store with no Arabic one, and no name when it has none", async () => {
    const english = await place(ENGLISH_ONLY);
    await complete(english);
    expect((await events(english)).map((event) => event.body)).toContain(
      "تم تسليم طلبك بنجاح. نتمنى أن ينال إعجابك! شكراً لاختيارك Qoffee.",
    );
    const nameless = await place(NAMELESS);
    await complete(nameless);
    expect((await events(nameless)).map((event) => event.body)).toContain(
      "تم تسليم طلبك بنجاح. نتمنى أن ينال إعجابك!",
    );
  });

  it("still says what it said about the order, and nothing for an order with no customer", async () => {
    const id = await place(PURA);
    const [created] = await events(id);
    expect(created.title).toBe("استلمنا طلبك #1001");
    expect(created.body).toContain("30 BHD");
    await db.query("UPDATE public.orders SET payment_status = 'paid' WHERE id = $1", [id]);
    expect((await events(id)).map((event) => event.title)).toContain("تم تأكيد الدفع #1001");
    expect(await events(await place(PURA, null))).toEqual([]);
  });
});

describe("the link the sender puts in a notification", () => {
  it("is the event's own full address", () => {
    expect(notificationUrl("https://zh.boutq.store/zh/account", "zh")).toBe(
      "https://zh.boutq.store/zh/account",
    );
    expect(notificationUrl("https://shop.noor.bh", "noor")).toBe("https://shop.noor.bh/");
  });

  it("resolves an older event's path, or a missing link, against its own store", () => {
    expect(notificationUrl("/zh/account", "zh")).toBe("https://zh.boutq.store/zh/account");
    expect(notificationUrl(null, "ZH ")).toBe("https://zh.boutq.store");
    expect(notificationUrl("", "aurora")).toBe("https://aurora.boutq.store");
  });

  it("falls back to the platform, never to one store, when the store is not known", () => {
    expect(storeHome(null)).toBe("https://boutq.store");
    expect(storeHome("not a slug")).toBe("https://boutq.store");
    expect(notificationUrl("/account", undefined)).toBe("https://boutq.store/account");
  });

  it("does not pass on a link that is not a secure web address", () => {
    expect(notificationUrl("javascript:alert(1)", "zh")).toBe("https://zh.boutq.store");
    expect(notificationUrl("http://zh.boutq.store/zh", "zh")).toBe("https://zh.boutq.store");
  });
});

describe("the campaign title's example", () => {
  it("names the store whose admin is writing it", () => {
    expect(campaignTitleExample({ name_en: "ZH Abayas", name_ar: "زد إتش" }, "en")).toBe(
      "New at ZH Abayas",
    );
    expect(campaignTitleExample({ name_en: "ZH Abayas", name_ar: "زد إتش" }, "ar")).toBe(
      "وصل الجديد من زد إتش",
    );
    expect(campaignTitleExample({ name_en: "Qoffee", name_ar: null }, "ar")).toBe(
      "وصل الجديد من Qoffee",
    );
    expect(campaignTitleExample({}, "en")).toBe("New arrivals");
  });
});
