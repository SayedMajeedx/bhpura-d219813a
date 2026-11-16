import { moneyFractionDigits } from "@/lib/format";
import { expenseCurrency } from "./expense-list";
import type { RecurrencePeriod } from "./recurring";

/**
 * The one expense form (the page had two, saving different fields): what it holds, what stops
 * a save, and the row it writes. Pure, so the rules are tested apart from the dialog.
 *
 * An expense is either a running cost (`opex`: rent, salaries, ads, counted in the period's
 * running costs) or a purchase of stock (`cogs`: packaging and materials bought to use up, kept
 * as stock and counted in each order's cost as it is used, so never as a running cost).
 */

export type ExpenseKind = "opex" | "cogs";

export type ExpenseForm = {
  kind: ExpenseKind;
  category: string;
  description: string;
  amount: string;
  currency: string;
  date: string;
  /** A stock purchase's pieces and their unit ("Bags", "Boxes"). */
  quantity: string;
  unit: string;
  vendorId: string;
  /** Where it was bought, when it is no supplier of the store's. */
  storeName: string;
  repeats: boolean;
  period: RecurrencePeriod;
  notes: string;
};

type EditedExpense = {
  expense_type?: string | null;
  category?: string | null;
  description?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  expense_date?: string | null;
  quantity?: number | string | null;
  unit_type?: string | null;
  vendor_id?: string | null;
  store_name?: string | null;
  is_recurring?: boolean | null;
  recurrence_period?: string | null;
  notes?: string | null;
};

/** The built-in categories, stored by their English code and read in the reader's words. */
export const CATEGORY_WORDS: Record<string, { en: string; ar: string }> = {
  Packaging: { en: "Packaging and materials", ar: "تغليف ومواد" },
  Operations: { en: "Operations and utilities", ar: "تشغيل ومرافق" },
  Rent: { en: "Rent", ar: "إيجار" },
  Marketing: { en: "Marketing and ads", ar: "تسويق وإعلانات" },
  Salaries: { en: "Salaries and wages", ar: "رواتب وأجور" },
  Delivery: { en: "Delivery", ar: "توصيل" },
  Fees: { en: "Fees and subscriptions", ar: "رسوم واشتراكات" },
  Other: { en: "Other", ar: "أخرى" },
};

/** A category in the reader's words: a built-in code translated, the store's own as written. */
export function categoryLabel(category: string | null | undefined, lang: "ar" | "en") {
  const value = (category ?? "").trim();
  const words =
    CATEGORY_WORDS[value] ??
    CATEGORY_WORDS[value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()];
  return words ? words[lang] : value;
}

/** The categories to offer: the built-in ones, then the store's own, each once. */
export function categoryChoices(used: readonly string[], kind: ExpenseKind) {
  const builtIn = Object.keys(CATEGORY_WORDS).filter((code) =>
    kind === "cogs" ? code === "Packaging" || code === "Other" : code !== "Packaging",
  );
  const seen = new Set(builtIn.map((c) => c.toLowerCase()));
  return [...builtIn, ...used.filter((c) => c && !seen.has(c.toLowerCase()))];
}

export function formFromExpense(
  expense: EditedExpense | null | undefined,
  storeCurrency: string,
  today: string,
): ExpenseForm {
  const kind: ExpenseKind = expense?.expense_type === "cogs" ? "cogs" : "opex";
  return {
    kind,
    category: expense?.category ?? (kind === "cogs" ? "Packaging" : ""),
    description: expense?.description ?? "",
    amount:
      expense && expense.amount !== null && expense.amount !== undefined
        ? String(expense.amount)
        : "",
    currency: expenseCurrency(expense, storeCurrency),
    date: expense?.expense_date ?? today,
    quantity:
      expense?.quantity !== null && expense?.quantity !== undefined && kind === "cogs"
        ? String(expense.quantity)
        : "",
    unit: expense?.unit_type && expense.unit_type !== "pcs" ? expense.unit_type : "",
    vendorId: expense?.vendor_id ?? "",
    storeName: expense?.store_name ?? "",
    repeats: Boolean(expense?.is_recurring),
    period: expense?.recurrence_period === "yearly" ? "yearly" : "monthly",
    notes: expense?.notes ?? "",
  };
}

export type FormProblem = "category" | "amount" | "date" | "quantity";

/** What stops a save, in the order the form asks. */
export function formProblems(form: ExpenseForm): FormProblem[] {
  const problems: FormProblem[] = [];
  if (!form.category.trim()) problems.push("category");
  if (!(Number(form.amount) > 0)) problems.push("amount");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) problems.push("date");
  if (form.kind === "cogs" && !(Number(form.quantity) > 0)) problems.push("quantity");
  return problems;
}

export const PROBLEM_WORDS: Record<FormProblem, { en: string; ar: string }> = {
  category: { en: "Choose a category", ar: "اختر التصنيف" },
  amount: { en: "Write the amount", ar: "اكتب المبلغ" },
  date: { en: "Choose the date", ar: "اختر التاريخ" },
  quantity: {
    en: "Write how many pieces were bought",
    ar: "اكتب عدد القطع المشتراة",
  },
};

/** A money amount in the currency's own decimals (BHD has three). */
export function roundMoney(value: number, currency: string) {
  const f = 10 ** moneyFractionDigits(currency);
  return Math.round(value * f) / f;
}

/**
 * The row the form writes. A category matching one the store used is written as it was spelt
 * (one spelling each); a running cost carries no quantity; a stock purchase its unit cost.
 */
export function expensePayload(form: ExpenseForm, usedCategories: readonly string[]) {
  const typed = form.category.trim().replace(/\s+/g, " ");
  const category =
    usedCategories.find((c) => c.toLocaleLowerCase() === typed.toLocaleLowerCase()) ?? typed;
  const amount = roundMoney(Number(form.amount) || 0, form.currency);
  const quantity = form.kind === "cogs" ? Math.max(1, Number(form.quantity) || 0) : 1;
  return {
    category,
    description: form.description.trim() || null,
    amount,
    currency: form.currency,
    expense_date: form.date,
    expense_type: form.kind,
    quantity,
    unit_type: form.kind === "cogs" ? form.unit.trim() || null : "pcs",
    unit_cost: form.kind === "cogs" ? Number((amount / quantity).toFixed(4)) : amount,
    vendor_id: form.vendorId || null,
    store_name: form.storeName.trim() || null,
    is_recurring: form.repeats,
    recurrence_period: form.period,
    notes: form.notes.trim() || null,
  };
}
