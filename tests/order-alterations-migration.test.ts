import { beforeAll, describe, expect, it, vi } from "vitest";
import ordersMigration from "../supabase/migrations/20261019100000_supplier_orders_receive_into_stock.sql?raw";
import paymentsMigration from "../supabase/migrations/20261019110000_supplier_payments.sql?raw";
import piecesMigration from "../supabase/migrations/20261020100000_customer_pieces_to_supplier.sql?raw";
import afterMigration from "../supabase/migrations/20261021100000_customer_pieces_cancel_fix_alteration.sql?raw";
import vendorLanguage from "../supabase/migrations/20261115100000_vendor_language.sql?raw";
import withoutPrice from "../supabase/migrations/20261116100000_send_to_workshop_without_price.sql?raw";
import bookingDiscounts from "../supabase/migrations/20261002100000_booking_discounts.sql?raw";
import paymentState from "../supabase/migrations/20261012130000_payment_state_is_one_fact.sql?raw";
import migration from "../supabase/migrations/20261117100000_order_alterations.sql?raw";
import { BRAND, OTHER, openSupplierOrdersDb } from "./helpers/supplier-orders-db";
import { alterationTarget } from "../src/features/orders/lib/alterations";
import { childVerticals } from "../src/lib/verticals/registry";

// Alterations (migration 20261117100000, step 3 of docs/workshop-flow-plan.md) in a real
// Postgres with the real sending and receiving functions, the order's real repricing and its
// payment rule: the customer's price on the open order or on a new linked one, a free fix with
// no price, the supplier's cost on the line that charges it, the store's own workshop, cancelling,
// permissions and one request written once.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let ctx: Awaited<ReturnType<typeof openSupplierOrdersDb>>;
const ORDER_STAFF = "manage_orders";
const FINANCE = "manage_orders,view_financials";

const functionOf = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tag = /\$(\w*)\$/.exec(sql.slice(start))![0];
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return `${sql.slice(start, end + tag.length)};`;
};

// What the alterations touch, as live: the order's money and customer, a line's names and
// price, a product's kind, the store's settings, and what earlier migrations added.
const LIVE_COLUMNS = `
  ALTER TABLE public.purchase_order_receipts ADD COLUMN IF NOT EXISTS undone_at timestamptz;
  ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS phone text;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'product';
  ALTER TABLE public.orders
    ADD COLUMN user_id uuid, ADD COLUMN invoice_number integer NOT NULL DEFAULT 0,
    ADD COLUMN channel text NOT NULL DEFAULT 'admin', ADD COLUMN customer_id uuid,
    ADD COLUMN customer_name_snapshot text, ADD COLUMN customer_phone_snapshot text,
    ADD COLUMN customer_email_snapshot text, ADD COLUMN currency text DEFAULT 'BHD',
    ADD COLUMN language text, ADD COLUMN tax_rate numeric NOT NULL DEFAULT 0,
    ADD COLUMN subtotal numeric NOT NULL DEFAULT 0, ADD COLUMN discount numeric NOT NULL DEFAULT 0,
    ADD COLUMN shipping numeric NOT NULL DEFAULT 0, ADD COLUMN tax_amount numeric NOT NULL DEFAULT 0,
    ADD COLUMN total numeric NOT NULL DEFAULT 0, ADD COLUMN advance_paid numeric NOT NULL DEFAULT 0,
    ADD COLUMN fulfillment_method text, ADD COLUMN branch_id uuid;
  ALTER TABLE public.order_items
    ADD COLUMN user_id uuid, ADD COLUMN name_en text, ADD COLUMN name_ar text,
    ADD COLUMN unit_price numeric NOT NULL DEFAULT 0;
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY, store_vertical text, vat_number text,
    default_tax_rate numeric DEFAULT 0, vat_inclusive boolean DEFAULT false
  );
  INSERT INTO public.business_settings (brand_id, store_vertical, vat_number, default_tax_rate)
    VALUES ('${BRAND}', 'abayas', 'VAT-1', 10), ('${OTHER}', 'food', NULL, 0);
`;
const REPRICE = `${functionOf(bookingDiscounts, "reprice_order_totals")}
  ${functionOf(paymentState, "orders_payment_amounts")}
  CREATE TRIGGER trg_orders_payment_amounts BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_payment_amounts();`;

type OrderRow = {
  status: string;
  fulfillment_status: string;
  payment_status: string;
  subtotal: string;
  tax_amount: string;
  total: string;
  advance_paid: string;
  related_order_id: string | null;
  relation: string | null;
  customer_name_snapshot: string | null;
};
const orderOf = (id: string) =>
  ctx.one<OrderRow>("SELECT * FROM public.orders WHERE id = $1", [id]);
const alterationOf = (id: string) =>
  ctx.one<{
    status: string;
    order_id: string;
    charge_item_id: string | null;
    purchase_order_item_id: string | null;
    customer_charge: string;
    changes: unknown[];
  }>("SELECT * FROM public.order_alterations WHERE id = $1", [id]);
const lineOf = (id: string) =>
  ctx.one<{ unit_cost: string | null; unit_price: string; name_en: string; name_ar: string }>(
    "SELECT unit_cost, unit_price, name_en, name_ar FROM public.order_items WHERE id = $1",
    [id],
  );

/** A customer's order of 100 (10% VAT on top), paid, at this stage, with one piece. */
async function customerOrder({
  stage = "NEEDS_PACKING",
  status = "confirmed",
  location = "main",
} = {}) {
  await ctx.asServer();
  const { id } = await ctx.one<{ id: string }>(
    `INSERT INTO public.orders (brand_id, status, fulfillment_status, payment_status, payment_method,
       subtotal, tax_rate, tax_amount, total, advance_paid, customer_name_snapshot, currency)
     VALUES ($1, $2, $3, 'paid', 'cod', 100, 10, 10, 110, 110, 'Maryam', 'BHD') RETURNING id`,
    [BRAND, status, stage],
  );
  const line = await ctx.one<{ id: string }>(
    `INSERT INTO public.order_items (order_id, brand_id, product_id, variant_id, quantity, description,
       name_en, name_ar, location, unit_price, unit_cost)
     VALUES ($1, $2, $3, $4, 1, 'Black abaya', 'Black abaya', 'عباية سوداء', $5, 100, 30) RETURNING id`,
    [id, BRAND, ctx.abaya, ctx.small, location],
  );
  return { id, line: line.id };
}

let requests = 0;
const nextRequest = () => `00000000-0000-4000-a000-${String(++requests).padStart(12, "0")}`;
const LENGTH = [{ key: "length", label_en: "Length", label_ar: "الطول", from: "56", to: "54" }];

async function alter(
  line: string,
  {
    kind = "alteration",
    madeBy = "supplier",
    charge = 5 as number | null,
    cost = 3 as number | null,
    po = null as string | null,
    request = nextRequest(),
    changes = LENGTH as unknown[],
    note = null as string | null,
  } = {},
) {
  return (
    await ctx.db.query<{ create_order_alteration: Record<string, unknown> }>(
      `SELECT public.create_order_alteration($1, $2, $3::jsonb, $4, $5, $6, $7, '2026-11-20', $8, $9, $10)`,
      [
        line,
        kind,
        JSON.stringify(changes),
        note,
        madeBy,
        madeBy === "supplier" ? ctx.tailor : null,
        po,
        cost,
        charge,
        request,
      ],
    )
  ).rows[0].create_order_alteration as {
    id: string;
    order_id: string;
    po_id: string | null;
    linked: boolean;
    repeated: boolean;
  };
}

beforeAll(async () => {
  ctx = await openSupplierOrdersDb([
    ordersMigration,
    paymentsMigration,
    piecesMigration,
    afterMigration,
    LIVE_COLUMNS,
    vendorLanguage,
    withoutPrice,
    REPRICE,
    migration,
  ]);
});

describe("the store's setting", () => {
  it("is on for the fashion family and off for the rest, and a new store takes the same", async () => {
    await ctx.asServer();
    const of = async (brand: string) =>
      (
        await ctx.one<{ offers_alterations: boolean }>(
          "SELECT offers_alterations FROM public.business_settings WHERE brand_id = $1",
          [brand],
        )
      ).offers_alterations;
    expect(await of(BRAND)).toBe(true);
    expect(await of(OTHER)).toBe(false);
    await ctx.db.query("INSERT INTO public.brands VALUES ('00000000-0000-4000-8000-0000000000b3')");
    await ctx.db.query(
      "INSERT INTO public.business_settings (brand_id, store_vertical) VALUES ('00000000-0000-4000-8000-0000000000b3', 'fashion')",
    );
    expect(await of("00000000-0000-4000-8000-0000000000b3")).toBe(true);
  });

  it("names every vertical of the fashion family the registry has", () => {
    // The migration lists them by hand: a new child of fashion must be added there too.
    expect(["fashion", ...childVerticals("fashion")].sort()).toEqual(["abayas", "fashion"]);
  });
});

describe("where the customer pays", () => {
  it("is the database's rule and the screen's alike, over every stage", async () => {
    const statuses = ["confirmed", "completed", "cancelled", "returned", "sent_to_tailor", null];
    const stages = ["NEEDS_PACKING", "DELIVERED", "PICKED_UP", "COMPLETED", "SHIPPED", null];
    for (const status of statuses) {
      for (const stage of stages) {
        const { order_alteration_target: sql } = await ctx.one<{ order_alteration_target: string }>(
          "SELECT public.order_alteration_target($1, $2)",
          [status, stage],
        );
        expect(sql, `${status} / ${stage}`).toBe(
          alterationTarget({ status, fulfillment_status: stage }),
        );
      }
    }
  });

  it("on an open order: a new priced line, the tax on it, and the paid order owing it", async () => {
    const order = await customerOrder();
    await ctx.asStaff(FINANCE);
    const made = await alter(order.line);
    expect(made.linked).toBe(false);
    expect(made.order_id).toBe(order.id);
    await ctx.asServer();
    const row = await orderOf(order.id);
    expect(Number(row.subtotal)).toBe(105);
    expect(Number(row.tax_amount)).toBe(10.5);
    expect(Number(row.total)).toBe(115.5);
    expect(row.payment_status).toBe("partially_paid");
    expect(Number(row.advance_paid)).toBe(110);
    const alteration = await alterationOf(made.id);
    expect(alteration.status).toBe("at_workshop");
    const charge = await lineOf(alteration.charge_item_id!);
    expect(Number(charge.unit_price)).toBe(5);
    expect(charge.name_en).toBe("Alteration: Black abaya");
    expect(charge.name_ar).toBe("تعديل: عباية سوداء");
  });

  it("on an order handed over: a new order linked to it, with the customer and its own price", async () => {
    const order = await customerOrder({ stage: "DELIVERED", status: "completed" });
    await ctx.asStaff(ORDER_STAFF);
    const made = await alter(order.line, { cost: null });
    expect(made.linked).toBe(true);
    await ctx.asServer();
    const original = await orderOf(order.id);
    expect(Number(original.total)).toBe(110);
    expect(original.payment_status).toBe("paid");
    const linked = await orderOf(made.order_id);
    expect(linked).toMatchObject({
      related_order_id: order.id,
      relation: "alteration",
      customer_name_snapshot: "Maryam",
      payment_status: "unpaid",
      fulfillment_status: "SENT_TO_TAILOR",
    });
    expect(Number(linked.subtotal)).toBe(5);
    expect(Number(linked.total)).toBe(5.5);
  });

  it("a free fix: no line and no order, only for a piece the store had made", async () => {
    const ready = await customerOrder();
    await ctx.asStaff(FINANCE);
    await expect(alter(ready.line, { kind: "fix", charge: 0 })).rejects.toThrow("NOTHING_TO_FIX");
    const custom = await customerOrder({ location: "custom" });
    await ctx.asStaff(FINANCE);
    const made = await alter(custom.line, { kind: "fix", charge: 9 });
    await ctx.asServer();
    expect(Number((await orderOf(custom.id)).total)).toBe(110);
    const alteration = await alterationOf(made.id);
    expect(alteration.charge_item_id).toBeNull();
    expect(Number(alteration.customer_charge)).toBe(0);
  });
});

describe("the supplier's cost", () => {
  it("lands on the line that charges it when the piece is received, and the alteration is back", async () => {
    const order = await customerOrder({ stage: "DELIVERED", status: "completed" });
    await ctx.asStaff(FINANCE);
    const made = await alter(order.line, { cost: 3 });
    const alteration = await alterationOf(made.id);
    await ctx.receive(made.po_id!, [[alteration.purchase_order_item_id!, 1]]);
    await ctx.asServer();
    expect(Number((await lineOf(alteration.charge_item_id!)).unit_cost)).toBe(3);
    // The piece's own line, last month's sale, keeps its cost.
    expect(Number((await lineOf(order.line)).unit_cost)).toBe(30);
    expect((await alterationOf(made.id)).status).toBe("back");
    expect((await orderOf(made.order_id)).fulfillment_status).toBe("RECEIVED_FROM_TAILOR");
  });

  it("sent with no price by order staff, lands there once finance staff add it", async () => {
    const order = await customerOrder();
    await ctx.asStaff(ORDER_STAFF);
    const made = await alter(order.line, { cost: 99 });
    const alteration = await alterationOf(made.id);
    await ctx.asServer();
    const { price_pending, unit_cost } = await ctx.one<{
      price_pending: boolean;
      unit_cost: string;
    }>("SELECT price_pending, unit_cost FROM public.purchase_order_items WHERE id = $1", [
      alteration.purchase_order_item_id,
    ]);
    expect(price_pending).toBe(true);
    expect(Number(unit_cost)).toBe(0);
    await ctx.asStaff(FINANCE);
    await ctx.receive(made.po_id!, [[alteration.purchase_order_item_id!, 1]]);
    await ctx.db.query("UPDATE public.purchase_order_items SET unit_cost = 4 WHERE id = $1", [
      alteration.purchase_order_item_id,
    ]);
    await ctx.asServer();
    expect(Number((await lineOf(alteration.charge_item_id!)).unit_cost)).toBe(4);
    expect(Number((await lineOf(order.line)).unit_cost)).toBe(30);
  });

  it("writes the changes for the supplier to read", async () => {
    const order = await customerOrder();
    await ctx.asStaff(FINANCE);
    const made = await alter(order.line, { note: "Take in the waist" });
    await ctx.asServer();
    const { work_note } = await ctx.one<{ work_note: string }>(
      "SELECT work_note FROM public.purchase_order_items i JOIN public.order_alterations a ON a.purchase_order_item_id = i.id WHERE a.id = $1",
      [made.id],
    );
    expect(work_note).toBe("Length: 56 → 54 · Take in the waist");
  });
});

describe("the store's own workshop", () => {
  it("puts nothing on a supplier's order, and is marked back and handed over by staff", async () => {
    const order = await customerOrder();
    await ctx.asStaff(ORDER_STAFF);
    const made = await alter(order.line, { madeBy: "in_house" });
    expect(made.po_id).toBeNull();
    const status = (s: string) =>
      ctx.db.query("SELECT public.set_order_alteration_status($1, $2)", [made.id, s]);
    await expect(status("handed_over")).rejects.toThrow("ALTERATION_TRANSITION_INVALID");
    await status("back");
    await status("handed_over");
    await ctx.asServer();
    expect((await alterationOf(made.id)).status).toBe("handed_over");
  });

  it("a supplier's piece is back only when it is received", async () => {
    const order = await customerOrder();
    await ctx.asStaff(FINANCE);
    const made = await alter(order.line);
    await expect(
      ctx.db.query("SELECT public.set_order_alteration_status($1, 'back')", [made.id]),
    ).rejects.toThrow("RECEIVE_ON_SUPPLIER_ORDER");
  });
});

describe("cancelling", () => {
  it("takes the price off the open order and the line off the supplier's order", async () => {
    const order = await customerOrder();
    await ctx.asStaff(FINANCE);
    const made = await alter(order.line);
    const { purchase_order_item_id } = await alterationOf(made.id);
    await ctx.db.query("SELECT public.set_order_alteration_status($1, 'cancelled')", [made.id]);
    await ctx.asServer();
    const row = await orderOf(order.id);
    expect(Number(row.total)).toBe(110);
    expect(row.payment_status).toBe("paid");
    const { count } = await ctx.one<{ count: string }>(
      "SELECT count(*) FROM public.purchase_order_items WHERE id = $1",
      [purchase_order_item_id],
    );
    expect(Number(count)).toBe(0);
    expect((await alterationOf(made.id)).status).toBe("cancelled");
  });

  it("cancels the alteration's own order, and refuses once the piece is back", async () => {
    const order = await customerOrder({ stage: "DELIVERED", status: "completed" });
    await ctx.asStaff(FINANCE);
    const made = await alter(order.line);
    await ctx.db.query("SELECT public.set_order_alteration_status($1, 'cancelled')", [made.id]);
    await ctx.asServer();
    expect((await orderOf(made.order_id)).status).toBe("cancelled");

    const again = await alter(order.line).catch(() => null);
    expect(again).toBeNull(); // as server: no session
    await ctx.asStaff(FINANCE);
    const second = await alter(order.line);
    const { purchase_order_item_id } = await alterationOf(second.id);
    await ctx.receive(second.po_id!, [[purchase_order_item_id!, 1]]);
    await expect(
      ctx.db.query("SELECT public.set_order_alteration_status($1, 'cancelled')", [second.id]),
    ).rejects.toThrow("ALTERATION_ALREADY_BACK");
  });
});

describe("what is refused", () => {
  it("a second alteration while one is out, a cancelled order, a service, and an empty change", async () => {
    const order = await customerOrder();
    await ctx.asStaff(FINANCE);
    await alter(order.line, { madeBy: "in_house" });
    await expect(alter(order.line, { madeBy: "in_house" })).rejects.toThrow(
      "ALTERATION_ALREADY_OUT",
    );

    const cancelled = await customerOrder({ status: "cancelled" });
    await ctx.asStaff(FINANCE);
    await expect(alter(cancelled.line)).rejects.toThrow("ORDER_CANCELLED");

    const other = await customerOrder();
    await ctx.asStaff(FINANCE);
    await expect(alter(other.line, { changes: [], note: " " })).rejects.toThrow(
      "NOTHING_TO_CHANGE",
    );

    await ctx.asServer();
    await ctx.db.query("UPDATE public.products SET item_kind = 'service' WHERE id = $1", [
      ctx.abaya,
    ]);
    await ctx.asStaff(FINANCE);
    await expect(alter(other.line)).rejects.toThrow("NOT_A_PIECE");
    await ctx.asServer();
    await ctx.db.query("UPDATE public.products SET item_kind = 'product' WHERE id = $1", [
      ctx.abaya,
    ]);
  });

  it("staff who do not handle orders, another store's staff, and a store that does no alterations", async () => {
    const order = await customerOrder();
    await ctx.asStaff("manage_inventory,view_financials");
    await expect(alter(order.line)).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asStaff(FINANCE, OTHER);
    await expect(alter(order.line)).rejects.toThrow("NOT_AUTHORIZED");

    await ctx.asServer();
    await ctx.db.query(
      "UPDATE public.business_settings SET offers_alterations = false WHERE brand_id = $1",
      [BRAND],
    );
    await ctx.asStaff(FINANCE);
    await expect(alter(order.line)).rejects.toThrow("ALTERATIONS_OFF");
    await ctx.asServer();
    await ctx.db.query(
      "UPDATE public.business_settings SET offers_alterations = true WHERE brand_id = $1",
      [BRAND],
    );
  });

  it("keeps the lines an alteration points to while it stands, not when the order goes", async () => {
    const order = await customerOrder();
    await ctx.asStaff(FINANCE);
    const made = await alter(order.line, { madeBy: "in_house" });
    const { charge_item_id } = await alterationOf(made.id);
    // The order editor saves by replacing every line.
    await expect(
      ctx.db.query("DELETE FROM public.order_items WHERE order_id = $1", [order.id]),
    ).rejects.toThrow("ORDER_LINE_HAS_ALTERATION");
    await expect(
      ctx.db.query("DELETE FROM public.order_items WHERE id = $1", [charge_item_id]),
    ).rejects.toThrow("ORDER_LINE_HAS_ALTERATION");
    // Deleting the order takes its lines and its alterations.
    await ctx.asServer();
    await ctx.db.query("DELETE FROM public.orders WHERE id = $1", [order.id]);
    const { count } = await ctx.one<{ count: string }>(
      "SELECT count(*) FROM public.order_alterations WHERE id = $1",
      [made.id],
    );
    expect(Number(count)).toBe(0);
  });

  it("writes one request once", async () => {
    const order = await customerOrder();
    await ctx.asStaff(FINANCE);
    const request = nextRequest();
    const first = await alter(order.line, { request, madeBy: "in_house" });
    const second = await alter(order.line, { request, madeBy: "in_house" });
    expect(second).toMatchObject({ id: first.id, repeated: true });
    await ctx.asServer();
    expect(Number((await orderOf(order.id)).subtotal)).toBe(105);
  });

  it("keeps a browser from writing an order's link or an alteration", async () => {
    const order = await customerOrder();
    await ctx.asStaff(FINANCE);
    await ctx.db.query(
      "UPDATE public.orders SET related_order_id = id, relation = 'alteration' WHERE id = $1",
      [order.id],
    );
    await ctx.asServer();
    expect((await orderOf(order.id)).related_order_id).toBeNull();
    // Only a read policy: a browser's write is refused, whatever it is granted.
    await ctx.asStaff(FINANCE);
    await expect(
      ctx.db.query(
        `INSERT INTO public.order_alterations (brand_id, order_id, source_order_id, source_item_id, kind, made_by)
         VALUES ($1, $2, $2, $3, 'fix', 'in_house')`,
        [BRAND, order.id, order.line],
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
