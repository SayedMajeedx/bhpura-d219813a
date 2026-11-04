import { formatDate } from "@/lib/format";
import { isHiddenField, NOTE_KEYS } from "@/lib/made-to-measure";
import { changeLine, type AlterationChange, type MeasurementField } from "./alterations";

/**
 * Changing a custom order after it was placed (step 4 of `docs/workshop-flow-plan.md`, migration
 * `20261119100000`): a line's answers corrected with a record of what changed, and a supplier
 * holding the earlier sheet shown it and told. The database holds the record
 * (`order_line_revisions`, the line's `revision`, the supplier line's `sheet_revision`); these
 * are its pure rules for the screens.
 */

export type LineRevision = {
  id: string;
  order_item_id: string;
  revision: number;
  changes: AlterationChange[];
  note: string | null;
  changed_by: string | null;
  changed_at: string;
  told_supplier_at: string | null;
};

type Lang = "ar" | "en";
type Field = { key?: unknown; label_ar?: unknown; label_en?: unknown; value?: unknown };

// What Postgres's `\s` trims: the ends' ASCII white space only.
const trimEnds = (text: string) => text.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, "");
const asText = (value: unknown) =>
  value == null
    ? ""
    : typeof value === "string"
      ? value
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
const label = (value: unknown) => (asText(value) === "" ? null : asText(value));

function byKey(list: unknown): Array<[string, Field]> {
  const seen = new Map<string, Field>();
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const field = raw as Field;
    const key = asText(field.key);
    if (key && !seen.has(key)) seen.set(key, field);
  }
  return [...seen.entries()];
}

/**
 * What changed between two answer lists, in the new list's order, then what was taken out: a
 * value compared as text with its ends trimmed; the storefront's mark and a version are not
 * answers. The twin of `order_line_field_changes`, run against it by
 * `tests/order-line-revisions-migration.test.ts`.
 */
export function lineFieldChanges(before: unknown, after: unknown): AlterationChange[] {
  const old = new Map(byKey(before));
  const now = byKey(after);
  const keys = [
    ...now.map(([key]) => key),
    ...[...old.keys()].filter((key) => !now.some(([k]) => k === key)),
  ];
  const fresh = new Map(now);
  return keys.flatMap((key) => {
    if (key === "made_to_measure" || key.endsWith("_version")) return [];
    const o = old.get(key);
    const n = fresh.get(key);
    const from = trimEnds(asText(o?.value));
    const to = trimEnds(asText(n?.value));
    if (from === to) return [];
    return [
      {
        key,
        label_ar: label(n?.label_ar) ?? label(o?.label_ar) ?? undefined,
        label_en: label(n?.label_en) ?? label(o?.label_en) ?? undefined,
        from,
        to,
      },
    ];
  });
}

/** The supplier holds an earlier sheet than the line is now (a sheet sent before is the first). */
export function supplierBehind(
  lineRevision: number | null | undefined,
  sheetRevision: number | null | undefined,
): boolean {
  return (lineRevision ?? 1) > (sheetRevision ?? 1);
}

export type ProductField = {
  key?: string | null;
  label_ar?: string | null;
  label_en?: string | null;
};

const NOTES: MeasurementField = {
  key: "tailoring_notes",
  label_ar: "ملاحظات للورشة",
  label_en: "Notes for the workshop",
  value: "",
};

/**
 * What "Change measurements" offers: the line's own answers (not its bookkeeping, nor which fit
 * profile it used), its product's fields it has no answer for yet, and the notes for the
 * workshop, last.
 */
export function editableFields(
  values: unknown,
  productFields: readonly ProductField[] = [],
): MeasurementField[] {
  const own = byKey(values)
    .filter(([key]) => !isHiddenField(key) && !key.endsWith("_profile"))
    .map(([key, f]) => ({
      key,
      label_ar: label(f.label_ar),
      label_en: label(f.label_en),
      value: asText(f.value),
    }));
  const known = new Set(own.map((f) => f.key));
  const more = productFields.flatMap((f) => {
    const key = f.key ?? "";
    if (!key || known.has(key) || isHiddenField(key)) return [];
    known.add(key);
    return [{ key, label_ar: f.label_ar ?? null, label_en: f.label_en ?? null, value: "" }];
  });
  const fields = [...own, ...more];
  const notes = fields.filter((f) => NOTE_KEYS.has(f.key));
  const rest = fields.filter((f) => !NOTE_KEYS.has(f.key));
  return [...rest, ...(notes.length ? notes : [NOTES])];
}

/** Whether a field is written as free text over several lines. */
export const isNoteField = (key: string) => NOTE_KEYS.has(key);

/** What the step sends: only the fields that were changed, as typed (an emptied one, empty). */
export function amendValues(
  fields: readonly MeasurementField[],
  after: Readonly<Record<string, string>>,
): Array<{ key: string; value: string }> {
  return fields.flatMap((field) => {
    if (!(field.key in after)) return [];
    const value = after[field.key] ?? "";
    return trimEnds(value) === trimEnds(field.value ?? "") ? [] : [{ key: field.key, value }];
  });
}

/** The line's revisions, the latest first. */
export function revisionsOf(
  revisions: readonly LineRevision[],
  orderItemId: string | null | undefined,
): LineRevision[] {
  return revisions
    .filter((r) => r.order_item_id === orderItemId)
    .sort((a, b) => b.revision - a.revision);
}

/**
 * What changed since the sheet a supplier holds: every revision after it, one change per answer
 * (from what the supplier has, to what it is now). An answer put back as it was is no change.
 */
export function changesSince(
  revisions: readonly LineRevision[],
  orderItemId: string | null | undefined,
  sheetRevision: number,
): AlterationChange[] {
  const merged = new Map<string, AlterationChange>();
  for (const r of revisionsOf(revisions, orderItemId).reverse()) {
    if (r.revision <= sheetRevision) continue;
    for (const change of r.changes) {
      const key = change.key ?? "";
      const before = merged.get(key);
      merged.set(key, { ...change, from: before ? before.from : change.from });
    }
  }
  return [...merged.values()].filter((c) => trimEnds(c.from ?? "") !== trimEnds(c.to ?? ""));
}

/** "Revision 2 — replaces the sheet of 3 Nov 2026", at the top of a revised job sheet. */
export function revisionBanner(revision: number, replacesSheetOf: string | null, lang: Lang) {
  // Written as the sheet writes its other dates.
  const day = replacesSheetOf
    ? formatDate(replacesSheetOf, lang === "ar" ? "ar-BH-u-nu-latn" : "en-US")
    : null;
  if (lang === "ar") {
    return day ? `النسخة ${revision} — تحلّ محلّ ورقة ${day}` : `النسخة ${revision}`;
  }
  return day ? `Revision ${revision} — replaces the sheet of ${day}` : `Revision ${revision}`;
}

/**
 * When the sheet a revision replaces was written: the revision before it, else the order itself.
 */
export function replacedSheetDate(
  revisions: readonly LineRevision[],
  revision: number,
  orderDate: string | null,
): string | null {
  const earlier = revisions
    .filter((r) => r.revision < revision)
    .sort((a, b) => b.revision - a.revision)[0];
  return earlier?.changed_at ?? orderDate;
}

/** One change in a few words, in the reader's language ("Length: 56 → 58"). */
export const revisionChangeLine = (change: AlterationChange, lang: Lang) =>
  changeLine(change, lang);

// -- The database's refusals ---------------------------------------------------------------

const ERRORS: Record<string, Record<Lang, string>> = {
  NOT_AUTHORIZED: {
    ar: "لا تملك صلاحية تعديل هذا الطلب.",
    en: "You may not change this order.",
  },
  ORDER_CANCELLED: {
    ar: "الطلب ملغى: لا تتغيّر تفاصيله.",
    en: "The order is cancelled: its details do not change.",
  },
  NOT_MADE_TO_ORDER: {
    ar: "هذه القطعة جاهزة وليست مصنوعة حسب الطلب.",
    en: "This piece is ready-made, not made to order.",
  },
  PIECE_ALREADY_ARRIVED: {
    ar: "القطعة صُنعت ورجعت أو سُلّمت: اطلب تعديلاً عليها بدلاً من ذلك.",
    en: "The piece is already made (back or handed over): ask for an alteration instead.",
  },
  NOTHING_CHANGED: { ar: "لم يتغيّر شيء.", en: "Nothing changed." },
  INVALID_FIELD: {
    ar: "حقل غير معروف لهذه القطعة.",
    en: "A field this piece does not have.",
  },
  VALUE_TOO_LONG: { ar: "قيمة أطول من المسموح.", en: "A value is too long." },
  ORDER_LINE_NOT_FOUND: { ar: "لم تُعثر على القطعة.", en: "The piece was not found." },
  NOT_WITH_SUPPLIER: {
    ar: "القطعة ليست عند مورّد الآن.",
    en: "The piece is not with a supplier now.",
  },
};

/** A refusal in the reader's language, never a bare code. */
export function lineRevisionError(error: unknown, lang: Lang): string {
  const text =
    typeof error === "string"
      ? error
      : String((error as { message?: unknown } | null)?.message ?? "");
  const code = Object.keys(ERRORS).find((c) => text.includes(c));
  if (code) return ERRORS[code][lang];
  return lang === "ar"
    ? "تعذّر حفظ التغيير. حاول مرة أخرى."
    : "Could not save the change. Try again.";
}

export const LINE_REVISION_ERROR_CODES = Object.keys(ERRORS);
