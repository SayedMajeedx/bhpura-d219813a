import { recurringDate } from "./recurring";

/**
 * What a month's expenses say at a glance: each category against the three months before it
 * and against the store's budget for it, and what repeats in the month (recorded already, or on
 * its way). Pure; read from the expenses the page already holds.
 */

type InsightExpense = {
  id: string;
  category: string;
  amount: number | string;
  currency?: string | null;
  expense_date: string;
  description?: string | null;
  is_recurring?: boolean | null;
  recurrence_period?: string | null;
  recurring_source_id?: string | null;
};

type Budget = { category: string; monthly_amount: number };

const key = (category: string) => category.trim().toLocaleLowerCase();
const monthKey = (day: string) => day.slice(0, 7);

function shift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export type CategoryMonth = {
  category: string;
  /** Spent in the month. */
  spent: number;
  /**
   * The average of the three months before it, counting only months since the store's first
   * recorded expense (a month in that time with nothing counts as nothing).
   */
  average: number;
  /** Against that average, as a share (+0.25 is a quarter more); null with no average. */
  change: number | null;
  budget: number | null;
  /** Spent as a share of the budget (1 is all of it); null with no budget. */
  used: number | null;
  over: boolean;
};

/** Each category of the month, the most spent first; a budgeted category shows with nothing spent. */
export function categoryMonths(
  expenses: readonly InsightExpense[],
  month: string,
  storeCurrency: string,
  budgets: readonly Budget[] = [],
): CategoryMonth[] {
  // Only the months since the store recorded its first expense: a month before it kept any is
  // not a month it spent nothing in. Pura's rent, the same 50.000 since August, read "+50%" in
  // October against an average that counted July as zero (2026-11-16).
  const kept = expenses
    .filter((e) => !e.currency || e.currency === storeCurrency)
    .map((e) => monthKey(e.expense_date))
    .filter(Boolean)
    .sort();
  const firstMonth = kept[0] ?? month;
  const before = [shift(month, -1), shift(month, -2), shift(month, -3)].filter(
    (m) => m >= firstMonth,
  );
  const names = new Map<string, string>();
  const spent = new Map<string, number>();
  const earlier = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.currency && expense.currency !== storeCurrency) continue;
    const k = key(expense.category);
    if (!k) continue;
    const m = monthKey(expense.expense_date);
    const amount = Number(expense.amount) || 0;
    if (m === month) {
      names.set(k, names.get(k) ?? expense.category.trim());
      spent.set(k, (spent.get(k) ?? 0) + amount);
    } else if (before.includes(m)) {
      names.set(k, names.get(k) ?? expense.category.trim());
      earlier.set(k, (earlier.get(k) ?? 0) + amount);
    }
  }
  const budgetOf = new Map(budgets.map((b) => [key(b.category), b]));
  for (const b of budgets) if (!names.has(key(b.category))) names.set(key(b.category), b.category);
  return [...names.entries()]
    .map(([k, category]): CategoryMonth => {
      const s = spent.get(k) ?? 0;
      const average = before.length ? (earlier.get(k) ?? 0) / before.length : 0;
      const budget = budgetOf.get(k)?.monthly_amount ?? null;
      return {
        category,
        spent: s,
        average,
        change: average > 0 ? (s - average) / average : null,
        budget,
        used: budget ? s / budget : null,
        over: budget !== null && s > budget + 0.0005,
      };
    })
    .filter((row) => row.spent > 0 || row.budget !== null)
    .sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category));
}

export type MonthRepeat = {
  /** The repeating expense (the template). */
  id: string;
  description: string | null;
  category: string;
  amount: number;
  currency: string | null;
  /** Its day in the month. */
  day: string;
  /** Already recorded in the month (its copy, or the template itself). */
  recorded: boolean;
};

/**
 * What repeats in a month: each repeating expense's day in it, from its own date on, and
 * whether the database has recorded it yet (it does on the day, at midnight in the Gulf).
 */
export function repeatsInMonth(expenses: readonly InsightExpense[], month: string): MonthRepeat[] {
  const recordedFrom = new Set(
    expenses
      .filter((e) => e.recurring_source_id && monthKey(e.expense_date) === month)
      .map((e) => e.recurring_source_id as string),
  );
  const rows: MonthRepeat[] = [];
  for (const template of expenses) {
    if (!template.is_recurring || template.recurring_source_id) continue;
    const start = template.expense_date.slice(0, 10);
    if (monthKey(start) > month) continue;
    let day: string | null = monthKey(start) === month ? start : null;
    for (let step = 1; !day && step <= 240; step++) {
      const next = recurringDate(start, template.recurrence_period ?? "monthly", step);
      if (monthKey(next) === month) day = next;
      if (monthKey(next) > month) break;
    }
    if (!day) continue;
    rows.push({
      id: template.id,
      description: template.description ?? null,
      category: template.category,
      amount: Number(template.amount) || 0,
      currency: template.currency ?? null,
      day,
      recorded: day === start || recordedFrom.has(template.id),
    });
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}
