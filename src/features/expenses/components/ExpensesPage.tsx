import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { cn } from "@/lib/utils";
import { deletePublicMediaUrl } from "@/lib/r2-upload";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  deleteExpense,
  expensesQueries,
  invalidateExpenses,
  updateExpense,
  type ExpenseRow,
} from "@/lib/data/expenses";
import { ordersQueries } from "@/lib/data/orders";
import { accountingQueries } from "@/lib/data/accounting";
import { reportingQueries } from "@/lib/data/reporting";
import { moneyFractionDigits } from "@/lib/format";
import { isServicesProfile } from "@/lib/store-profile";
import { ExpensesCommandHeader } from "@/components/expenses/ExpensesCommandHeader";
import { ExpensesScopeSwitcher } from "@/components/expenses/ExpensesScopeSwitcher";
import { CashFlowLiquidityTab } from "@/components/accounting/CashFlowLiquidityTab";
import { scanReceipt, type ScannedExpense } from "@/lib/scan-receipt.functions";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { useOrderNumberFormat } from "@/hooks/use-order-number";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { downloadWorkbook, workbookFileName } from "@/features/finance-reports/lib/workbook";
import { localDateKey } from "@/features/expenses/lib/date-range";
import {
  cogsCsv,
  cogsCsvFileName,
  expenseCategories,
  filterExpenses,
  scanFailureMessage,
} from "@/features/expenses/lib/expense-list";
import { periodFigures, reportRangeOfDays } from "@/features/expenses/lib/profit-and-loss";
import { prepareReceiptForScanning } from "@/features/expenses/lib/receipt-scan";
import {
  periodDays,
  periodLabel,
  periodShowing,
  thisMonth,
  type ExpensePeriod,
} from "@/features/expenses/lib/period";
import { expensesSheet } from "@/features/expenses/lib/expense-sheet";
import { ExpenseFormDialog } from "@/features/expenses/components/ExpenseFormDialog";
import {
  ExpensesFilterBar,
  type KindFilter,
} from "@/features/expenses/components/ExpensesFilterBar";
import { ExpensesList } from "@/features/expenses/components/ExpensesList";
import { ExpenseInsights } from "@/features/expenses/components/ExpenseInsights";
import { ReceiptReviewDialog } from "@/features/expenses/components/ReceiptReviewDialog";

/**
 * The expenses page, read top to bottom: the heading (add, scan a receipt), the period's profit
 * and loss (the Reports' own figures), one filter (period, kind, category, search) and one list
 * with its totals. It once stacked two lists, two add forms and two period filters, an income
 * statement and a cash flow statement of its own, and a supplier directory.
 */
export function ExpensesPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const words = isAr ? "ar" : "en";
  const locale = isAr ? "ar-BH-u-nu-latn" : "en-US";
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;
  const currency = useStoreCurrency(brandId);
  const numberFormat = useOrderNumberFormat(brandId);
  const { modules } = useAdminStoreProfile(brandId).profile;

  const q = useQuery({ ...expensesQueries.list(brandId), retry: false });
  const budgetsQ = useQuery(expensesQueries.budgets(brandId));
  const list = useMemo(() => (q.data ?? []) as ExpenseRow[], [q.data]);

  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scanned, setScanned] = useState<ScannedExpense | null>(null);
  const [scanning, setScanning] = useState(false);
  const [period, setPeriod] = useState<ExpensePeriod>(() => thisMonth());
  const [kind, setKind] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<"expenses" | "cash">("expenses");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scanFn = useServerFn(scanReceipt);

  const offerStock =
    modules.packaging || modules.stock || list.some((e) => e.expense_type === "cogs");
  const categories = useMemo(() => expenseCategories(list, locale), [list, locale]);
  const days = periodDays(period);
  const shown = useMemo(
    () => filterExpenses(list, { from: days.from, to: days.to, search, category, kind }),
    [list, days.from, days.to, search, category, kind],
  );

  // The period's profit and loss is the Reports' own (every period: from the first expense).
  const today = localDateKey(new Date());
  const firstDay = list.length ? list[list.length - 1].expense_date.slice(0, 10) : today;
  const reportRange = reportRangeOfDays(days.from || firstDay, days.to || today);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const periodQ = useQuery({
    ...reportingQueries.overview(brand.slug, reportRange, timeZone, false),
    retry: 1,
  });
  const figures = useMemo(
    () => periodFigures(Array.isArray(periodQ.data) ? periodQ.data : null, currency),
    [periodQ.data, currency],
  );
  const cogsQ = useQuery({
    ...ordersQueries.cogs(brandId, days.from, days.to),
    enabled: offerStock,
  });

  // The cash box and bank stay reachable only while they hold something: every store's are at
  // zero, kept by hand order by order, and the tab read like a statement of nothing.
  const accountsQ = useQuery(accountingQueries.cashAccounts(brandId));
  const cashInUse = ((accountsQ.data ?? []) as Array<{ balance?: number | string | null }>).some(
    (account) => Number(account.balance ?? 0) !== 0,
  );

  const showSaved = (day: string) => {
    const next = periodShowing(period, day);
    if (next === period) return;
    setPeriod(next);
    toast.info(
      isAr
        ? `نعرض ${periodLabel(next, "ar")}، شهر المصروف.`
        : `Showing ${periodLabel(next, "en")}, the expense's month.`,
    );
  };

  const remove = async (expense: ExpenseRow) => {
    const ok = await confirmDialog({
      title: isAr ? "حذف هذا المصروف؟" : "Delete this expense?",
      description: expense.is_recurring
        ? isAr
          ? "يتوقف تكراره، وتبقى الأشهر التي سُجّلت منه."
          : "Its repeat stops; the months it recorded stay."
        : undefined,
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteExpense(brandId, expense.id);
      if (expense.receipt_url)
        void deletePublicMediaUrl(brandId, expense.receipt_url).catch(() => undefined);
      toast.success(isAr ? "حُذف المصروف" : "Expense deleted");
      await invalidateExpenses(qc, brandId);
    } catch {
      toast.error(isAr ? "تعذر حذف المصروف" : "The expense could not be deleted");
    }
  };

  const stopRepeat = async (expense: ExpenseRow) => {
    const ok = await confirmDialog({
      title: isAr ? "إيقاف تكرار هذا المصروف؟" : "Stop repeating this expense?",
      description: isAr
        ? "ما سُجّل من الأشهر يبقى، ولا يُسجَّل شهر جديد."
        : "The months already recorded stay; no new month is recorded.",
    });
    if (!ok) return;
    try {
      await updateExpense(brandId, expense.id, { is_recurring: false });
      toast.success(isAr ? "أُوقف التكرار" : "Repeat stopped");
      await invalidateExpenses(qc, brandId);
    } catch {
      toast.error(isAr ? "تعذر إيقاف التكرار" : "Could not stop the repeat");
    }
  };

  const onFilePicked = async (file: File | null) => {
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) {
      toast.error(isAr ? "الملف كبير جداً (الحد 40 ميغابايت)" : "File too large (max 40MB)");
      return;
    }
    setScanning(true);
    try {
      const prepared = await prepareReceiptForScanning(file);
      const result = await scanFn({
        data: { dataUrl: prepared.dataUrl, mimeType: prepared.mimeType, targetLang: words },
      });
      setScanned(result);
      setReviewOpen(true);
      toast.success(isAr ? "تم استخراج بيانات الفاتورة" : "Receipt data extracted");
    } catch (e) {
      toast.error(scanFailureMessage((e as { message?: string })?.message, lang));
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadExcel = async () => {
    try {
      await downloadWorkbook(
        [
          expensesSheet({
            expenses: shown,
            lang: words,
            storeName: (isAr ? brand.name_ar : null) || brand.name_en,
            currency,
            digits: moneyFractionDigits(currency),
            periodText: periodLabel(period, words),
          }),
        ],
        workbookFileName(brand.slug, "expenses", `${days.from || "start"}-to-${days.to || today}`),
      );
    } catch {
      toast.error(isAr ? "تعذر إعداد الملف" : "The file could not be prepared");
    }
  };

  const downloadCogsCsv = () => {
    const blob = new Blob(["﻿", cogsCsv(cogsQ.data ?? [], lang, locale, numberFormat)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = cogsCsvFileName(days);
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3.5">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => void onFilePicked(e.target.files?.[0] ?? null)}
      />

      <ExpensesCommandHeader
        lang={words}
        expenseCount={shown.length}
        scanning={scanning}
        onScanReceipt={() => fileRef.current?.click()}
        onCreateNew={() => {
          setEditing(null);
          setFormOpen(true);
        }}
      />

      <ExpensesScopeSwitcher
        lang={words}
        currency={currency}
        slug={brand.slug}
        figures={figures}
        period={{ from: days.from || firstDay, to: days.to || today }}
      />

      {cashInUse && (
        <div role="tablist" className="flex gap-1 border-b border-border">
          {[
            { id: "expenses" as const, Icon: Receipt, label: isAr ? "المصاريف" : "Expenses" },
            { id: "cash" as const, Icon: Wallet, label: isAr ? "الصندوق والبنك" : "Cash and bank" },
          ].map(({ id, Icon, label }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                "flex min-h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-medium",
                view === id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}

      {view === "cash" && cashInUse ? (
        <CashFlowLiquidityTab />
      ) : (
        <>
          <ExpensesFilterBar
            lang={words}
            period={period}
            onPeriod={setPeriod}
            kind={kind}
            onKind={setKind}
            offerStock={offerStock}
            category={category}
            onCategory={setCategory}
            categories={categories}
            search={search}
            onSearch={setSearch}
            onDownloadExcel={() => void downloadExcel()}
            onDownloadCogs={downloadCogsCsv}
          />
          {period.kind === "month" && (
            <ExpenseInsights
              lang={words}
              month={period.month}
              expenses={list}
              budgets={budgetsQ.data ?? []}
              storeCurrency={currency}
              brandId={brandId}
            />
          )}
          <ExpensesList
            lang={words}
            expenses={shown}
            storeCurrency={currency}
            onEdit={(expense) => {
              setEditing(expense);
              setFormOpen(true);
            }}
            onDelete={(expense) => void remove(expense)}
            onStopRepeat={(expense) => void stopRepeat(expense)}
          />
          <nav
            aria-label={isAr ? "صفحات مرتبطة" : "Related pages"}
            className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-sm"
          >
            <Link
              to="/admin/b/$slug/reports/export"
              params={{ slug: brand.slug }}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {isAr ? "التقرير الشامل والقوائم المالية" : "The full report and statements"}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            {!isServicesProfile(modules) && (
              <Link
                to="/admin/b/$slug/supplier-orders"
                params={{ slug: brand.slug }}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {isAr ? "الموردون وطلبياتهم" : "Suppliers and their orders"}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </nav>
        </>
      )}

      {formOpen && (
        <ExpenseFormDialog
          key={editing?.id ?? "new-expense"}
          open={formOpen}
          onOpenChange={(next) => {
            setFormOpen(next);
            if (!next) setEditing(null);
          }}
          expense={editing}
          usedCategories={categories}
          offerStock={offerStock}
          onSaved={(day) => {
            setFormOpen(false);
            setEditing(null);
            void invalidateExpenses(qc, brandId);
            showSaved(day);
          }}
        />
      )}

      {scanned && (
        <ReceiptReviewDialog
          open={reviewOpen}
          onOpenChange={(v) => {
            setReviewOpen(v);
            if (!v) setScanned(null);
          }}
          scanned={scanned}
          onSaved={(day) => {
            setReviewOpen(false);
            setScanned(null);
            void invalidateExpenses(qc, brandId);
            showSaved(day);
          }}
        />
      )}
    </div>
  );
}
