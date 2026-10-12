import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261013110000_whatsapp_updates_follow_the_connection.sql?raw";

// WhatsApp order updates in a real Postgres (PGlite). They were tied to one store's name: its
// checkout offered the opt-in whether or not anything could be sent. After the migration a
// store's own connection decides, for the checkout's question, the consent and the queue.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

type Connection = {
  enabled?: boolean;
  number?: string | null;
  template?: boolean;
  language?: string;
};

/** A store, optionally with a WhatsApp connection and its "order placed" message. */
const store = async (slug: string, connection?: Connection) => {
  const id = uuid();
  await db.query("INSERT INTO public.brands (id, slug) VALUES ($1, $2)", [id, slug]);
  if (connection) {
    const { enabled = true, number = "100200300", template = true, language = "ar" } = connection;
    await db.query(
      "INSERT INTO public.whatsapp_integrations (brand_id, enabled, phone_number_id, default_language) VALUES ($1, $2, $3, $4)",
      [id, enabled, number, language],
    );
    await db.query(
      "INSERT INTO public.whatsapp_templates (brand_id, event_type, language, meta_template_name, active) VALUES ($1, 'order_placed', 'ar', 'order_placed_ar', $2)",
      [id, template],
    );
  }
  return id;
};
const order = async (brandId: string) => {
  const id = uuid();
  const token = uuid();
  await db.query(
    `INSERT INTO public.orders (id, brand_id, confirmation_email_token, customer_phone_snapshot, customer_name_snapshot, invoice_number, currency, total)
     VALUES ($1, $2, $3, '39001122', 'Fatima', 1101, 'BHD', 12.5)`,
    [id, brandId, token],
  );
  return { id, token };
};
const ready = async (brandId: string) =>
  (
    await db.query<{ ready: boolean }>(
      "SELECT public.storefront_whatsapp_updates_ready($1) AS ready",
      [brandId],
    )
  ).rows[0].ready;
const optIn = async (target: { id: string; token: string }) =>
  (
    await db.query<{ recorded: boolean }>(
      "SELECT public.record_order_whatsapp_opt_in($1, $2) AS recorded",
      [target.id, target.token],
    )
  ).rows[0].recorded;
const queued = async (orderId: string) =>
  (
    await db.query<{ id: string; recipient: string; template_name: string; parameters: string[] }>(
      "SELECT id, recipient, template_name, parameters FROM public.whatsapp_outbox WHERE order_id = $1",
      [orderId],
    )
  ).rows;

// The three functions as they were live before the migration: each named the store.
const LIVE_BEFORE = `
CREATE FUNCTION public.normalize_whatsapp_recipient(p_value text) RETURNS text
 LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE v_digits text := regexp_replace(COALESCE(p_value, ''), '[^0-9]', '', 'g');
BEGIN
  IF length(v_digits) = 8 THEN v_digits := '973' || v_digits;
  ELSIF left(v_digits, 2) = '00' THEN v_digits := substring(v_digits FROM 3);
  END IF;
  IF length(v_digits) < 8 OR length(v_digits) > 15 THEN RETURN NULL; END IF;
  RETURN v_digits;
END;
$function$;
CREATE FUNCTION public.enqueue_order_whatsapp_event(p_order_id uuid, p_event_type text) RETURNS void
 LANGUAGE plpgsql AS $function$
BEGIN
  PERFORM 1 FROM public.orders o JOIN public.brands b ON b.id = o.brand_id
  WHERE o.id = p_order_id AND b.slug = 'pura';
END;
$function$;
CREATE FUNCTION public.record_order_whatsapp_opt_in(p_order_id uuid, p_confirmation_token uuid) RETURNS boolean
 LANGUAGE plpgsql AS $function$
DECLARE v_updated boolean;
BEGIN
  UPDATE public.orders o
  SET whatsapp_transactional_opt_in_at = COALESCE(whatsapp_transactional_opt_in_at, now())
  FROM public.brands b
  WHERE o.id = p_order_id AND o.brand_id = b.id AND b.slug = 'pura'
    AND o.confirmation_email_token = p_confirmation_token;
  v_updated := FOUND;
  RETURN v_updated;
END;
$function$;
`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text UNIQUE);
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY, brand_id uuid NOT NULL, confirmation_email_token uuid,
      whatsapp_transactional_opt_in_at timestamptz, customer_phone_snapshot text,
      customer_name_snapshot text, invoice_number integer, currency text, total numeric
    );
    CREATE TABLE public.whatsapp_integrations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL UNIQUE,
      provider text NOT NULL DEFAULT 'meta', enabled boolean NOT NULL DEFAULT false,
      phone_number_id text, graph_api_version text NOT NULL DEFAULT 'v23.0',
      default_language text NOT NULL DEFAULT 'ar'
    );
    CREATE TABLE public.whatsapp_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, event_type text NOT NULL,
      language text NOT NULL, meta_template_name text NOT NULL, active boolean NOT NULL DEFAULT false
    );
    CREATE TABLE public.whatsapp_outbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, order_id uuid,
      event_type text NOT NULL, language text NOT NULL, recipient text NOT NULL,
      template_name text NOT NULL, parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
      status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (order_id, event_type, recipient, language)
    );
  `);
  await db.exec(LIVE_BEFORE);
});

describe("before the migration", () => {
  it("recorded the consent for the named store even with nothing able to send", async () => {
    const pura = await store("pura", { enabled: false, number: null, template: false });
    const placed = await order(pura);
    expect(await optIn(placed)).toBe(true);
    expect(await queued(placed.id)).toEqual([]);
  });
});

describe("after the migration", () => {
  beforeAll(async () => {
    await db.exec(
      "DELETE FROM public.orders; DELETE FROM public.whatsapp_templates; DELETE FROM public.whatsapp_integrations; DELETE FROM public.brands;",
    );
    await db.exec(migration);
  });
  beforeEach(() => db.exec("DELETE FROM public.whatsapp_outbox"));

  it("says a store can send only with a connection that is on, a number and an active message", async () => {
    expect(await ready(await store("no-connection"))).toBe(false);
    expect(await ready(await store("switched-off", { enabled: false }))).toBe(false);
    expect(await ready(await store("no-number", { number: null }))).toBe(false);
    expect(await ready(await store("no-message", { template: false }))).toBe(false);
    // Its message is in Arabic; a connection that speaks English has none to send.
    expect(await ready(await store("other-language", { language: "en" }))).toBe(false);
    expect(await ready(await store("ready", {}))).toBe(true);
  });

  it("no longer knows a store by its name", async () => {
    // The store the code named, as it is live: connection off, no number, no active message.
    const pura = await store("pura", { enabled: false, number: null, template: false });
    expect(await ready(pura)).toBe(false);
    const placed = await order(pura);
    expect(await optIn(placed)).toBe(false);
    const row = await db.query<{ at: string | null }>(
      "SELECT whatsapp_transactional_opt_in_at AS at FROM public.orders WHERE id = $1",
      [placed.id],
    );
    expect(row.rows[0].at).toBeNull();
  });

  it("records the consent and queues the first message for any store that can send", async () => {
    const brand = await store("zh", {});
    const placed = await order(brand);
    expect(await optIn(placed)).toBe(true);
    const [message] = await queued(placed.id);
    expect(message).toMatchObject({
      recipient: "97339001122",
      template_name: "order_placed_ar",
      parameters: ["Fatima", "1101", "BHD 12.500"],
    });
    // Asked again (a double submit): one message, not two.
    expect(await optIn(placed)).toBe(true);
    expect(await queued(placed.id)).toHaveLength(1);
  });

  it("needs the order's own token", async () => {
    const placed = await order(await store("guarded", {}));
    expect(await optIn({ id: placed.id, token: uuid() })).toBe(false);
    expect(await queued(placed.id)).toEqual([]);
  });

  it("hands a queued message to the sender only while the store's connection is on", async () => {
    const brand = await store("sender", {});
    const placed = await order(brand);
    await optIn(placed);
    const [message] = await queued(placed.id);
    const claim = () =>
      db.query<{ event_id: string; phone_number_id: string }>(
        "SELECT event_id, phone_number_id FROM public.claim_whatsapp_outbox_event($1)",
        [message.id],
      );

    await db.query("UPDATE public.whatsapp_integrations SET enabled = false WHERE brand_id = $1", [
      brand,
    ]);
    expect((await claim()).rows).toEqual([]);

    await db.query("UPDATE public.whatsapp_integrations SET enabled = true WHERE brand_id = $1", [
      brand,
    ]);
    expect((await claim()).rows).toEqual([{ event_id: message.id, phone_number_id: "100200300" }]);
    // Claimed once: it is being sent.
    expect((await claim()).rows).toEqual([]);
  });

  it("lets a visitor ask whether a store can send, and nothing else about its connection", async () => {
    const grants = await db.query<{ fn: string; anon: boolean }>(
      `SELECT p.proname AS fn, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
       FROM pg_proc p WHERE p.proname = 'storefront_whatsapp_updates_ready'`,
    );
    expect(grants.rows).toEqual([{ fn: "storefront_whatsapp_updates_ready", anon: true }]);
    const returns = await db.query<{ type: string }>(
      "SELECT pg_get_function_result('public.storefront_whatsapp_updates_ready(uuid)'::regprocedure) AS type",
    );
    expect(returns.rows[0].type).toBe("boolean");
  });

  it("names no store anywhere", () => {
    expect(migration.replace(/^--.*$/gm, "")).not.toMatch(/pura/i);
  });
});
