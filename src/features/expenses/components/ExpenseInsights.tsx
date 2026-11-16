import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Check, Clock, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, moneyFractionDigits } from "@/lib/format";
import { currencyLabel } from "@/lib/currency-label";
import {
  expensesKeys,
  saveExpenseBudgets,
  type ExpenseBudget,
  type ExpenseRow,
} from "@/lib/data/expenses";
import { categoryLabel, CATEGORY_WORDS } from "@/features/expenses/lib/expense-form";
import { categoryMonths, repeatsInMonth } from "@/features/expenses/lib/expense-insights";

type Lang = "ar" | "en";

/**
 * A month at a glance, above its list: each category against the three months before it and
 * against the store's budget (`categoryMonths`), and what repeats in the month, recorded or on
 * its way (`repeatsInMonth`). Budgets are set in `BudgetsDialog`.
 */
export function ExpenseInsights({
  lang,
  month,
  expenses,
  budgets,
  storeCurrency,
  brandId,
}: {
  lang: Lang;
  month: string;
  expenses: ExpenseRow[];
  budgets: ExpenseBudget[];
  storeCurrency: string;
  brandId: string;
}) {
  const isAr = lang === "ar";
  const [editing, setEditing] = useState(false);
  const rows = categoryMonths(expenses, month, storeCurrency, budgets);
  const repeats = repeatsInMonth(expenses, month);
  const money = (amount: number, currency?: string | null) =>
    formatMoney(amount, currency || storeCurrency, lang);
  const over = rows.filter((row) => row.over);
  const usedCategories = [...new Set(expenses.map((e) => e.category.trim()).filter(Boolean))];

  return (
    <div className="space-y-2.5">
      {over.length > 0 && (
        <p
          role="status"
          className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground"
        >
          {isAr ? "تجاوز الميزانية: " : "Over budget: "}
          {over
            .map(
              (row) =>
                `${categoryLabel(row.category, lang)} (${money(row.spent)} / ${money(row.budget ?? 0)})`,
            )
            .join(isAr ? "، " : ", ")}
        </p>
      )}
      <div className="grid gap-2.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="rounded-2xl border border-border-subtle bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {isAr ? "الشهر حسب التصنيف" : "The month by category"}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setEditing(true)}
            >
              <Target className="h-4 w-4" aria-hidden="true" />
              {isAr ? "الميزانيات" : "Budgets"}
            </Button>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isAr
              ? "مقارنة بمتوسط الأشهر الثلاثة السابقة"
              : "Against the average of the three months before"}
          </p>
          {rows.length ? (
            <ul className="mt-3 space-y-3">
              {rows.map((row) => (
                <li key={row.category}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{categoryLabel(row.category, lang)}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      {row.change !== null && Math.abs(row.change) >= 0.005 && (
                        <span
                          className={cn(
                            "inline-flex items-center text-xs",
                            row.change > 0 ? "text-warning" : "text-success",
                          )}
                        >
                          {row.change > 0 ? (
                            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                          )}
                          <span dir="ltr">{Math.abs(row.change * 100).toFixed(0)}%</span>
                        </span>
                      )}
                      <span className="font-mono font-semibold">{money(row.spent)}</span>
                    </span>
                  </div>
                  {row.budget !== null && (
                    <div className="mt-1.5">
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                        role="meter"
                        aria-label={
                          isAr
                            ? `${categoryLabel(row.category, lang)} من الميزانية`
                            : `${categoryLabel(row.category, lang)} of its budget`
                        }
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round((row.used ?? 0) * 100)}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full",
                            row.over ? "bg-warning" : "bg-primary",
                          )}
                          style={{ width: `${Math.min(100, (row.used ?? 0) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {isAr ? "من ميزانية " : "of a budget of "}
                        <span className="font-mono">{money(row.budget)}</span>
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {isAr ? "لا مصاريف في هذا الشهر بعد." : "No expenses this month yet."}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-border-subtle bg-card p-4">
          <h2 className="text-sm font-semibold">
            {isAr ? "ما يتكرر هذا الشهر" : "Repeating this month"}
          </h2>
          {repeats.length ? (
            <>
              <ul className="mt-3 space-y-2.5">
                {repeats.map((repeat) => (
                  <li key={repeat.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="line-clamp-2 break-words" dir="auto">
                        {repeat.description || categoryLabel(repeat.category, lang)}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        {repeat.recorded ? (
                          <>
                            <Check className="h-3 w-3 text-success" aria-hidden="true" />
                            {isAr ? "سُجّل" : "Recorded"}
                          </>
                        ) : (
                          <>
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {isAr ? "يُسجَّل يوم " : "Recorded on "}
                            {formatDate(repeat.day, isAr ? "ar-BH" : "en-BH")}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono">
                      {money(repeat.amount, repeat.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-border-subtle pt-2 text-end text-sm">
                {isAr ? "المجموع: " : "Total: "}
                <span className="font-mono font-semibold">
                  {money(
                    repeats
                      .filter((r) => !r.currency || r.currency === storeCurrency)
                      .reduce((s, r) => s + r.amount, 0),
                  )}
                </span>
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {isAr
                ? "لا مصاريف متكررة. فعّل «يتكرر تلقائياً» في الإيجار والرواتب."
                : "Nothing repeats. Turn on “Repeats by itself” for rent and wages."}
            </p>
          )}
        </section>
      </div>

      {editing && (
        <BudgetsDialog
          lang={lang}
          brandId={brandId}
          storeCurrency={storeCurrency}
          budgets={budgets}
          categories={usedCategories}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

/** The store's monthly budget per category: a field per category, empty for none. */
function BudgetsDialog({
  lang,
  brandId,
  storeCurrency,
  budgets,
  categories,
  onClose,
}: {
  lang: Lang;
  brandId: string;
  storeCurrency: string;
  budgets: ExpenseBudget[];
  categories: string[];
  onClose: () => void;
}) {
  const isAr = lang === "ar";
  const ids = useId();
  const qc = useQueryClient();
  const builtIn = Object.keys(CATEGORY_WORDS).filter((c) => c !== "Other");
  const all = [
    ...new Map(
      [...builtIn, ...categories, ...budgets.map((b) => b.category)].map((c) => [
        c.trim().toLocaleLowerCase(),
        c.trim(),
      ]),
    ).values(),
  ];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      all.map((c) => [
        c,
        String(
          budgets.find((b) => b.category.trim().toLocaleLowerCase() === c.toLocaleLowerCase())
            ?.monthly_amount ?? "",
        ),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const digits = moneyFractionDigits(storeCurrency);

  const save = async () => {
    setSaving(true);
    try {
      await saveExpenseBudgets(
        brandId,
        budgets,
        all.map((category) => ({ category, monthly_amount: Number(values[category]) || 0 })),
      );
      await qc.invalidateQueries({ queryKey: expensesKeys.budgets(brandId) });
      toast.success(isAr ? "حُفظت الميزانيات" : "Budgets saved");
      onClose();
    } catch {
      toast.error(isAr ? "تعذر حفظ الميزانيات" : "The budgets could not be saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isAr ? "الميزانية الشهرية" : "Monthly budgets"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? `كم تنوي أن تصرف كل شهر على كل تصنيف (${currencyLabel(storeCurrency, "ar")}). اتركه فارغاً لتصنيف بلا ميزانية.`
            : `How much you mean to spend a month on each category (${currencyLabel(storeCurrency, "en")}). Leave it empty for none.`}
        </p>
        <div className="space-y-2">
          {all.map((category, index) => (
            <div key={category} className="flex items-center justify-between gap-3">
              <label htmlFor={`${ids}-${index}`} className="min-w-0 flex-1 truncate text-sm">
                {categoryLabel(category, lang)}
              </label>
              <Input
                id={`${ids}-${index}`}
                type="number"
                inputMode="decimal"
                min={0}
                step={digits > 0 ? 1 / 10 ** digits : 1}
                value={values[category] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [category]: e.target.value }))}
                className="w-36 font-mono"
              />
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {isAr ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
