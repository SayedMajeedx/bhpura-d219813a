import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import ordersMigration from "../supabase/migrations/20261019100000_supplier_orders_receive_into_stock.sql?raw";
import paymentsMigration from "../supabase/migrations/20261019110000_supplier_payments.sql?raw";
import piecesMigration from "../supabase/migrations/20261020100000_customer_pieces_to_supplier.sql?raw";
import afterMigration from "../supabase/migrations/20261021100000_customer_pieces_cancel_fix_alteration.sql?raw";
import vendorLanguage from "../supabase/migrations/20261115100000_vendor_language.sql?raw";
import withoutPrice from "../supabase/migrations/20261116100000_send_to_workshop_without_price.sql?raw";
import bookingDiscounts from "../supabase/migrations/20261002100000_booking_discounts.sql?raw";
import paymentState from "../supabase/migrations/20261012130000_payment_state_is_one_fact.sql?raw";
import alterations from "../supabase/migrations/20261117100000_order_alterations.sql?raw";
import madeToMeasure from "../supabase/migrations/20261118100000_made_to_measure_lines.sql?raw";
import stateMachine from "../supabase/migrations/20260926120000_order_inventory_state_machine.sql?raw";
import madeToOrderLimit from "../supabase/migrations/20261010110000_made_to_order_limit.sql?raw";
import migration from "../supabase/migrations/20261119100000_order_line_revisions.sql?raw";
import { BRAND, OTHER, openSupplierOrdersDb } from "./helpers/supplier-orders-db";
import { lineFieldChanges } from "../src/features/orders/lib/line-revisions";

// Changing a custom order after it was placed (migration 20261119100000, step 4 of
// docs/workshop-flow-plan.md) in a real Postgres, with the real sending, receiving and
// alteration functions: a change before the piece is sent, a change while a supplier holds it
// (revision 2, the supplier's sheet behind until they are told), refused once the piece is back
// or the order cancelled, permissions, one request written once, the editor's save keeping its
// lines (and recording a change it makes), and, with the real stock engine, stock moving by the
// lines exactly as before.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let ctx: Awaited<ReturnType<typeof openSupplierOrdersDb>>;
const ORDER_STAFF = "manage_orders";
const FINANCE = "manage_orders,manage_inventory,view_financials";

const functionOf = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tag = /\$(\w*)\$/.exec(sql.slice(start))![0];
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return `${sql.slice(start, end + tag.length)};`;
};

// What the change touches, as live (the alterations' test's columns, and a line's answers).
const LIVE_COLUMNS = `
  ALTER TABLE public.purchase_order_receipts ADD COLUMN IF NOT EXISTS undone_at timestamptz;
  ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS phone text;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'product';
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '[]'::jsonb;
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
    ADD COLUMN unit_price numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS selected_variant jsonb,
    ADD COLUMN IF NOT EXISTS custom_field_values jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN customizations jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN customization_total numeric NOT NULL DEFAULT 0,
    ADD COLUMN line_total numeric NOT NULL DEFAULT 0, ADD COLUMN original_price numeric;
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY, store_vertical text, vat_number text,
    default_tax_rate numeric DEFAULT 0, vat_inclusive boolean DEFAULT false
  );
  INSERT INTO public.business_settings (brand_id, store_vertical) VALUES ('${BRAND}', 'abayas');
  CREATE TABLE public.activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, order_id uuid,
    user_id uuid, action text NOT NULL, message_ar text NOT NULL, message_en text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
  );
  -- The stock engine is run for real in the last part of this file; here it only says it ran.
  CREATE TABLE public.transitions (order_id uuid);
  CREATE FUNCTION public.order_inventory_transition(p_order_id uuid) RETURNS void
    LANGUAGE sql AS $$ INSERT INTO public.transitions VALUES (p_order_id) $$;
`;
const REPRICE = `${functionOf(bookingDiscounts, "reprice_order_totals")}
  ${functionOf(paymentState, "orders_payment_amounts")}
  CREATE TRIGGER trg_orders_payment_amounts BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_payment_amounts();`;

const PASSPORT = [
  { key: "fit_passport_unit", label_ar: "وحدة القياس", label_en: "Length unit", value: "in" },
  { key: "fit_passport_abaya_length", label_ar: "الطول", label_en: "Length", value: "56" },
  { key: "fit_passport_abaya_bust", label_ar: "الصدر", label_en: "Bust", value: "22" },
];

let requests = 0;
const nextRequest = () => `00000000-0000-4000-b000-${String(++requests).padStart(12, "0")}`;

type Revision = {
  revision: number;
  changes: Array<Record<string, string | null>>;
  note: string | null;
  told_supplier_at: string | null;
  request_id: string | null;
};
const revisionsOf = async (line: string) =>
  (
    await ctx.db.query<Revision>(
      "SELECT * FROM public.order_line_revisions WHERE order_item_id = $1 ORDER BY revision",
      [line],
    )
  ).rows;
const lineOf = (id: string) =>
  ctx.one<{
    id: string;
    revision: number;
    custom_field_values: Array<Record<string, string>>;
    selected_variant: Record<string, unknown> | null;
    name_en: string | null;
    unit_cost: string | null;
  }>("SELECT * FROM public.order_items WHERE id = $1", [id]);
const supplierLine = (line: string) =>
  ctx.one<{ id: string; sheet_revision: number | null; po_id: string }>(
    "SELECT id, sheet_revision, po_id FROM public.purchase_order_items WHERE order_item_id = $1",
    [line],
  );

/** A customer's order at this stage, with one piece made to order to these measurements. */
async function customOrder({
  stage = "NEEDS_PACKING",
  status = "confirmed",
  location = "custom",
  fields = PASSPORT as unknown[],
} = {}) {
  await ctx.asServer();
  const { id } = await ctx.one<{ id: string }>(
    `INSERT INTO public.orders (brand_id, status, fulfillment_status, payment_status, payment_method,
       subtotal, total, advance_paid, customer_name_snapshot)
     VALUES ($1, $2, $3, 'paid', 'cod', 100, 100, 100, 'Maryam') RETURNING id`,
    [BRAND, status, stage],
  );
  const line = await ctx.one<{ id: string }>(
    `INSERT INTO public.order_items (order_id, brand_id, product_id, variant_id, quantity, description,
       name_en, name_ar, location, unit_price, unit_cost, selected_variant, custom_field_values)
     VALUES ($1, $2, $3, $4, 1, 'Black abaya', 'Black abaya', 'عباية سوداء', $5, 100, 30,
       '{"size":"56","color":"Black"}'::jsonb, $6::jsonb) RETURNING id`,
    [id, BRAND, ctx.abaya, ctx.small, location, JSON.stringify(fields)],
  );
  return { id, line: line.id };
}

async function amend(
  line: string,
  values: Array<{ key: string; value: string }>,
  { note = null as string | null, request = nextRequest() } = {},
) {
  return (
    await ctx.db.query<{ amend_order_line_details: Record<string, unknown> }>(
      "SELECT public.amend_order_line_details($1, $2::jsonb, $3, $4)",
      [line, JSON.stringify(values), note, request],
    )
  ).rows[0].amend_order_line_details as {
    revision: number;
    changes: unknown[];
    with_supplier: boolean;
    supplier_behind: boolean;
    replayed?: boolean;
  };
}

async function sendToTailor(order: string, line: string) {
  await ctx.asStaff(FINANCE);
  return (
    await ctx.one<{ send_order_to_supplier: string }>(
      "SELECT public.send_order_to_supplier($1, $2, NULL, $3::jsonb, '2026-11-20')",
      [order, ctx.tailor, JSON.stringify([{ order_item_id: line, unit_cost: 20 }])],
    )
  ).send_order_to_supplier;
}

/** The order's lines as the editor holds them and sends them back (with their ids). */
const editorLines = async (order: string) =>
  (
    await ctx.one<{ lines: Array<Record<string, unknown>> }>(
      `SELECT COALESCE(jsonb_agg(to_jsonb(oi) - 'revision' ORDER BY oi.description), '[]') AS lines
         FROM public.order_items oi WHERE order_id = $1`,
      [order],
    )
  ).lines;
const replace = (order: string, lines: unknown[]) =>
  ctx.db.query("SELECT public.replace_order_items($1, $2::jsonb)", [order, JSON.stringify(lines)]);

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
    alterations,
    madeToMeasure,
    migration,
  ]);
  // The migration's own grants (the shared database grants every table to a person).
  await ctx.db.exec(`
    REVOKE ALL ON public.order_line_revisions FROM authenticated;
    GRANT SELECT ON public.order_line_revisions TO authenticated;
  `);
});

describe("a change before the piece is sent", () => {
  it("is revision 2, with what changed, the note, and a line in the order's activity", async () => {
    const { id, line } = await customOrder();
    await ctx.asStaff(ORDER_STAFF);
    const answer = await amend(line, [{ key: "fit_passport_abaya_length", value: "58" }], {
      note: "Customer called",
    });
    expect(answer).toMatchObject({ revision: 2, with_supplier: false, supplier_behind: false });

    await ctx.asServer();
    expect((await lineOf(line)).revision).toBe(2);
    const [revision] = await revisionsOf(line);
    expect(revision).toMatchObject({ revision: 2, note: "Customer called" });
    expect(revision.changes).toEqual([
      {
        key: "fit_passport_abaya_length",
        label_ar: "الطول",
        label_en: "Length",
        from: "56",
        to: "58",
      },
    ]);
    // The other answers are as they were, in their order.
    expect((await lineOf(line)).custom_field_values.map((f) => [f.key, f.value])).toEqual([
      ["fit_passport_unit", "in"],
      ["fit_passport_abaya_length", "58"],
      ["fit_passport_abaya_bust", "22"],
    ]);
    const log = await ctx.one<{ action: string; message_en: string; message_ar: string }>(
      "SELECT action, message_en, message_ar FROM public.activity_logs WHERE order_id = $1",
      [id],
    );
    expect(log.action).toBe("order_line_revised");
    expect(log.message_en).toContain('"Black abaya" changed (revision 2): Length: 56 → 58');
    expect(log.message_en).toContain("Customer called");
    expect(log.message_ar).toContain("الطول: 56 → 58");
  });

  it("adds the notes for the workshop and the product's own fields, and takes an emptied one out", async () => {
    await ctx.asServer();
    await ctx.db.query("UPDATE public.products SET custom_fields = $2::jsonb WHERE id = $1", [
      ctx.abaya,
      JSON.stringify([{ key: "sleeve_style", label_ar: "الأكمام", label_en: "Sleeves" }]),
    ]);
    const { line } = await customOrder();
    await ctx.asStaff(ORDER_STAFF);
    await amend(line, [
      { key: "tailoring_notes", value: "Full lining\nSleeves 2 cm longer" },
      { key: "sleeve_style", value: "Wide" },
      { key: "fit_passport_abaya_bust", value: "" },
    ]);
    await ctx.asServer();
    const values = (await lineOf(line)).custom_field_values;
    expect(values.map((f) => f.key)).toEqual([
      "fit_passport_unit",
      "fit_passport_abaya_length",
      "sleeve_style",
      "tailoring_notes",
    ]);
    expect(values.find((f) => f.key === "sleeve_style")).toMatchObject({ label_en: "Sleeves" });
    expect(values.find((f) => f.key === "tailoring_notes")).toMatchObject({
      label_en: "Notes for the workshop",
      value: "Full lining\nSleeves 2 cm longer",
    });
    const [revision] = await revisionsOf(line);
    expect(revision.changes.map((c) => [c.key, c.from, c.to])).toEqual([
      ["sleeve_style", "", "Wide"],
      ["tailoring_notes", "", "Full lining\nSleeves 2 cm longer"],
      ["fit_passport_abaya_bust", "22", ""],
    ]);
  });

  it("asks for an answer the piece can hold, of a sensible length, that changes something", async () => {
    const { line } = await customOrder();
    await ctx.asStaff(ORDER_STAFF);
    await expect(amend(line, [{ key: "monogram", value: "M" }])).rejects.toThrow("INVALID_FIELD");
    await expect(amend(line, [{ key: "made_to_measure", value: "true" }])).rejects.toThrow(
      "INVALID_FIELD",
    );
    await expect(
      amend(line, [{ key: "fit_passport_abaya_length", value: "5".repeat(301) }]),
    ).rejects.toThrow("VALUE_TOO_LONG");
    await expect(
      amend(line, [{ key: "fit_passport_abaya_length", value: " 56 " }]),
    ).rejects.toThrow("NOTHING_CHANGED");
    await expect(amend(line, [])).rejects.toThrow("NOTHING_CHANGED");
    await ctx.asServer();
    expect(await revisionsOf(line)).toEqual([]);
  });

  it("writes one press once", async () => {
    const { line } = await customOrder();
    await ctx.asStaff(ORDER_STAFF);
    const request = nextRequest();
    await amend(line, [{ key: "fit_passport_abaya_length", value: "57" }], { request });
    const again = await amend(line, [{ key: "fit_passport_abaya_length", value: "59" }], {
      request,
    });
    expect(again).toMatchObject({ revision: 2, replayed: true });
    await ctx.asServer();
    expect((await revisionsOf(line)).length).toBe(1);
    expect((await lineOf(line)).custom_field_values[1].value).toBe("57");
  });
});

describe("a change while a supplier holds the piece", () => {
  it("leaves the supplier's sheet behind until they are told, and only order staff are needed", async () => {
    const { id, line } = await customOrder();
    const po = await sendToTailor(id, line);
    await ctx.asServer();
    expect((await supplierLine(line)).sheet_revision).toBe(1);

    // Order staff, who cannot see the supplier's account, change it and see where it is.
    await ctx.asStaff(ORDER_STAFF);
    const answer = await amend(line, [{ key: "fit_passport_abaya_length", value: "58" }]);
    expect(answer).toMatchObject({ revision: 2, with_supplier: true, supplier_behind: true });
    const pieces = (
      await ctx.one<{ order_workshop_pieces: Array<Record<string, unknown>> }>(
        "SELECT public.order_workshop_pieces($1)",
        [id],
      )
    ).order_workshop_pieces;
    expect(pieces[0]).toMatchObject({ po_id: po, sheet_revision: 1, line_revision: 2 });

    const told = await ctx.one<{ mark_order_line_supplier_told: Record<string, unknown> }>(
      "SELECT public.mark_order_line_supplier_told($1)",
      [line],
    );
    expect(told.mark_order_line_supplier_told).toEqual({ revision: 2, told: true });
    await ctx.asServer();
    expect((await supplierLine(line)).sheet_revision).toBe(2);
    expect((await revisionsOf(line))[0].told_supplier_at).not.toBeNull();
    // Told already: nothing more to record.
    await ctx.asStaff(ORDER_STAFF);
    expect(
      (
        await ctx.one<{ mark_order_line_supplier_told: Record<string, unknown> }>(
          "SELECT public.mark_order_line_supplier_told($1)",
          [line],
        )
      ).mark_order_line_supplier_told,
    ).toEqual({ revision: 2, told: false });
  });

  it("a piece sent after a change goes with the sheet it is", async () => {
    const { id, line } = await customOrder();
    await ctx.asStaff(ORDER_STAFF);
    await amend(line, [{ key: "fit_passport_abaya_length", value: "58" }]);
    await sendToTailor(id, line);
    await ctx.asServer();
    expect((await supplierLine(line)).sheet_revision).toBe(2);
  });

  it("is refused once the piece is back, or handed over: that is an alteration", async () => {
    const { id, line } = await customOrder();
    const po = await sendToTailor(id, line);
    await ctx.asStaff(FINANCE);
    await ctx.receive(po, [[(await supplierLine(line)).id, 1]]);
    await expect(amend(line, [{ key: "fit_passport_abaya_length", value: "58" }])).rejects.toThrow(
      "PIECE_ALREADY_ARRIVED",
    );

    const handed = await customOrder({ status: "completed", stage: "DELIVERED" });
    await ctx.asStaff(ORDER_STAFF);
    await expect(
      amend(handed.line, [{ key: "fit_passport_abaya_length", value: "58" }]),
    ).rejects.toThrow("PIECE_ALREADY_ARRIVED");
  });

  it("is told only of a piece a supplier still holds", async () => {
    const { line } = await customOrder();
    await ctx.asStaff(ORDER_STAFF);
    await expect(
      ctx.db.query("SELECT public.mark_order_line_supplier_told($1)", [line]),
    ).rejects.toThrow("NOT_WITH_SUPPLIER");
  });
});

describe("what is refused", () => {
  it("a cancelled order, a ready piece", async () => {
    const cancelled = await customOrder({ status: "cancelled" });
    await ctx.asStaff(ORDER_STAFF);
    await expect(
      amend(cancelled.line, [{ key: "fit_passport_abaya_length", value: "58" }]),
    ).rejects.toThrow("ORDER_CANCELLED");
    const ready = await customOrder({ location: "main" });
    await ctx.asStaff(ORDER_STAFF);
    await expect(
      amend(ready.line, [{ key: "fit_passport_abaya_length", value: "58" }]),
    ).rejects.toThrow("NOT_MADE_TO_ORDER");
  });

  it("anyone but the store's order staff, and a request id left out", async () => {
    const { line } = await customOrder();
    const change = [{ key: "fit_passport_abaya_length", value: "58" }];
    await ctx.asStaff("view_financials");
    await expect(amend(line, change)).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asStaff(ORDER_STAFF, OTHER);
    await expect(amend(line, change)).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asServer();
    await expect(amend(line, change)).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asStaff(ORDER_STAFF);
    await expect(
      ctx.db.query("SELECT public.amend_order_line_details($1, $2::jsonb, NULL, NULL)", [
        line,
        JSON.stringify(change),
      ]),
    ).rejects.toThrow("REQUEST_ID_REQUIRED");
  });

  it("a person writing a revision, a line's revision or a supplier's sheet by hand", async () => {
    const { id, line } = await customOrder();
    await sendToTailor(id, line);
    await ctx.asStaff(FINANCE);
    await expect(
      ctx.db.query(
        `INSERT INTO public.order_line_revisions (brand_id, order_id, order_item_id, revision, changes)
         VALUES ($1, $2, $3, 2, '[{"key":"x"}]')`,
        [BRAND, id, line],
      ),
    ).rejects.toThrow(/permission denied/);
    await ctx.db.query("UPDATE public.order_items SET revision = 9 WHERE id = $1", [line]);
    await ctx.db.query(
      "UPDATE public.purchase_order_items SET sheet_revision = 9 WHERE order_item_id = $1",
      [line],
    );
    await ctx.asServer();
    expect((await lineOf(line)).revision).toBe(1);
    expect((await supplierLine(line)).sheet_revision).toBe(1);
  });
});

describe("the order editor's save", () => {
  it("keeps its lines: the piece stays on the supplier's order, its names and its cost", async () => {
    const { id, line } = await customOrder();
    await sendToTailor(id, line);
    await ctx.asServer();
    const lines = await editorLines(id);
    // A price edited, a cost the editor does not hold, and a new line added.
    lines[0].unit_price = 120;
    lines[0].unit_cost = null;
    await ctx.asStaff(ORDER_STAFF);
    await replace(id, [...lines, { description: "Shayla", quantity: 1, unit_price: 8 }]);
    await ctx.asServer();
    const kept = await lineOf(line);
    expect(kept).toMatchObject({ name_en: "Black abaya", unit_cost: "30", revision: 1 });
    expect((await supplierLine(line)).id).toBeTruthy();
    const all = (
      await ctx.db.query<{ id: string; description: string; revision: number }>(
        "SELECT id, description, revision FROM public.order_items WHERE order_id = $1 ORDER BY description",
        [id],
      )
    ).rows;
    expect(all.map((l) => [l.description, l.revision])).toEqual([
      ["Black abaya", 1],
      ["Shayla", 1],
    ]);
    expect(all[0].id).toBe(line);
  });

  it("records a change of measurements it makes, and leaves the supplier behind", async () => {
    const { id, line } = await customOrder();
    await sendToTailor(id, line);
    await ctx.asServer();
    const lines = await editorLines(id);
    lines[0].custom_field_values = PASSPORT.map((f) =>
      f.key === "fit_passport_abaya_bust" ? { ...f, value: "23" } : f,
    );
    await ctx.asStaff(ORDER_STAFF);
    await replace(id, lines);
    await ctx.asServer();
    expect((await lineOf(line)).revision).toBe(2);
    expect((await revisionsOf(line))[0].changes).toEqual([
      { key: "fit_passport_abaya_bust", label_ar: "الصدر", label_en: "Bust", from: "22", to: "23" },
    ]);
    expect((await supplierLine(line)).sheet_revision).toBe(1);
  });

  it("is no revision when it only gives a line its first answers, or rewrites them the same", async () => {
    const { id, line } = await customOrder({ fields: [] });
    await ctx.asServer();
    let lines = await editorLines(id);
    lines[0].custom_field_values = PASSPORT;
    await ctx.asStaff(ORDER_STAFF);
    await replace(id, lines);
    await ctx.asServer();
    lines = await editorLines(id);
    lines[0].custom_field_values = PASSPORT.map((f) => ({ value: ` ${f.value}`, ...f }));
    await ctx.asStaff(ORDER_STAFF);
    await replace(id, lines);
    await ctx.asServer();
    expect((await lineOf(line)).revision).toBe(1);
    expect(await revisionsOf(line)).toEqual([]);
  });

  it("deletes only the lines taken out; another order's id or the same id twice is a new line", async () => {
    const a = await customOrder();
    const b = await customOrder();
    await ctx.asServer();
    const [mine] = await editorLines(a.id);
    const [theirs] = await editorLines(b.id);
    await ctx.asStaff(ORDER_STAFF);
    await replace(a.id, [
      mine,
      { ...mine, description: "Copy" },
      { ...theirs, description: "Theirs" },
    ]);
    await ctx.asServer();
    const rows = (
      await ctx.db.query<{ id: string; description: string }>(
        "SELECT id, description FROM public.order_items WHERE order_id = $1 ORDER BY description",
        [a.id],
      )
    ).rows;
    expect(rows.map((r) => r.description)).toEqual(["Black abaya", "Copy", "Theirs"]);
    expect(rows[0].id).toBe(a.line);
    expect(rows[2].id).not.toBe(b.line);
    expect((await lineOf(b.line)).id).toBe(b.line);

    await ctx.asStaff(ORDER_STAFF);
    await replace(a.id, [mine]);
    await ctx.asServer();
    expect(
      (await ctx.db.query("SELECT 1 FROM public.order_items WHERE order_id = $1", [a.id])).rows,
    ).toHaveLength(1);
  });

  it("saves an order with an alteration, and still keeps the alteration's lines", async () => {
    const { id, line } = await customOrder({ location: "main", fields: [] });
    await ctx.asStaff(ORDER_STAFF);
    await ctx.db.query(
      `SELECT public.create_order_alteration($1, 'alteration', $2::jsonb, NULL, 'in_house', NULL, NULL,
         '2026-11-20', NULL, 5, $3)`,
      [line, JSON.stringify([{ key: "length", from: "56", to: "54" }]), nextRequest()],
    );
    await ctx.asServer();
    const lines = await editorLines(id);
    expect(lines).toHaveLength(2);
    await ctx.asStaff(ORDER_STAFF);
    await replace(
      id,
      lines.map((l) => ({ ...l, unit_price: Number(l.unit_price) })),
    );
    await expect(
      replace(
        id,
        lines.filter((l) => l.id === line),
      ),
    ).rejects.toThrow("ORDER_LINE_HAS_ALTERATION");
  });

  it("is refused with no session", async () => {
    const { id } = await customOrder();
    await ctx.asServer();
    await expect(replace(id, await editorLines(id))).rejects.toThrow("NOT_AUTHORIZED");
  });
});

describe("the rule's twin in the app", () => {
  it("names the same changes, in the same order", async () => {
    const cases: Array<[unknown, unknown]> = [
      [PASSPORT, PASSPORT],
      [PASSPORT, PASSPORT.map((f) => ({ ...f, value: `${f.value}\n` }))],
      [PASSPORT, [PASSPORT[2], { ...PASSPORT[1], value: "58" }]],
      [[], PASSPORT],
      [PASSPORT, []],
      [
        [
          { key: "made_to_measure", value: "true" },
          { key: "fit_version", value: "2" },
        ],
        [{ key: "fit_version", value: "3" }],
      ],
      [
        [{ key: "a", value: "1" }, { key: "a", value: "2" }, "x", null, { value: "no key" }],
        [
          { key: "a", value: 1, label_en: "" },
          { key: "b", value: true, label_ar: "ب" },
        ],
      ],
      [[{ key: "n", value: "  Full lining  " }], [{ key: "n", value: "Full lining\n" }]],
      [null, { not: "a list" }],
    ];
    await ctx.asServer();
    for (const [before, after] of cases) {
      const { changes } = await ctx.one<{ changes: Array<Record<string, unknown>> }>(
        "SELECT public.order_line_field_changes($1::jsonb, $2::jsonb) AS changes",
        [JSON.stringify(before), JSON.stringify(after)],
      );
      const sql = changes.map((c) =>
        Object.fromEntries(Object.entries(c).filter(([, v]) => v !== null)),
      );
      expect(sql, JSON.stringify([before, after])).toEqual(lineFieldChanges(before, after));
    }
  });
});

// -- With the real stock engine ------------------------------------------------------------------

describe("the editor's save with the real stock engine", () => {
  const STAFF = "00000000-0000-4000-8000-0000000000aa";
  let db: PGlite;
  const one = async <T>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows[0];
  const stockOf = async (variant: string) =>
    (
      await one<{ stock_main: number }>(
        "SELECT stock_main FROM public.product_variants WHERE id = $1",
        [variant],
      )
    ).stock_main;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
      CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE
        AS $$ SELECT current_setting('app.brand', true) = b::text $$;
      CREATE TABLE public.brands (id uuid PRIMARY KEY);
      INSERT INTO public.brands VALUES ('${BRAND}');
      CREATE TABLE public.products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
        is_made_to_order boolean NOT NULL DEFAULT false, name text
      );
      CREATE TABLE public.product_variants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid, brand_id uuid,
        stock_main integer DEFAULT 0, stock_incubator integer DEFAULT 0
      );
      CREATE TABLE public.orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, user_id uuid,
        status text DEFAULT 'confirmed', payment_status text DEFAULT 'paid', payment_method text,
        created_at timestamptz NOT NULL DEFAULT now(),
        inventory_state text NOT NULL DEFAULT 'none', inventory_revision integer NOT NULL DEFAULT 0
      );
      CREATE TABLE public.order_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
        user_id uuid, brand_id uuid, product_id uuid, variant_id uuid,
        quantity integer NOT NULL DEFAULT 1, location text, description text,
        unit_price numeric NOT NULL DEFAULT 0, unit_cost numeric, original_price numeric,
        customizations jsonb, customization_total numeric NOT NULL DEFAULT 0,
        line_total numeric NOT NULL DEFAULT 0, selected_variant jsonb,
        custom_field_values jsonb NOT NULL DEFAULT '[]'::jsonb, name_ar text, name_en text
      );
      CREATE TABLE public.order_inventory_allocations (
        order_id uuid NOT NULL, variant_id uuid NOT NULL, location text NOT NULL,
        quantity integer NOT NULL, brand_id uuid NOT NULL, PRIMARY KEY (order_id, variant_id, location)
      );
      CREATE FUNCTION public.apply_inventory_movement(
        p_brand_id uuid, p_variant_id uuid, p_location text, p_delta integer, p_reason text,
        p_reference_type text, p_reference_id uuid, p_idempotency_key text,
        p_actor_id uuid DEFAULT NULL, p_note text DEFAULT NULL
      ) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE public.product_variants SET stock_main = stock_main + p_delta WHERE id = p_variant_id;
      END $$;
    `);
    await db.exec(functionOf(stateMachine, "order_inventory_desired_state"));
    await db.exec(
      madeToOrderLimit.slice(0, madeToOrderLimit.indexOf("-- 7. The storefront's page data")),
    );
    await db.exec(functionOf(migration, "replace_order_items"));
  });

  it("moves stock by what changed and keeps every line it is given", async () => {
    await db.exec(`SET app.uid = '${STAFF}'; SET app.brand = '${BRAND}'`);
    const { id: product } = await one<{ id: string }>(
      "INSERT INTO public.products (brand_id) VALUES ($1) RETURNING id",
      [BRAND],
    );
    const variant = async (stock: number) =>
      (
        await one<{ id: string }>(
          "INSERT INTO public.product_variants (product_id, brand_id, stock_main) VALUES ($1, $2, $3) RETURNING id",
          [product, BRAND, stock],
        )
      ).id;
    const [a, b, c] = [await variant(10), await variant(5), await variant(5)];
    const { id: order } = await one<{ id: string }>(
      "INSERT INTO public.orders (brand_id) VALUES ($1) RETURNING id",
      [BRAND],
    );
    const put = async (v: string, quantity: number, description: string) =>
      (
        await one<{ id: string }>(
          `INSERT INTO public.order_items (order_id, brand_id, product_id, variant_id, quantity, description, location)
           VALUES ($1, $2, $3, $4, $5, $6, 'main') RETURNING id`,
          [order, BRAND, product, v, quantity, description],
        )
      ).id;
    const lineA = await put(a, 2, "A");
    const lineB = await put(b, 1, "B");
    await db.query("SELECT public.order_inventory_transition($1)", [order]);
    expect([await stockOf(a), await stockOf(b)]).toEqual([8, 4]);

    const lines = async () =>
      (
        await one<{ lines: Array<Record<string, unknown>> }>(
          "SELECT jsonb_agg(to_jsonb(oi) ORDER BY description) AS lines FROM public.order_items oi WHERE order_id = $1",
          [order],
        )
      ).lines;

    // The same lines sent back: nothing moves, nothing is rewritten.
    await db.query("SELECT public.replace_order_items($1, $2::jsonb)", [
      order,
      JSON.stringify(await lines()),
    ]);
    expect([await stockOf(a), await stockOf(b)]).toEqual([8, 4]);

    // One more of A, B taken out, C added.
    const [rowA] = await lines();
    await db.query("SELECT public.replace_order_items($1, $2::jsonb)", [
      order,
      JSON.stringify([
        { ...rowA, quantity: 3 },
        { product_id: product, variant_id: c, quantity: 1, description: "C", location: "main" },
      ]),
    ]);
    expect([await stockOf(a), await stockOf(b), await stockOf(c)]).toEqual([7, 5, 4]);
    const after = await lines();
    expect(after.map((l) => [l.description, l.quantity])).toEqual([
      ["A", 3],
      ["C", 1],
    ]);
    expect(after[0].id).toBe(lineA);
    expect(after.some((l) => l.id === lineB)).toBe(false);
  });
});
