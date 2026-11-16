import { ExternalLink, FileText, Pencil, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import type { ExpenseRow } from "@/lib/data/expenses";
import { categoryLabel } from "@/features/expenses/lib/expense-form";
import { expenseTotals } from "@/features/expenses/lib/expense-list";
import { recurringDate } from "@/features/expenses/lib/recurring";

type Lang = "ar" | "en";

const supplierOf = (expense: ExpenseRow) =>
  (expense as { vendors?: { name?: string | null } | null }).vendors?.name || expense.store_name;

/** When a repeating expense next falls, as the database will write it. */
export function nextRepeat(expense: ExpenseRow) {
  return (
    expense.next_recurrence_date ??
    recurringDate(
      expense.expense_date,
      expense.recurrence_period ?? "monthly",
      Number(expense.recurring_generated ?? 0) + 1,
    )
  );
}

function RepeatBadge({ expense, lang }: { expense: ExpenseRow; lang: Lang }) {
  const isAr = lang === "ar";
  if (expense.is_recurring) {
    const yearly = expense.recurrence_period === "yearly";
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
        <Repeat className="h-3 w-3" aria-hidden="true" />
        {isAr
          ? `يتكرر ${yearly ? "سنوياً" : "شهرياً"} · التالي ${formatDate(nextRepeat(expense), "ar-BH")}`
          : `Repeats ${yearly ? "yearly" : "monthly"} · next ${formatDate(nextRepeat(expense), "en-BH")}`}
      </span>
    );
  }
  if (expense.recurring_source_id) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
        <Repeat className="h-3 w-3" aria-hidden="true" />
        {isAr ? "تلقائي" : "Automatic"}
      </span>
    );
  }
  return null;
}

function KindBadge({ expense, lang }: { expense: ExpenseRow; lang: Lang }) {
  const stock = expense.expense_type === "cogs";
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      {stock
        ? lang === "ar"
          ? "مشتريات مخزون"
          : "Stock purchase"
        : lang === "ar"
          ? "تشغيلي"
          : "Running cost"}
    </span>
  );
}

/**
 * The expenses of the period, one list for every kind: a table from `sm` up and a card per
 * expense on a phone, each with its kind, category in the reader's words, supplier, repeat and
 * receipt, and the period's totals under it. The page had two lists of the same expenses.
 */
export function ExpensesList({
  lang,
  expenses,
  storeCurrency,
  onEdit,
  onDelete,
  onStopRepeat,
}: {
  lang: Lang;
  expenses: ExpenseRow[];
  storeCurrency: string;
  onEdit: (expense: ExpenseRow) => void;
  onDelete: (expense: ExpenseRow) => void;
  onStopRepeat: (expense: ExpenseRow) => void;
}) {
  const isAr = lang === "ar";
  const money = (amount: number, currency?: string | null) =>
    formatMoney(amount, currency || storeCurrency, lang);
  const totals = expenseTotals(expenses, storeCurrency);
  const day = (value: string) => formatDate(value, isAr ? "ar-BH" : "en-BH");

  if (!expenses.length) {
    return (
      <p className="rounded-2xl border border-border-subtle bg-card p-8 text-center text-sm text-muted-foreground">
        {isAr ? "لا توجد مصاريف في هذه الفترة." : "No expenses in this period."}
      </p>
    );
  }

  const actions = (expense: ExpenseRow) => (
    <div className="flex items-center justify-end gap-1">
      {expense.is_recurring && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => onStopRepeat(expense)}
        >
          {isAr ? "إيقاف التكرار" : "Stop repeating"}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => onEdit(expense)}
        aria-label={
          isAr ? `تعديل ${expense.description ?? ""}` : `Edit ${expense.description ?? ""}`
        }
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:bg-destructive/10"
        onClick={() => onDelete(expense)}
        aria-label={
          isAr ? `حذف ${expense.description ?? ""}` : `Delete ${expense.description ?? ""}`
        }
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  const receipt = (expense: ExpenseRow) =>
    expense.receipt_url ? (
      <a
        href={expense.receipt_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        {isAr ? "الإيصال" : "Receipt"}
        <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
      </a>
    ) : null;

  const totalsLine = (
    <div className="flex flex-wrap items-baseline justify-end gap-x-5 gap-y-1 text-sm">
      {totals.stock > 0 && (
        <span className="text-muted-foreground">
          {isAr ? "مشتريات مخزون: " : "Stock purchases: "}
          <span className="font-mono text-foreground">{money(totals.stock)}</span>
        </span>
      )}
      <span className="text-muted-foreground">
        {isAr ? "مصاريف تشغيلية: " : "Running costs: "}
        <span className="font-mono text-foreground">{money(totals.running)}</span>
      </span>
      <span className="font-semibold">
        {isAr ? "المجموع: " : "Total: "}
        <span className="font-mono">{money(totals.total)}</span>
      </span>
      {totals.otherCurrency > 0 && (
        <span className="w-full text-end text-xs text-muted-foreground">
          {isAr
            ? `ومصاريف بعملة أخرى خارج المجموع: ${totals.otherCurrency}`
            : `And expenses in another currency, not in the total: ${totals.otherCurrency}`}
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-2.5">
      <div className="space-y-2 sm:hidden">
        {expenses.map((expense) => (
          <article key={expense.id} className="rounded-xl border border-border-subtle bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words font-semibold" dir="auto">
                  {expense.description || categoryLabel(expense.category, lang)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {day(expense.expense_date)} · {categoryLabel(expense.category, lang)}
                  {supplierOf(expense) ? ` · ${supplierOf(expense)}` : ""}
                </p>
              </div>
              <span className="shrink-0 font-mono font-semibold">
                {money(Number(expense.amount), expense.currency)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <KindBadge expense={expense} lang={lang} />
              <RepeatBadge expense={expense} lang={lang} />
              {receipt(expense)}
            </div>
            <div className="mt-1">{actions(expense)}</div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border-subtle bg-card sm:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-muted/40 text-xs text-muted-foreground">
                <th className="p-3 text-start font-medium">{isAr ? "التاريخ" : "Date"}</th>
                <th className="p-3 text-start font-medium">{isAr ? "الوصف" : "Description"}</th>
                <th className="p-3 text-start font-medium">{isAr ? "التصنيف" : "Category"}</th>
                <th className="p-3 text-start font-medium">{isAr ? "المورد" : "Supplier"}</th>
                <th className="p-3 text-end font-medium">{isAr ? "المبلغ" : "Amount"}</th>
                <th className="p-3">
                  <span className="sr-only">{isAr ? "إجراءات" : "Actions"}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {expenses.map((expense) => (
                <tr key={expense.id} className="align-top hover:bg-muted/30">
                  <td className="whitespace-nowrap p-3 font-mono text-xs">
                    {day(expense.expense_date)}
                  </td>
                  <td className="p-3">
                    <p className="line-clamp-2 max-w-72 break-words font-medium" dir="auto">
                      {expense.description || "—"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <KindBadge expense={expense} lang={lang} />
                      <RepeatBadge expense={expense} lang={lang} />
                      {receipt(expense)}
                    </div>
                    {expense.notes && (
                      <p
                        className="mt-1 line-clamp-2 max-w-72 break-words text-xs text-muted-foreground"
                        dir="auto"
                      >
                        {expense.notes}
                      </p>
                    )}
                  </td>
                  <td className="p-3 text-xs">{categoryLabel(expense.category, lang)}</td>
                  <td className="p-3 text-xs text-muted-foreground" dir="auto">
                    {supplierOf(expense) || "—"}
                  </td>
                  <td className="whitespace-nowrap p-3 text-end font-mono font-semibold">
                    {money(Number(expense.amount), expense.currency)}
                  </td>
                  <td className="p-2">{actions(expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border-subtle px-3 py-2.5">{totalsLine}</div>
      </div>
      <div className="rounded-xl border border-border-subtle bg-card px-3 py-2.5 sm:hidden">
        {totalsLine}
      </div>
    </div>
  );
}
