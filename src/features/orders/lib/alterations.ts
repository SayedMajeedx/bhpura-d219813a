import { roundCost } from "@/features/supplier-orders/lib/landed-cost";

/**
 * Alterations (step 3 of `docs/workshop-flow-plan.md`, migration `20261117100000`): a piece of
 * an order, ready-made or made to order, sent to a supplier or the store's own workshop to be
 * altered at the customer's charge, or fixed for free. The database holds the record
 * (`order_alterations`) and decides where the customer pays; these are its pure rules for the
 * screens.
 */

export type AlterationKind = "alteration" | "fix";
export type AlterationMaker = "supplier" | "in_house";
export type AlterationStatus = "open" | "at_workshop" | "back" | "handed_over" | "cancelled";

export type AlterationChange = {
  key?: string;
  label_ar?: string;
  label_en?: string;
  from?: string;
  to?: string;
};

export type OrderAlteration = {
  id: string;
  order_id: string;
  source_order_id: string;
  source_item_id: string;
  kind: AlterationKind;
  changes: AlterationChange[];
  note: string | null;
  made_by: AlterationMaker;
  purchase_order_item_id: string | null;
  customer_charge: number;
  charge_item_id: string | null;
  due_at: string | null;
  status: AlterationStatus;
  created_at: string;
  back_at: string | null;
  handed_over_at: string | null;
};

type Lang = "ar" | "en";

// -- Where the customer pays (the owner's decision 2) ----------------------------------------

const HANDED_OVER = ["completed", "delivered", "picked_up", "returned"];

/**
 * An order handed over takes no new line: its alteration is a new order linked to it, with its
 * own invoice, so the original sale stays in its month. Twin of `order_alteration_target`,
 * run against it by `tests/order-alterations-migration.test.ts`.
 */
export function alterationTarget(order: {
  status?: string | null;
  fulfillment_status?: string | null;
}): "same_order" | "linked_order" {
  const status = String(order.status ?? "").toLowerCase();
  const stage = String(order.fulfillment_status ?? "").toLowerCase();
  return HANDED_OVER.includes(status) || HANDED_OVER.includes(stage)
    ? "linked_order"
    : "same_order";
}

/** The line under the price, saying where it is charged. */
export function whereCharged(
  target: "same_order" | "linked_order",
  orderNumber: string,
  lang: Lang,
): string {
  if (target === "same_order") {
    return lang === "ar" ? "يُضاف إلى هذا الطلب" : "Added to this order";
  }
  return lang === "ar"
    ? `على طلب جديد مرتبط بـ ${orderNumber}، بفاتورته الخاصة`
    : `On a new order linked to ${orderNumber}, with its own invoice`;
}

// -- Which pieces ---------------------------------------------------------------------------

export const isOut = (status: AlterationStatus) => status === "open" || status === "at_workshop";

type PieceLine = {
  id: string;
  description: string;
  quantity: number;
  /** `custom`: made to order. */
  location?: string | null;
  isService?: boolean;
};

export type AlterablePiece<L extends PieceLine> = {
  line: L;
  /** It may be altered at the customer's charge (the store does alterations). */
  alteration: boolean;
  /** It may be fixed for free (a piece the store had made). */
  fix: boolean;
  /** The alteration it is at now, if any: a second one waits for it. */
  out: OrderAlteration | null;
};

/**
 * The order's pieces and what each may be sent for: any piece (not a service, not an
 * alteration's own charge) when the store does alterations, and a fix only for one the store had
 * made (made to order, or made by a supplier). A piece already out is offered nothing.
 */
export function alterableLines<L extends PieceLine>(
  lines: readonly L[],
  {
    offersAlterations,
    alterations,
    madeLineIds = [],
  }: {
    offersAlterations: boolean;
    alterations: readonly OrderAlteration[];
    madeLineIds?: readonly string[];
  },
): AlterablePiece<L>[] {
  const charges = new Set(alterations.map((a) => a.charge_item_id).filter(Boolean));
  const made = new Set(madeLineIds);
  return lines.flatMap((line) => {
    if (line.isService || charges.has(line.id)) return [];
    const out = alterations.find((a) => a.source_item_id === line.id && isOut(a.status)) ?? null;
    const fix = line.location === "custom" || made.has(line.id);
    if (!out && !offersAlterations && !fix) return [];
    return [{ line, out, alteration: !out && offersAlterations, fix: !out && fix }];
  });
}

/** How many alterations are still with the workshop: the order's badge. */
export function alterationsOut(alterations: readonly Pick<OrderAlteration, "status">[]): number {
  return alterations.filter((a) => isOut(a.status)).length;
}

// -- What changes ---------------------------------------------------------------------------

export type MeasurementField = {
  key: string;
  label_ar?: string | null;
  label_en?: string | null;
  value?: string | null;
};

/** The order line's measurements and details, as the customer gave them. */
export function measurementFields(values: unknown): MeasurementField[] {
  return (Array.isArray(values) ? values : []).flatMap((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key : "";
    if (!key) return [];
    const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
    return [
      {
        key,
        label_ar: text(row.label_ar) || null,
        label_en: text(row.label_en) || null,
        value: text(row.value),
      },
    ];
  });
}

/** Only the fields whose value was changed, as "from → to". */
export function measurementChanges(
  fields: readonly MeasurementField[],
  after: Readonly<Record<string, string>>,
): AlterationChange[] {
  return fields.flatMap((field) => {
    const to = (after[field.key] ?? field.value ?? "").trim();
    const from = (field.value ?? "").trim();
    if (to === from) return [];
    return [
      {
        key: field.key,
        label_ar: field.label_ar ?? undefined,
        label_en: field.label_en ?? undefined,
        from,
        to,
      },
    ];
  });
}

/** One change in a few words: "Length: 56 → 54". */
export function changeLine(change: AlterationChange, lang: Lang): string {
  const label =
    (lang === "ar" ? change.label_ar || change.label_en : change.label_en || change.label_ar) ||
    change.key ||
    "";
  const move = [change.from, change.to].filter(Boolean).join(" → ");
  return [label, move].filter(Boolean).join(": ");
}

// -- Words ----------------------------------------------------------------------------------

const STATUS: Record<AlterationStatus, Record<Lang, string>> = {
  open: { ar: "مفتوح", en: "Open" },
  at_workshop: { ar: "في الورشة", en: "At the workshop" },
  back: { ar: "رجعت، جاهزة للتسليم", en: "Back, ready to hand over" },
  handed_over: { ar: "سُلّمت", en: "Handed over" },
  cancelled: { ar: "ملغى", en: "Cancelled" },
};

export function alterationStatusLabel(status: AlterationStatus, lang: Lang): string {
  return STATUS[status]?.[lang] ?? status;
}

export function alterationKindLabel(kind: AlterationKind, lang: Lang): string {
  if (kind === "fix") return lang === "ar" ? "تصليح" : "Fix";
  return lang === "ar" ? "تعديل" : "Alteration";
}

/** The charge line's name, as the database writes it. */
export function alterationLine(pieceName: string, lang: Lang): string {
  const name = pieceName.trim() || (lang === "ar" ? "قطعة" : "piece");
  return lang === "ar" ? `تعديل: ${name}` : `Alteration: ${name}`;
}

/** What staff may do with an alteration now. */
export function alterationActions(a: Pick<OrderAlteration, "status" | "made_by">) {
  return {
    back: isOut(a.status) && a.made_by === "in_house",
    handOver: a.status === "back",
    cancel: isOut(a.status),
  };
}

// -- The form -------------------------------------------------------------------------------

export type AlterForm = {
  kind: AlterationKind;
  /** The measurements as they should be after (key → value); untouched ones are as they are. */
  after: Record<string, string>;
  note: string;
  madeBy: AlterationMaker;
  vendorId: string;
  /** One of the supplier's open orders, or "new". */
  target: string;
  dueAt: string;
  /** The supplier's charge (finance staff only). */
  supplierCost: string;
  /** What the customer pays (an alteration; a fix is free). */
  customerCharge: string;
};

export type AlterProblem = "vendor" | "change" | "supplier_cost" | "customer_charge";

const money = (text: string) => {
  const n = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 && roundCost(n) === n ? n : null;
};

export function alterationProblems(
  form: AlterForm,
  fields: readonly MeasurementField[],
  { prices }: { prices: boolean },
): AlterProblem[] {
  const problems: AlterProblem[] = [];
  if (form.madeBy === "supplier" && !form.vendorId) problems.push("vendor");
  if (measurementChanges(fields, form.after).length === 0 && !form.note.trim()) {
    problems.push("change");
  }
  if (form.madeBy === "supplier" && prices && money(form.supplierCost) === null) {
    problems.push("supplier_cost");
  }
  if (form.kind === "alteration" && money(form.customerCharge) === null) {
    problems.push("customer_charge");
  }
  return problems;
}

/** What `create_order_alteration` is asked: call it only on a form with no problems. */
export function alterationRequest(
  form: AlterForm,
  fields: readonly MeasurementField[],
  sourceItemId: string,
  requestId: string,
  { prices }: { prices: boolean },
) {
  const supplier = form.madeBy === "supplier";
  return {
    p_source_item_id: sourceItemId,
    p_kind: form.kind,
    p_changes: measurementChanges(fields, form.after),
    p_note: form.note.trim().slice(0, 500) || null,
    p_made_by: form.madeBy,
    p_vendor_id: supplier ? form.vendorId : null,
    p_po_id: supplier && form.target !== "new" ? form.target : null,
    p_expected_at: form.dueAt || null,
    p_supplier_cost: supplier && prices ? money(form.supplierCost) : null,
    p_customer_charge: form.kind === "alteration" ? (money(form.customerCharge) ?? 0) : 0,
    p_request_id: requestId,
  };
}

/** The database's refusals, in words. */
export function alterationError(code: string, lang: Lang): string {
  const ar = lang === "ar";
  const words: Record<string, [string, string]> = {
    ORDER_CANCELLED: [
      "الطلب ملغى: لا تُرسل قطعه للتعديل.",
      "The order is cancelled: its pieces are not sent.",
    ],
    ALTERATION_ALREADY_OUT: [
      "هذه القطعة عند الورشة الآن لتعديل آخر: انتظر رجوعها أو ألغِه.",
      "This piece is already out for another alteration: wait for it or cancel it.",
    ],
    ORDER_LINE_ALREADY_WITH_SUPPLIER: [
      "هذه القطعة عند مورد الآن.",
      "This piece is with a supplier now.",
    ],
    ALTERATIONS_OFF: [
      "المتجر لا يقدّم التعديلات: فعّلها من إعدادات الطلبات.",
      "The store does not do alterations: turn them on in Orders settings.",
    ],
    NOTHING_TO_FIX: [
      "التصليح المجاني لقطعة صنعها المتجر فقط.",
      "A free fix is only for a piece the store had made.",
    ],
    NOTHING_TO_CHANGE: ["اكتب ما يتغيّر.", "Say what changes."],
    NOT_A_PIECE: ["هذا السطر ليس قطعة.", "This line is not a piece."],
    ALTERATION_ALREADY_BACK: [
      "رجعت القطعة من الورشة: لا يمكن إلغاء التعديل الآن.",
      "The piece is back from the workshop: the alteration cannot be cancelled now.",
    ],
    RECEIVE_ON_SUPPLIER_ORDER: [
      "قطعة المورد ترجع باستلامها على طلبية المورد.",
      "A supplier's piece comes back when it is received on their order.",
    ],
    NOT_AUTHORIZED: ["ليست لديك صلاحية لذلك.", "You are not allowed to do this."],
  };
  const hit = Object.keys(words).find((key) => code.includes(key));
  if (hit) return words[hit][ar ? 0 : 1];
  return ar ? "تعذّر الحفظ، حاول مرة أخرى." : "Could not save. Try again.";
}

/**
 * The message to the supplier about a piece sent for an alteration or a fix: what to do, with
 * no price and nothing of the customer. A person sends it.
 */
export function alterationSupplierMessage({
  vendorName,
  storeName,
  poNumber,
  dueOn,
  piece,
  kind,
  changes,
  note,
  lang,
}: {
  vendorName: string;
  storeName: string;
  poNumber?: string | null;
  /** The day it is wanted, already written for the reader. */
  dueOn?: string | null;
  piece: string;
  kind: AlterationKind;
  changes: readonly AlterationChange[];
  note?: string | null;
  lang: Lang;
}): string {
  const ar = lang === "ar";
  const order = [poNumber, dueOn ? (ar ? `مطلوبة بتاريخ ${dueOn}` : `due ${dueOn}`) : ""]
    .filter(Boolean)
    .join(ar ? "، " : ", ");
  const what =
    kind === "fix"
      ? ar
        ? `قطعة للتصليح من ${storeName}`
        : `A piece to fix for ${storeName}`
      : ar
        ? `قطعة للتعديل من ${storeName}`
        : `A piece to alter for ${storeName}`;
  return [
    ar ? `مرحباً ${vendorName}،` : `Hello ${vendorName},`,
    order ? `${what} (${order}):` : `${what}:`,
    piece.trim(),
    ...changes.map((change) => `- ${changeLine(change, lang)}`),
    (note ?? "").trim(),
    ar ? "شكراً لك." : "Thank you.",
  ]
    .filter(Boolean)
    .join("\n");
}
