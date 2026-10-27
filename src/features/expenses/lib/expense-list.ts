import { orderNumberLabel, type OrderNumberFormat } from "@/lib/order-number";

/** What the list rules read of an expense. */
type ListedExpense = {
  category: string;
  expense_date: string;
  description?: string | null;
  store_name?: string | null;
  notes?: string | null;
};

/**
 * The currency an expense is written in: its own when it has one (an expense being edited, a
 * scanned foreign receipt), and the store's for a new one.
 */
export function expenseCurrency(
  expense: { currency?: string | null } | null | undefined,
  storeCurrency: string,
): string {
  return expense?.currency || storeCurrency;
}

/** The categories the store has used, one spelling each (the first seen), in the reader's order. */
export function expenseCategories(list: readonly ListedExpense[], locale: string): string[] {
  const canonical = new Map<string, string>();
  list.forEach((expense) => {
    const value = expense.category.trim();
    if (value && !canonical.has(value.toLocaleLowerCase()))
      canonical.set(value.toLocaleLowerCase(), value);
  });
  return [...canonical.values()].sort((a, b) => a.localeCompare(b, locale));
}

/**
 * The expenses a view shows: dated inside the range (whole days, an empty bound is open), with
 * the search text in the description, store, notes or category, and of the chosen category.
 */
export function filterExpenses<T extends ListedExpense>(
  list: readonly T[],
  view: { from: string; to: string; search: string; category: string },
): T[] {
  return list.filter((expense) => {
    const key = expense.expense_date.slice(0, 10);
    const matchesDate = (!view.from || key >= view.from) && (!view.to || key <= view.to);

    const matchesSearch =
      !view.search ||
      [expense.description, expense.store_name, expense.notes, expense.category].some((field) =>
        String(field ?? "")
          .toLowerCase()
          .includes(view.search.toLowerCase()),
      );

    const matchesCategory = view.category === "all" || expense.category === view.category;

    return matchesDate && matchesSearch && matchesCategory;
  });
}

type CogsCsvOrder = {
  created_at: string;
  invoice_number: number | string | null;
  order_items?: ReadonlyArray<{
    description?: string | null;
    quantity: number | string;
    unit_cost?: number | string | null;
  }> | null;
};

/** The cost-of-goods download: a line per order line, then the total. */
export function cogsCsv(
  rows: readonly CogsCsvOrder[],
  lang: string,
  locale: string,
  numberFormat?: OrderNumberFormat | null,
): string {
  const lines: string[] = [
    lang === "ar"
      ? "التاريخ,رقم الطلب,المنتج,الكمية,تكلفة الوحدة,إجمالي التكلفة"
      : "Date,Order #,Product,Qty,Unit Cost,Total Cost",
  ];
  let grandTotal = 0;
  for (const order of rows) {
    for (const item of order.order_items ?? []) {
      const cost = Number(item.unit_cost ?? 0);
      const itemTotal = cost * Number(item.quantity);
      grandTotal += itemTotal;
      lines.push(
        [
          new Date(order.created_at).toLocaleDateString(locale),
          orderNumberLabel(order.invoice_number, numberFormat),
          `"${(item.description ?? "").replace(/"/g, '""')}"`,
          item.quantity,
          cost.toFixed(3),
          itemTotal.toFixed(3),
        ].join(","),
      );
    }
  }
  lines.push("");
  lines.push(
    lang === "ar" ? `,,,,الإجمالي,${grandTotal.toFixed(3)}` : `,,,,Total,${grandTotal.toFixed(3)}`,
  );
  return lines.join("\n");
}

/** The name the cost-of-goods download is saved under. */
export function cogsCsvFileName(range: { from: string; to: string }): string {
  return `cogs_${range.from || "start"}_${range.to || "end"}.csv`;
}

/** What staff read when a receipt could not be scanned. */
export function scanFailureMessage(code: string | undefined, lang: string): string {
  const isAr = lang === "ar";
  return code === "RATE_LIMITED"
    ? isAr
      ? "تجاوزت الحد. حاول لاحقاً"
      : "Rate limited, try again"
    : code === "GEMINI_MODEL_UNAVAILABLE"
      ? isAr
        ? "نموذج الذكاء الاصطناعي غير متاح حالياً"
        : "The AI scanner model is currently unavailable"
      : code === "PDF_TOO_LARGE"
        ? isAr
          ? "ملف PDF كبير جداً. الحد 2.5 ميغابايت"
          : "PDF is too large (max 2.5MB)"
        : code === "IMAGE_TOO_LARGE" || code === "IMAGE_PROCESSING_FAILED"
          ? isAr
            ? "تعذر ضغط الصورة. يرجى التقاط صورة أوضح وأقرب"
            : "Could not prepare the image. Try a closer, clearer photo"
          : (code ?? (isAr ? "فشل مسح الفاتورة" : "Failed to scan receipt"));
}
