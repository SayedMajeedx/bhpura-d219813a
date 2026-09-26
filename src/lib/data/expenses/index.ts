import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
};

/** The brand's expenses, newest first. */
export async function fetchExpenses(brandId: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("brand_id", brandId)
    .order("expense_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type ExpenseRow = Awaited<ReturnType<typeof fetchExpenses>>[number];

/**
 * The brand's expenses for the data export and full backup, newest first. A
 * failed read exports none (and is logged). Bug backlog #28: this used to
 * select `date`, `title` and `payment_method`, which expenses do not have, so
 * the read always failed.
 */
export async function fetchExpenseExportRows(brandId: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select("id, expense_date, category, description, amount, notes, created_at")
    .eq("brand_id", brandId)
    .order("expense_date", { ascending: false });
  if (error) {
    console.warn("Could not query expenses:", error.message);
    return [];
  }
  return data ?? [];
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
};

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
