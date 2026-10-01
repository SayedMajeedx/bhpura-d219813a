import { PGlite } from "@electric-sql/pglite";
import migration from "../../supabase/migrations/20261001180000_booking_resource_capacity.sql?raw";
import bookingDiscounts from "../../supabase/migrations/20261002100000_booking_discounts.sql?raw";
import bookingOrders from "../../supabase/migrations/20261002110000_booking_orders.sql?raw";

/**
 * The booking engine, run for real: an in-process Postgres (PGlite) with the
 * tables the engine uses (same columns and checks as the migrations), the
 * unchanged helper functions copied from the live database, and the
 * resource-capacity migration applied on top. Tests seed a store and call
 * the same SQL functions the app calls (request_booking, create_staff_booking,
 * get_service_availability…), so capacity, overlap, buffers and notice are
 * tested as the database decides them, not as a TypeScript copy of them.
 */

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-0000000000aa'::uuid $$;
  CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

  CREATE TABLE public.brands (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY REFERENCES public.brands(id),
    store_vertical text, store_modules jsonb NOT NULL DEFAULT '{}'::jsonb,
    storefront_mode text NOT NULL DEFAULT 'shop'
  );
  CREATE TABLE public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    name text, phone text, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    name text NOT NULL, name_en text, name_ar text, is_active boolean NOT NULL DEFAULT true
  );
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    selling_price numeric NOT NULL DEFAULT 0, duration_minutes integer,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.booking_settings (
    brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
    timezone text NOT NULL DEFAULT 'Asia/Bahrain'
      CHECK ((timestamptz '2000-01-01 00:00+00' AT TIME ZONE timezone) IS NOT NULL),
    daily_capacity integer NOT NULL DEFAULT 1 CHECK (daily_capacity BETWEEN 1 AND 100),
    open_time time NOT NULL DEFAULT '10:00',
    last_start_time time NOT NULL DEFAULT '22:00',
    slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes IN (15, 30, 60)),
    min_duration_minutes integer NOT NULL DEFAULT 180 CHECK (min_duration_minutes BETWEEN 15 AND 1440),
    max_duration_minutes integer NOT NULL DEFAULT 480 CHECK (max_duration_minutes BETWEEN 15 AND 1440),
    duration_step_minutes integer NOT NULL DEFAULT 60 CHECK (duration_step_minutes IN (15, 30, 60, 120)),
    lead_days integer NOT NULL DEFAULT 1 CHECK (lead_days BETWEEN 0 AND 365),
    horizon_days integer NOT NULL DEFAULT 365 CHECK (horizon_days BETWEEN 1 AND 730),
    hold_minutes integer NOT NULL DEFAULT 15 CHECK (hold_minutes BETWEEN 5 AND 120),
    closed_weekdays smallint[] NOT NULL DEFAULT '{}'
      CHECK (closed_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]),
    updated_at timestamptz NOT NULL DEFAULT now(),
    travel_fee_default numeric(12, 3),
    CHECK (max_duration_minutes >= min_duration_minutes),
    CHECK (last_start_time >= open_time)
  );
  CREATE TABLE public.bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    reference text NOT NULL,
    status text NOT NULL
      CHECK (status IN ('hold', 'requested', 'confirmed', 'completed', 'cancelled', 'expired')),
    event_date date NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name text, customer_phone text, customer_email text,
    location jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(location) = 'object'),
    notes text, source text NOT NULL CHECK (source IN ('storefront', 'whatsapp', 'admin')),
    order_id uuid, hold_expires_at timestamptz,
    total numeric(12, 3) NOT NULL DEFAULT 0 CHECK (total >= 0),
    confirmed_at timestamptz, confirmed_by uuid, cancelled_at timestamptz, cancelled_by uuid,
    cancel_reason text, created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    hold_token uuid, deposit_amount numeric(12, 3), travel_fee numeric(12, 3),
    CHECK (ends_at > starts_at),
    CHECK (status <> 'hold' OR hold_expires_at IS NOT NULL),
    UNIQUE (brand_id, reference)
  );
  CREATE TABLE public.booking_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
    name_en text, name_ar text,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100),
    unit_price numeric(12, 3) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    line_total numeric(12, 3) GENERATED ALWAYS AS (quantity * unit_price) STORED
  );
  CREATE TABLE public.booking_blocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    starts_on date NOT NULL, ends_on date NOT NULL, reason text,
    CHECK (ends_on >= starts_on)
  );
  -- Only the type: place_booking_order declares a variable of it (checkout is not run here).
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, customer_id uuid, notes text
  );
  CREATE TABLE public.booking_area_fees (
    brand_id uuid NOT NULL, area_code text NOT NULL, fee numeric(12, 3),
    PRIMARY KEY (brand_id, area_code)
  );
`;

// The order tables the booking-orders migration writes (same columns and checks as live).
const ORDERS_SCHEMA = `
  ALTER TABLE public.business_settings
    ADD COLUMN default_tax_rate numeric NOT NULL DEFAULT 0,
    ADD COLUMN vat_inclusive boolean NOT NULL DEFAULT false,
    ADD COLUMN currency text NOT NULL DEFAULT 'BHD';
  ALTER TABLE public.orders
    ADD COLUMN user_id uuid,
    ADD COLUMN invoice_number integer NOT NULL DEFAULT 0,
    ADD COLUMN status text NOT NULL DEFAULT 'draft',
    ADD COLUMN fulfillment_method text NOT NULL DEFAULT 'delivery'
      CHECK (fulfillment_method IN ('delivery', 'pickup', 'digital', 'appointment')),
    ADD COLUMN customer_name_snapshot text, ADD COLUMN customer_phone_snapshot text,
    ADD COLUMN customer_email_snapshot text,
    ADD COLUMN subtotal numeric NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    ADD COLUMN discount numeric NOT NULL DEFAULT 0 CHECK (discount >= 0),
    ADD COLUMN shipping numeric NOT NULL DEFAULT 0 CHECK (shipping >= 0),
    ADD COLUMN tax_rate numeric NOT NULL DEFAULT 0,
    ADD COLUMN tax_amount numeric NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    ADD COLUMN total numeric NOT NULL DEFAULT 0 CHECK (total >= 0),
    ADD COLUMN currency text NOT NULL DEFAULT 'BHD',
    ADD COLUMN order_date date NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid',
    ADD COLUMN advance_paid numeric NOT NULL DEFAULT 0,
    ADD COLUMN channel text NOT NULL DEFAULT 'admin';
  CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    brand_id uuid NOT NULL, user_id uuid, product_id uuid, variant_id uuid,
    description text NOT NULL, quantity integer NOT NULL DEFAULT 1,
    unit_price numeric NOT NULL DEFAULT 0, line_total numeric NOT NULL DEFAULT 0,
    location text NOT NULL DEFAULT 'main'
  );
  CREATE SEQUENCE public.invoice_seq START 1001;
  CREATE FUNCTION public.allocate_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.invoice_number = 0 THEN NEW.invoice_number := nextval('public.invoice_seq'); END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER allocate_invoice BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.allocate_invoice();
`;

// The helpers the migration does not change, as they are in the live database.
const UNCHANGED_HELPERS = `
  CREATE FUNCTION public.bookings_enabled(p_brand_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
    SELECT EXISTS (SELECT 1 FROM public.booking_settings WHERE brand_id = p_brand_id)
      AND COALESCE(
        (SELECT CASE
                  WHEN jsonb_typeof(bs.store_modules -> 'bookings') = 'boolean'
                    THEN (bs.store_modules ->> 'bookings')::boolean
                  ELSE bs.store_vertical = 'services'
                END
           FROM public.business_settings bs WHERE bs.brand_id = p_brand_id),
        false);
  $function$;

  CREATE FUNCTION public.next_booking_reference(p_brand_id uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
  DECLARE v_ref text;
  BEGIN
    LOOP
      v_ref := 'BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.bookings WHERE brand_id = p_brand_id AND reference = v_ref);
    END LOOP;
    RETURN v_ref;
  END;
  $function$;

  CREATE FUNCTION public.booking_travel_fee(p_brand_id uuid, p_area_code text) RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
    SELECT COALESCE(
      (SELECT f.fee FROM public.booking_area_fees f
        WHERE f.brand_id = p_brand_id AND f.area_code = NULLIF(btrim(p_area_code), '')),
      (SELECT s.travel_fee_default FROM public.booking_settings s WHERE s.brand_id = p_brand_id));
  $function$;

  CREATE FUNCTION public.booking_window(
    p_settings booking_settings, p_day date, p_start time without time zone, p_duration_minutes integer)
  RETURNS TABLE(starts_at timestamp with time zone, ends_at timestamp with time zone)
  LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $function$
  BEGIN
    IF p_start IS NULL OR p_start < p_settings.open_time OR p_start > p_settings.last_start_time
       OR (extract(epoch FROM p_start)::integer / 60) % p_settings.slot_minutes <> 0 THEN
      RAISE EXCEPTION 'BOOKING_TIME_OUTSIDE_HOURS' USING ERRCODE = '22023';
    END IF;
    IF p_duration_minutes IS NULL
       OR p_duration_minutes < p_settings.min_duration_minutes
       OR p_duration_minutes > p_settings.max_duration_minutes
       OR (p_duration_minutes - p_settings.min_duration_minutes) % p_settings.duration_step_minutes <> 0 THEN
      RAISE EXCEPTION 'BOOKING_DURATION_INVALID' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT
      (p_day + p_start) AT TIME ZONE p_settings.timezone,
      (p_day + p_start + make_interval(mins => p_duration_minutes)) AT TIME ZONE p_settings.timezone;
  END;
  $function$;

  CREATE FUNCTION public.lock_booking_settings_for_staff(p_brand_id uuid) RETURNS booking_settings
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
  DECLARE v_settings public.booking_settings;
  BEGIN
    IF NOT (public.can_access_brand(p_brand_id) AND public.has_permission('manage_orders')) THEN
      RAISE EXCEPTION 'BOOKING_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_settings FROM public.booking_settings WHERE brand_id = p_brand_id FOR UPDATE;
    IF NOT FOUND OR NOT public.bookings_enabled(p_brand_id) THEN
      RAISE EXCEPTION 'BOOKINGS_DISABLED' USING ERRCODE = '22023';
    END IF;
    RETURN v_settings;
  END;
  $function$;

  -- hold_booking and place_booking_order are not run here (checkout needs the
  -- orders tables); the migration defines the ones that are.
`;

export type StoreRules = {
  dailyCapacity?: number;
  leadDays?: number;
  minDuration?: number;
  maxDuration?: number;
  step?: number;
  openTime?: string;
  lastStart?: string;
  slot?: number;
  closedWeekdays?: number[];
  holdMinutes?: number;
};

export type ServiceRules = {
  name?: string;
  capacity?: number | null;
  scope?: "day" | "time";
  buffer?: number;
  notice?: number | null;
  active?: boolean;
};

export type Item = {
  product_id: string;
  variant_id?: string;
  quantity?: number;
  unit_price?: number;
  name_en?: string;
};

const asJson = (value: unknown) => JSON.stringify(value);

export async function createEngineDb() {
  const pg = new PGlite();
  await pg.exec(SCHEMA);
  await pg.exec(ORDERS_SCHEMA);
  await pg.exec(UNCHANGED_HELPERS);
  await pg.exec(migration);
  // Booking-time discounts, then every booking's order, as in the live database.
  await pg.exec(bookingDiscounts);
  await pg.exec(bookingOrders);

  const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await pg.query<T>(sql, params)).rows;
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await rows<T>(sql, params))[0];

  const todayRow = await one<{ d: string }>(
    "select to_char((now() at time zone 'Asia/Bahrain')::date, 'YYYY-MM-DD') as d",
  );
  /** A day `offset` days from today in Bahrain, as YYYY-MM-DD. */
  const day = (offset: number) => {
    const base = new Date(`${todayRow.d}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + offset);
    return base.toISOString().slice(0, 10);
  };

  async function store(rules: StoreRules = {}) {
    const brand = await one<{ id: string }>("insert into brands default values returning id");
    await pg.query(
      "insert into business_settings (brand_id, store_vertical) values ($1, 'services')",
      [brand.id],
    );
    await pg.query(
      `insert into booking_settings (brand_id, daily_capacity, lead_days, min_duration_minutes,
         max_duration_minutes, duration_step_minutes, open_time, last_start_time, slot_minutes,
         closed_weekdays, hold_minutes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::smallint[], $11)`,
      [
        brand.id,
        rules.dailyCapacity ?? 1,
        rules.leadDays ?? 1,
        rules.minDuration ?? 60,
        rules.maxDuration ?? 480,
        rules.step ?? 60,
        rules.openTime ?? "10:00",
        rules.lastStart ?? "22:00",
        rules.slot ?? 30,
        `{${(rules.closedWeekdays ?? []).join(",")}}`,
        rules.holdMinutes ?? 15,
      ],
    );
    return brand.id;
  }

  /** A service with one fixed-price variant (so it can be booked for any length). */
  async function service(brandId: string, rules: ServiceRules = {}) {
    const product = await one<{ id: string }>(
      `insert into products (brand_id, name, name_en, is_active, booking_capacity, booking_scope,
         booking_buffer_minutes, booking_notice_hours)
       values ($1, $2, $2, $3, $4, $5, $6, $7) returning id`,
      [
        brandId,
        rules.name ?? "Service",
        rules.active ?? true,
        rules.capacity ?? null,
        rules.scope ?? "day",
        rules.buffer ?? 0,
        rules.notice ?? null,
      ],
    );
    const variant = await one<{ id: string }>(
      "insert into product_variants (brand_id, product_id, selling_price) values ($1, $2, 40) returning id",
      [brandId, product.id],
    );
    return { id: product.id, variantId: variant.id };
  }

  const items = (list: Item[]) =>
    asJson(list.map((item) => ({ quantity: 1, unit_price: 40, ...item })));

  async function staff(
    brandId: string,
    dayIso: string,
    start: string,
    minutes: number,
    list: Item[],
    options: { status?: string; overbook?: boolean } = {},
  ) {
    return one<{ id: string; status: string }>(
      `select * from create_staff_booking($1, $2::date, $3::time, $4, $5::jsonb, $6::jsonb,
         '{}'::jsonb, null, $7, 'admin', $8)`,
      [
        brandId,
        dayIso,
        start,
        minutes,
        asJson({ name: "Ali", phone: "39990016" }),
        items(list),
        options.status ?? "confirmed",
        options.overbook ?? false,
      ],
    );
  }

  async function request(
    brandId: string,
    dayIso: string,
    start: string,
    minutes: number,
    list: Item[],
  ) {
    return one<{ request_booking: Record<string, unknown> }>(
      `select request_booking($1, $2::date, $3::time, $4, $5::jsonb, $6::jsonb, '{}'::jsonb, null)`,
      [brandId, dayIso, start, minutes, items(list), asJson({ name: "Sara", phone: "39990017" })],
    ).then((row) => row.request_booking);
  }

  async function availability(
    brandId: string,
    productIds: string[],
    from: string,
    to: string,
    minutes?: number,
  ) {
    return rows<{ product_id: string; day: string; state: string; remaining: number | null }>(
      `select product_id, to_char(day, 'YYYY-MM-DD') as day, state, remaining
         from get_service_availability($1, $2::uuid[], $3::date, $4::date, $5)
        order by product_id, day`,
      [brandId, `{${productIds.join(",")}}`, from, to, minutes ?? null],
    );
  }

  async function starts(brandId: string, dayIso: string, productIds: string[], minutes: number) {
    return rows<{ start_time: string; free: boolean; reason: string | null }>(
      `select to_char(start_time, 'HH24:MI') as start_time, free, reason
         from get_service_free_starts($1, $2::date, $3::uuid[], $4)`,
      [brandId, dayIso, `{${productIds.join(",")}}`, minutes],
    );
  }

  /** The store-level state of a day, as the database decides it. */
  async function dayState(brandId: string, dayIso: string, staffView = true) {
    return one<{ state: string; remaining: number | null }>(
      `select state, remaining from booking_day_state(
         (select s from booking_settings s where s.brand_id = $1), $2::date, null, $3)`,
      [brandId, dayIso, staffView],
    );
  }

  /** The database's refusal, as the app sees it: the exception's message (and detail). */
  async function refusal(promise: Promise<unknown>) {
    try {
      await promise;
      return null;
    } catch (error) {
      const failure = error as { message: string; detail?: string };
      return { message: failure.message, detail: failure.detail };
    }
  }

  return {
    pg,
    rows,
    one,
    day,
    store,
    service,
    staff,
    request,
    availability,
    starts,
    dayState,
    refusal,
    items,
    asJson,
  };
}

export type EngineDb = Awaited<ReturnType<typeof createEngineDb>>;
