import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import enforcement from "../supabase/migrations/20261003120000_advance_payment_enforcement.sql?raw";

// The advance-payment rule as the database decides it (PGlite): the enforcement
// migration applied to a small copy of the order tables it touches.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";

let db: PGlite;
let admin = false;

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-0000000000aa'::uuid $$;
  CREATE TABLE public.admin_flag (on_ boolean NOT NULL DEFAULT false);
  INSERT INTO public.admin_flag VALUES (false);
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT on_ FROM public.admin_flag $$;
  CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY,
    advance_payment_enabled boolean NOT NULL DEFAULT false,
    advance_payment_percent numeric(5, 2) NOT NULL DEFAULT 30
      CHECK (advance_payment_percent > 0 AND advance_payment_percent <= 100)
  );
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, channel text NOT NULL DEFAULT 'admin',
    payment_method text, total numeric NOT NULL DEFAULT 0, payment_status text NOT NULL DEFAULT 'unpaid',
    status text NOT NULL DEFAULT 'draft', advance_paid numeric NOT NULL DEFAULT 0,
    benefit_receipt_key text, benefit_verified_at timestamptz, benefit_verified_by uuid,
    benefit_receipt_delete_after timestamptz, updated_at timestamptz
  );
  INSERT INTO public.business_settings (brand_id, advance_payment_enabled, advance_payment_percent)
    VALUES ('${BRAND}', true, 30), ('${OTHER}', false, 30);
`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(enforcement);
});

const setAdmin = (on: boolean) => db.query("UPDATE public.admin_flag SET on_ = $1", [on]);
const place = async (brand: string, channel: string, method: string | null, total = 100) =>
  (
    await db.query<{ id: string; advance_percent: string | null }>(
      `INSERT INTO public.orders (brand_id, channel, payment_method, total)
       VALUES ($1, $2, $3, $4) RETURNING id, advance_percent`,
      [brand, channel, method, total],
    )
  ).rows[0];

describe("a storefront order under the advance-payment rule", () => {
  it("keeps the percentage that applied, for a card or a BenefitPay order", async () => {
    expect((await place(BRAND, "storefront", "card")).advance_percent).toBe("30.00");
    expect((await place(BRAND, "storefront", "benefit")).advance_percent).toBe("30.00");
  });

  it("refuses cash on delivery", async () => {
    await expect(place(BRAND, "storefront", "cod")).rejects.toThrow(/ADVANCE_PAYMENT_REQUIRED/);
  });

  it("changes nothing for staff-made orders, or for a store that has the rule off", async () => {
    expect((await place(BRAND, "admin", "cod")).advance_percent).toBeNull();
    expect((await place(OTHER, "storefront", "cod")).advance_percent).toBeNull();
  });

  it("does not move when the store later changes its percentage", async () => {
    const order = await place(BRAND, "storefront", "card");
    await db.query(
      "UPDATE public.business_settings SET advance_payment_percent = 50 WHERE brand_id = $1",
      [BRAND],
    );
    const row = await db.query<{ advance_percent: string }>(
      "SELECT advance_percent FROM public.orders WHERE id = $1",
      [order.id],
    );
    expect(row.rows[0].advance_percent).toBe("30.00");
    expect((await place(BRAND, "storefront", "card")).advance_percent).toBe("50.00");
    await db.query(
      "UPDATE public.business_settings SET advance_payment_percent = 30 WHERE brand_id = $1",
      [BRAND],
    );
  });
});

describe("the advance an order asks for", () => {
  const advance = async (total: number, percent: number | null) =>
    (
      await db.query<{ a: string | null }>("SELECT public.order_advance_amount($1, $2) AS a", [
        total,
        percent,
      ])
    ).rows[0].a;

  it("is the percentage rounded up to the fils, and none for no rule or the whole total", async () => {
    expect(Number(await advance(100, 30))).toBe(30);
    expect(Number(await advance(41.25, 30))).toBe(12.375);
    expect(Number(await advance(10.001, 30))).toBe(3.001);
    expect(await advance(100, null)).toBeNull();
    expect(await advance(100, 100)).toBeNull();
  });
});

describe("approving a BenefitPay receipt", () => {
  const seed = async (percent: string | null, method = "benefit", receipt = "r1.jpg") =>
    (
      await db.query<{ id: string }>(
        `INSERT INTO public.orders (brand_id, channel, payment_method, total, advance_percent,
            benefit_receipt_key, status, payment_status)
         VALUES ($1, 'admin', $2, 100, $3, $4, 'pending_verification', 'unpaid') RETURNING id`,
        [BRAND, method, percent, receipt],
      )
    ).rows[0].id;
  const approve = (id: string) =>
    db.query<{ r: { approved: boolean; advance_only?: boolean; already_paid?: boolean } }>(
      "SELECT public.approve_benefit_payment($1) AS r",
      [id],
    );
  const state = async (id: string) =>
    (
      await db.query<{ payment_status: string; advance_paid: string; status: string }>(
        "SELECT payment_status, advance_paid, status FROM public.orders WHERE id = $1",
        [id],
      )
    ).rows[0];
  const paid = async (id: string) => Number((await state(id)).advance_paid);

  it("records only the advance and leaves the balance due, under the rule", async () => {
    await setAdmin(true);
    const id = await seed("30.00");
    expect((await approve(id)).rows[0].r).toMatchObject({ approved: true, advance_only: true });
    expect(await state(id)).toMatchObject({
      payment_status: "partially_paid",
      status: "confirmed",
    });
    expect(await paid(id)).toBe(30);
  });

  it("marks the whole order paid when no advance rule applied (as before)", async () => {
    await setAdmin(true);
    const id = await seed(null);
    expect((await approve(id)).rows[0].r).toMatchObject({ approved: true, advance_only: false });
    expect(await state(id)).toMatchObject({ payment_status: "paid" });
    expect(await paid(id)).toBe(100);
  });

  it("marks it paid at 100%, and does not approve twice", async () => {
    await setAdmin(true);
    const id = await seed("100.00");
    await approve(id);
    expect((await state(id)).payment_status).toBe("paid");
    expect((await approve(id)).rows[0].r).toMatchObject({ already_paid: true });
    const part = await seed("30.00");
    await approve(part);
    expect((await approve(part)).rows[0].r).toMatchObject({ already_paid: true });
    expect((await state(part)).payment_status).toBe("partially_paid");
  });

  it("is for staff only, and needs a BenefitPay receipt", async () => {
    await setAdmin(false);
    await expect(approve(await seed("30.00"))).rejects.toThrow(/FORBIDDEN/);
    await setAdmin(true);
    await expect(approve(await seed("30.00", "card"))).rejects.toThrow(/BENEFIT_RECEIPT_NOT_FOUND/);
  });
});
