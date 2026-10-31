import { PGlite } from "@electric-sql/pglite";
import paymentState from "../../supabase/migrations/20261012130000_payment_state_is_one_fact.sql?raw";
import stepOne from "../../supabase/migrations/20261101100000_gift_cards.sql?raw";
import stepTwo from "../../supabase/migrations/20261102100000_gift_cards_checkout.sql?raw";
import stepThree from "../../supabase/migrations/20261103100000_gift_cards_sold_in_store.sql?raw";
import stepFour from "../../supabase/migrations/20261104100000_gift_cards_sold_online.sql?raw";
import notices from "../../supabase/migrations/20261105100000_gift_card_purchase_notices.sql?raw";

/**
 * A real Postgres (PGlite) with the gift cards' four migrations and the live payment state
 * trigger, on a small stand-in for the store's tables: the caller's store and permissions are
 * what the test sets (`test.staff_of`, `test.perms`).
 */

export const BRAND = "00000000-0000-4000-8000-0000000000b1";
export const OTHER = "00000000-0000-4000-8000-0000000000b2";
export const STAFF = "00000000-0000-4000-8000-0000000000aa";

export const paymentAmounts = (() => {
  const start = paymentState.indexOf("CREATE OR REPLACE FUNCTION public.orders_payment_amounts()");
  const end = paymentState.indexOf("-- Named to run before trg_orders_sync_payment_fulfillment");
  const tail = "FOR EACH ROW EXECUTE FUNCTION public.orders_payment_amounts();";
  return paymentState.slice(start, paymentState.indexOf(tail, end)) + tail;
})();

export const GIFT_CARD_SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${STAFF}'::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  CREATE FUNCTION public.can_access_brand(p uuid) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p::text = current_setting('test.staff_of', true) $$;
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p = ANY (string_to_array(coalesce(current_setting('test.perms', true), ''), ',')) $$;
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT coalesce(current_setting('test.admin', true), '') = 'yes' $$;
  GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid), public.has_permission(text), public.is_admin()
    TO anon, authenticated;

  CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text UNIQUE, is_active boolean NOT NULL DEFAULT true);
  INSERT INTO public.brands VALUES ('${BRAND}', 'pura'), ('${OTHER}', 'other');
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY, currency text, card_enabled boolean DEFAULT true, benefit_enabled boolean DEFAULT true
  );
  INSERT INTO public.business_settings VALUES ('${BRAND}', 'BHD'), ('${OTHER}', 'BHD');
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL DEFAULT '${BRAND}',
    channel text NOT NULL DEFAULT 'storefront', created_at timestamptz NOT NULL DEFAULT now(),
    currency text DEFAULT 'BHD', payment_method text DEFAULT 'benefit',
    payment_status text NOT NULL DEFAULT 'unpaid', status text NOT NULL DEFAULT 'pending',
    total numeric NOT NULL DEFAULT 0, advance_paid numeric NOT NULL DEFAULT 0,
    advance_due numeric, benefit_receipt_key text, benefit_verified_at timestamptz,
    benefit_verified_by uuid, benefit_receipt_delete_after timestamptz, updated_at timestamptz
  );
  GRANT SELECT ON public.orders TO authenticated;
  -- What the order asks up front, as the test sets it (the live function reads its rules).
  CREATE FUNCTION public.order_advance_due(p uuid) RETURNS numeric LANGUAGE sql
    AS $$ SELECT advance_due FROM public.orders WHERE id = p $$;
  -- The reports' caller check, as the test says (the live one reads the profile).
  CREATE FUNCTION public.reporting_brand_id(p text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
  BEGIN
    IF NOT public.has_permission('view_financials') THEN RAISE EXCEPTION 'Denied: view_financials permission required'; END IF;
    RETURN current_setting('test.staff_of', true)::uuid;
  END $$;
  GRANT EXECUTE ON FUNCTION public.reporting_brand_id(text) TO authenticated;
  CREATE TABLE public.pending_benefit_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, object_key text NOT NULL UNIQUE,
    uploaded_at timestamptz, consumed_at timestamptz,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
  );
  -- The push queue and installed admins' choices, as their migrations made them.
  CREATE TABLE public.push_notification_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('order_new','order_updated','review_due','review_completed','low_stock','system_failure','booking_new')),
    entity_type text NOT NULL, entity_id uuid, dedupe_key text NOT NULL, title text NOT NULL,
    body text NOT NULL, target_url text, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (brand_id, dedupe_key)
  );
  CREATE TABLE public.web_push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), endpoint text, user_id uuid,
    preferences jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz
  );
  ALTER TABLE public.brands ADD COLUMN name_en text;
  ALTER TABLE public.business_settings ADD COLUMN business_name text, ADD COLUMN email_sender_name text;
  CREATE TABLE public.bookings (order_id uuid, deposit_amount numeric, late_payment_slot_taken_at timestamptz);
`;

export async function giftCardDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(GIFT_CARD_SCHEMA);
  await db.exec(paymentAmounts);
  for (const step of [stepOne, stepTwo, stepThree, stepFour, notices]) await db.exec(step);
  return db;
}

export async function asRole(
  db: PGlite,
  role: "anon" | "authenticated" | "service_role",
  sql: string,
  params: unknown[] = [],
) {
  await db.exec(`SET ROLE ${role}`);
  try {
    return {
      rows: (await db.query<Record<string, unknown>>(sql, params)).rows,
      error: null as string | null,
    };
  } catch (error) {
    return { rows: [] as Record<string, unknown>[], error: (error as Error).message };
  } finally {
    await db.exec("RESET ROLE");
  }
}
