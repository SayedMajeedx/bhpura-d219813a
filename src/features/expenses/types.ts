import type { ScannedLineItem } from "@/lib/scan-receipt.functions";

/** One expense as the page lists it. */
export type Expense = {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  expense_type?: "opex" | "cogs" | string | null;
  notes: string | null;
  store_name?: string | null;
  receipt_time?: string | null;
  tax_amount?: number | null;
  tax_rate?: number | null;
  line_items?: ScannedLineItem[] | null;
  receipt_url?: string | null;
};

export type DatePreset = "today" | "week" | "month" | "custom";
