import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261130100000_review_link_ready_on_completion.sql?raw";

// The review link is ready as soon as an order is completed (migration 20261130100000), run in
// a real Postgres (PGlite) with the live triggers on a small copy of the orders table: the store
// decides when to send it, where it once waited three days after completion.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-000000000001";
let db: PGlite;

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    customer_phone_snapshot text, completed_at timestamptz
  );
  CREATE TABLE public.order_review_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    order_id uuid NOT NULL UNIQUE, eligible_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'scheduled', created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  -- The live function before the change, and its two triggers (migration 20260928170000).
  CREATE FUNCTION public.enqueue_order_review_request() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.completed_at IS NOT NULL AND COALESCE(NULLIF(trim(NEW.customer_phone_snapshot), ''), '') <> '' THEN
      INSERT INTO public.order_review_requests (brand_id, order_id, eligible_at)
      VALUES (NEW.brand_id, NEW.id, NEW.completed_at + interval '3 days')
      ON CONFLICT (order_id) DO NOTHING;
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER enqueue_order_review_request AFTER INSERT ON public.orders
    FOR EACH ROW WHEN (NEW.completed_at IS NOT NULL) EXECUTE FUNCTION public.enqueue_order_review_request();
  CREATE TRIGGER enqueue_order_review_request_on_update AFTER UPDATE ON public.orders
    FOR EACH ROW WHEN (NEW.completed_at IS NOT NULL AND (OLD.completed_at IS DISTINCT FROM NEW.completed_at
      OR OLD.customer_phone_snapshot IS DISTINCT FROM NEW.customer_phone_snapshot))
    EXECUTE FUNCTION public.enqueue_order_review_request();
`;

const ready = async (order: string) =>
  (
    await db.query<{ ready: boolean }>(
      "SELECT eligible_at <= now() AS ready FROM public.order_review_requests WHERE order_id = $1",
      [order],
    )
  ).rows[0]?.ready;
const newOrder = async (phone: string | null, completed: string | null) =>
  (
    await db.query<{ id: string }>(
      "INSERT INTO public.orders (brand_id, customer_phone_snapshot, completed_at) VALUES ($1, $2, $3::timestamptz) RETURNING id",
      [BRAND, phone, completed],
    )
  ).rows[0].id;

let waiting: string;
let sent: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  // Completed an hour ago under the old rule: waiting out its three days.
  waiting = await newOrder("+97333000001", new Date(Date.now() - 3600_000).toISOString());
  sent = await newOrder("+97333000002", new Date(Date.now() - 3600_000).toISOString());
  await db.query("UPDATE public.order_review_requests SET status = 'sent' WHERE order_id = $1", [
    sent,
  ]);
  await db.exec(migration);
});

describe("the review link", () => {
  it("is ready the moment an order is completed", async () => {
    const id = await newOrder("+97333000003", null);
    expect(await ready(id)).toBeUndefined();
    await db.query("UPDATE public.orders SET completed_at = now() WHERE id = $1", [id]);
    expect(await ready(id)).toBe(true);
  });

  it("puts a request that was waiting out its three days in the list now", async () => {
    expect(await ready(waiting)).toBe(true);
  });

  it("leaves a request already sent as it was, and asks for no link without a phone", async () => {
    const row = await db.query<{ status: string; untouched: boolean }>(
      "SELECT status, eligible_at > now() AS untouched FROM public.order_review_requests WHERE order_id = $1",
      [sent],
    );
    expect(row.rows[0]).toEqual({ status: "sent", untouched: true });
    const noPhone = await newOrder(null, new Date().toISOString());
    expect(await ready(noPhone)).toBeUndefined();
  });
});
