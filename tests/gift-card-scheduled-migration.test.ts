import { beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261230100000_gift_card_scheduled_sending.sql?raw";

// A gift that arrives when the buyer chooses (migration 20261230100000), in a real Postgres
// (PGlite) with the purchase outbox as it is live: the schedule set once with the purchase's own
// token and within its bounds; a paid email gift queued once its time comes; its event carrying the
// gift link; sent recorded only when its email went; a gift sent by hand recorded by staff.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const PURCHASE = "00000000-0000-4000-8000-0000000000c1";
const CARD = "00000000-0000-4000-8000-0000000000d1";
const TOKEN = "p".repeat(40);
const LINK = "ab".repeat(32);

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE FUNCTION public.gift_card_staff(uuid) RETURNS boolean LANGUAGE sql
      AS $$ SELECT COALESCE(current_setting('test.staff', true), '') = 'on' $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, name_en text);
    INSERT INTO public.brands VALUES ('${BRAND}', 'pura', 'Pura Line');
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY, business_name text,
      email_sender_name text);
    CREATE TABLE public.gift_cards (id uuid PRIMARY KEY, brand_id uuid, code text,
      expires_on date, status text NOT NULL DEFAULT 'active', share_token text);
    INSERT INTO public.gift_cards VALUES ('${CARD}', '${BRAND}', 'ABCD', NULL, 'active', '${LINK}');
    CREATE TABLE public.gift_card_purchases (
      id uuid PRIMARY KEY, brand_id uuid NOT NULL, status text NOT NULL DEFAULT 'pending',
      token text NOT NULL, amount numeric, currency text, payment_method text,
      delivery_channel text, lang text, buyer_name text, buyer_phone text, buyer_email text,
      recipient_name text, message text, cancel_reason text, print_by_store boolean,
      print_fee numeric, print_address text, print_phone text, addons jsonb,
      addons_total numeric, design jsonb, gift_card_id uuid
    );
    INSERT INTO public.gift_card_purchases (id, brand_id, token, amount, currency, buyer_name,
      design, gift_card_id)
    VALUES ('${PURCHASE}', '${BRAND}', '${TOKEN}', 50, 'BHD', 'Sara', '{"from": "Sara"}', '${CARD}');
    CREATE TABLE public.gift_card_purchase_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_id uuid NOT NULL REFERENCES public.gift_card_purchases(id),
      brand_id uuid NOT NULL, event text NOT NULL,
      status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
      last_error text, created_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz,
      processed_at timestamptz, customer_done boolean NOT NULL DEFAULT false,
      store_done boolean NOT NULL DEFAULT false, next_attempt_at timestamptz,
      CONSTRAINT gift_card_purchase_events_event_check
        CHECK (event IN ('placed', 'paid', 'cancelled')),
      UNIQUE (purchase_id, event)
    );
  `);
  await db.exec(migration);
});

const schedule = (
  at: string,
  channel = "email",
  email: string | null = "Noor@Example.com ",
  phone: string | null = null,
  token = TOKEN,
) =>
  db.query(`SELECT public.set_gift_card_purchase_schedule($1, $2, ${at}, $3, $4, $5)`, [
    PURCHASE,
    token,
    channel,
    email,
    phone,
  ]);
const purchase = async () =>
  (
    await db.query<{
      send_at: string | null;
      send_channel: string | null;
      recipient_email: string | null;
      recipient_phone: string | null;
      recipient_sent_at: string | null;
    }>(
      `SELECT send_at, send_channel, recipient_email, recipient_phone, recipient_sent_at
         FROM public.gift_card_purchases`,
    )
  ).rows[0];
const enqueue = async () =>
  (await db.query<{ n: number }>(`SELECT public.enqueue_due_gift_sends() AS n`)).rows[0].n;
const becomeDue = () =>
  db.exec(`UPDATE public.gift_card_purchases SET send_at = now() - interval '1 minute'`);

describe("the schedule", () => {
  it("is set once, with the purchase's own token, its email cleaned", async () => {
    await schedule("now() + interval '2 days'");
    expect(await purchase()).toMatchObject({
      send_channel: "email",
      recipient_email: "noor@example.com",
      recipient_phone: null,
    });
    await expect(schedule("now() + interval '3 days'")).rejects.toThrow(/GIFT_SCHEDULE_CLOSED/);
  });

  it("refuses another token, a time too soon or too far, and a bad email or number", async () => {
    await expect(
      schedule("now() + interval '1 day'", "email", "a@b.co", null, "x".repeat(40)),
    ).rejects.toThrow(/PURCHASE_NOT_FOUND/);
    await expect(schedule("now() + interval '1 minute'")).rejects.toThrow(/GIFT_SCHEDULE_TIME/);
    await expect(schedule("now() + interval '400 days'")).rejects.toThrow(/GIFT_SCHEDULE_TIME/);
    await expect(schedule("now() + interval '1 day'", "email", "noor@")).rejects.toThrow(
      /GIFT_SCHEDULE_EMAIL/,
    );
    await expect(schedule("now() + interval '1 day'", "whatsapp", null, "123")).rejects.toThrow(
      /GIFT_SCHEDULE_PHONE/,
    );
    await expect(schedule("now() + interval '1 day'", "sms")).rejects.toThrow(
      /GIFT_SCHEDULE_CHANNEL/,
    );
    expect((await purchase()).send_at).toBeNull();
  });

  it("keeps a WhatsApp gift's number and no email", async () => {
    await schedule("now() + interval '1 day'", "whatsapp", "noor@example.com", "+973 3999 0001");
    expect(await purchase()).toMatchObject({
      send_channel: "whatsapp",
      recipient_email: null,
      recipient_phone: "+97339990001",
    });
  });
});

describe("a due email gift", () => {
  it("joins the outbox only once paid and due, once, while its card can be used", async () => {
    await schedule("now() + interval '1 day'");
    expect(await enqueue()).toBe(0);
    await becomeDue();
    expect(await enqueue()).toBe(0); // not paid yet
    await db.exec(`UPDATE public.gift_card_purchases SET status = 'paid'`);
    expect(await enqueue()).toBe(1);
    expect(await enqueue()).toBe(0);

    await db.exec(`DELETE FROM public.gift_card_purchase_events`);
    await db.exec(`UPDATE public.gift_cards SET status = 'voided'`);
    expect(await enqueue()).toBe(0);
  });

  it("carries the gift link and the giver as written, and is recorded sent only when its email went", async () => {
    await schedule("now() + interval '1 day'");
    await becomeDue();
    await db.exec(`UPDATE public.gift_card_purchases SET status = 'paid'`);
    await enqueue();
    const claimed = (
      await db.query<{ r: Array<Record<string, unknown>> }>(
        `SELECT public.claim_gift_card_purchase_events(10) AS r`,
      )
    ).rows[0].r;
    expect(claimed[0]).toMatchObject({
      event: "gift_due",
      recipient_email: "noor@example.com",
      gift_from: "Sara",
      gift_token: LINK,
    });
    const id = claimed[0].event_id;
    await db.query(`SELECT public.finish_gift_card_purchase_event($1, NULL, true, true, false)`, [
      id,
    ]);
    expect((await purchase()).recipient_sent_at).toBeNull();
    await db.query(`SELECT public.finish_gift_card_purchase_event($1, NULL, true, true, true)`, [
      id,
    ]);
    expect((await purchase()).recipient_sent_at).not.toBeNull();
    // A sent gift is never queued again.
    await db.exec(`DELETE FROM public.gift_card_purchase_events`);
    expect(await enqueue()).toBe(0);
  });

  it("still finishes the outbox's other events as before", async () => {
    await db.exec(
      `INSERT INTO public.gift_card_purchase_events (purchase_id, brand_id, event) VALUES ('${PURCHASE}', '${BRAND}', 'paid')`,
    );
    const id = (await db.query<{ id: string }>(`SELECT id FROM public.gift_card_purchase_events`))
      .rows[0].id;
    await db.query(`SELECT public.finish_gift_card_purchase_event($1, 'boom', true, false)`, [id]);
    const row = (
      await db.query<{ status: string; customer_done: boolean; store_done: boolean }>(
        `SELECT status, customer_done, store_done FROM public.gift_card_purchase_events`,
      )
    ).rows[0];
    expect(row).toEqual({ status: "failed", customer_done: true, store_done: false });
  });
});

describe("a gift sent by hand", () => {
  it("is recorded by the store's staff for a paid, scheduled gift", async () => {
    const mark = () => db.query(`SELECT public.mark_gift_card_recipient_sent($1)`, [PURCHASE]);
    await expect(mark()).rejects.toThrow(/PURCHASE_NOT_FOUND/);
    await db.exec(`SELECT set_config('test.staff', 'on', false)`);
    await expect(mark()).rejects.toThrow(/PURCHASE_NOT_PAID/);
    await db.exec(`UPDATE public.gift_card_purchases SET status = 'paid'`);
    await expect(mark()).rejects.toThrow(/GIFT_NOT_SCHEDULED/);
    await schedule("now() + interval '1 day'", "whatsapp", null, "+97339990001");
    await mark();
    expect((await purchase()).recipient_sent_at).not.toBeNull();
  });
});

describe("who may call it", () => {
  it("lets staff record a gift sent by hand, and leaves the rest to the server", async () => {
    const rights = await db.query<{ routine_name: string; grantee: string }>(
      `SELECT DISTINCT routine_name, grantee FROM information_schema.routine_privileges
        WHERE grantee IN ('anon', 'authenticated', 'PUBLIC')
          AND routine_name IN ('set_gift_card_purchase_schedule', 'enqueue_due_gift_sends',
            'claim_gift_card_purchase_events', 'finish_gift_card_purchase_event',
            'mark_gift_card_recipient_sent')`,
    );
    expect(rights.rows).toEqual([
      { routine_name: "mark_gift_card_recipient_sent", grantee: "authenticated" },
    ]);
  });
});
