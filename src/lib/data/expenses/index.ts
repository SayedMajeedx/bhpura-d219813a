import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAll } from "../read-all";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/**
 * Brand expenses for the expenses page, its OpEx/COGS and reports tabs and the
 * dashboard. One key and one column list: before this, the tabs shared a key
 * with different columns (with and without the vendor name), and saving on the
 * expenses page did not refresh the tabs or the dashboard.
 */

/** Every expense with its vendor's name. Type: `ExpenseRow`. */
export const EXPENSE_SELECT = "*, vendors(name)";

export const expensesKeys = {
  all: (brandId: string) => ["expenses", brandId] as const,
  list: (brandId: string) => [...expensesKeys.all(brandId), "list"] as const,
  /** The columns the data export writes (refreshed with every expenses write). */
  exportRows: (brandId: string) => [...expensesKeys.all(brandId), "export"] as const,
  /** The store's monthly budget per category (staff who see the finances). */
  budgets: (brandId: string) => [...expensesKeys.all(brandId), "budgets"] as const,
};

/** The brand's expenses, newest first. */
export async function fetchExpenses(brandId: string) {
  return readAll((from, to) =>
    supabase
      .from("expenses")
      .select(EXPENSE_SELECT, { count: "exact" })
      .eq("brand_id", brandId)
      .order("expense_date", { ascending: false })
      .order("id")
      .range(from, to),
  );
}

export type ExpenseRow = Awaited<ReturnType<typeof fetchExpenses>>[number];

/**
 * The brand's expenses for the data export and full backup, newest first. A
 * failed read exports none (and is logged). Bug backlog #28: this used to
 * select `date`, `title` and `payment_method`, which expenses do not have, so
 * the read always failed.
 */
export async function fetchExpenseExportRows(brandId: string) {
  return readAll((from, to) =>
    supabase
      .from("expenses")
      .select("id, expense_date, category, description, amount, notes, created_at", {
        count: "exact",
      })
      .eq("brand_id", brandId)
      .order("expense_date", { ascending: false })
      .order("id")
      .range(from, to),
  ).catch((error: unknown) => {
    console.warn("Could not query expenses:", (error as { message?: string })?.message);
    return [];
  });
}
export type ExpenseExportRow = Awaited<ReturnType<typeof fetchExpenseExportRows>>[number];

/** One line of the expenses file (the export preset's columns). */
export function toExpenseExportLine(expense: ExpenseExportRow) {
  return {
    date: (expense.expense_date || expense.created_at || "").slice(0, 10),
    category: expense.category || "General",
    title: expense.description || "Expense",
    amount: Number(expense.amount) || 0,
    // Expenses record no payment method.
    payment_method: "—",
    notes: expense.notes || "—",
  };
}

export const expensesQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: expensesKeys.list(brandId),
      queryFn: () => fetchExpenses(brandId),
      staleTime: 60_000,
    }),
  exportRows: (brandId: string) =>
    queryOptions({
      queryKey: expensesKeys.exportRows(brandId),
      queryFn: () => fetchExpenseExportRows(brandId),
      enabled: Boolean(brandId),
    }),
  budgets: (brandId: string) =>
    queryOptions({
      queryKey: expensesKeys.budgets(brandId),
      queryFn: () => fetchExpenseBudgets(brandId),
      enabled: Boolean(brandId),
      staleTime: 60_000,
    }),
};

export type ExpenseBudget = { id: string; category: string; monthly_amount: number };

/**
 * The store's monthly budgets (migration 20261211100000): one per category. A store with none,
 * or a database the migration has not reached yet, reads as none.
 */
export async function fetchExpenseBudgets(brandId: string): Promise<ExpenseBudget[]> {
  const { data, error } = await supabase
    .from("expense_budgets")
    .select("id, category, monthly_amount")
    .eq("brand_id", brandId)
    .order("category")
    .limit(200);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []).map((row) => ({ ...row, monthly_amount: Number(row.monthly_amount) }));
}

/**
 * Saves the store's budgets as one set: a category with an amount is written (updated when it
 * has one), and a budget whose category is left out or cleared is removed.
 */
export async function saveExpenseBudgets(
  brandId: string,
  current: readonly ExpenseBudget[],
  wanted: ReadonlyArray<{ category: string; monthly_amount: number }>,
) {
  const key = (category: string) => category.trim().toLocaleLowerCase();
  const byKey = new Map(current.map((b) => [key(b.category), b]));
  const keep = new Set<string>();
  for (const budget of wanted) {
    if (!(budget.monthly_amount > 0) || !budget.category.trim()) continue;
    const existing = byKey.get(key(budget.category));
    keep.add(key(budget.category));
    if (existing) {
      if (existing.monthly_amount === budget.monthly_amount) continue;
      const { error } = await supabase
        .from("expense_budgets")
        .update({ monthly_amount: budget.monthly_amount })
        .eq("id", existing.id)
        .eq("brand_id", brandId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("expense_budgets").insert({
        brand_id: brandId,
        category: budget.category.trim(),
        monthly_amount: budget.monthly_amount,
      });
      if (error) throw error;
    }
  }
  const gone = current.filter((b) => !keep.has(key(b.category))).map((b) => b.id);
  if (gone.length) {
    const { error } = await supabase
      .from("expense_budgets")
      .delete()
      .eq("brand_id", brandId)
      .in("id", gone);
    if (error) throw error;
  }
}

/** Every expenses view of the brand is stale after a write. */
export function invalidateExpenses(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: expensesKeys.all(brandId) });
}

export async function createExpense(expense: TablesInsert<"expenses">) {
  const { error } = await supabase.from("expenses").insert(expense);
  if (error) throw error;
}

export async function updateExpense(
  brandId: string,
  expenseId: string,
  patch: TablesUpdate<"expenses">,
) {
  const { error } = await supabase
    .from("expenses")
    .update(patch)
    .eq("id", expenseId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

export async function deleteExpense(brandId: string, expenseId: string) {
  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", expenseId)
    .eq("brand_id", brandId);
  if (error) throw error;
}
