import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, Wallet, Loader2, Receipt, FileText } from "lucide-react";
import { toast } from "sonner";
import { useI18n, useT } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { deletePublicMediaUrl } from "@/lib/r2-upload";
import { deleteExpense, expensesQueries, invalidateExpenses } from "@/lib/data/expenses";
import { ordersQueries } from "@/lib/data/orders";

import { ExpensesCommandHeader } from "@/components/expenses/ExpensesCommandHeader";
import { ExpensesScopeSwitcher } from "@/components/expenses/ExpensesScopeSwitcher";
import { ExpensesToolbar } from "@/components/expenses/ExpensesToolbar";
import { ExpensesWorkQueue } from "@/components/expenses/ExpensesWorkQueue";
import { ExpenseMobileCard } from "@/components/expenses/ExpenseMobileCard";

import { ExpensesOpExCogsTab } from "@/components/accounting/ExpensesOpExCogsTab";
import { CashFlowLiquidityTab } from "@/components/accounting/CashFlowLiquidityTab";
import { VendorsPurchaseOrdersTab } from "@/components/accounting/VendorsPurchaseOrdersTab";
import { FinancialReportsTab } from "@/components/accounting/FinancialReportsTab";
import { scanReceipt, type ScannedExpense } from "@/lib/scan-receipt.functions";
import type { Expense, DatePreset } from "@/features/expenses/types";
import { presetRange } from "@/features/expenses/lib/date-range";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import {
  cogsCsv,
  cogsCsvFileName,
  expenseCategories,
  filterExpenses,
  scanFailureMessage,
} from "@/features/expenses/lib/expense-list";
import { periodFigures, reportRangeOfDays } from "@/features/expenses/lib/profit-and-loss";
import { reportingQueries } from "@/lib/data/reporting";
import { prepareReceiptForScanning } from "@/features/expenses/lib/receipt-scan";
import { ExpenseDialog } from "@/features/expenses/components/ExpenseDialog";
import { ReceiptReviewDialog } from "@/features/expenses/components/ReceiptReviewDialog";

/** The expenses page: the list, the profit and loss strip, the accounting tabs and the dialogs. */
export function ExpensesPage() {
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-BH-u-nu-latn" : "en-US";
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;

  // Expenses (shared with the OpEx/COGS and reports tabs and the dashboard)
  const q = useQuery({ ...expensesQueries.list(brandId), retry: false });

  const [editing, setEditing] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scanned, setScanned] = useState<ScannedExpense | null>(null);
  const [scanning, setScanning] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [mainTab, setMainTab] = useState<"opex_cogs" | "cash_flow" | "vendors_pos" | "reports">(
    "opex_cogs",
  );
  const [customRange] = useState({ from: "", to: "" });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scanFn = useServerFn(scanReceipt);

  const rawList = q.data;
  const list = useMemo(() => rawList ?? [], [rawList]);
  const categories = useMemo(() => expenseCategories(list, locale), [list, locale]);
  const activeRange = datePreset === "custom" ? customRange : presetRange(datePreset);
  const filteredList = useMemo(
    () =>
      filterExpenses(list, {
        from: activeRange.from,
        to: activeRange.to,
        search,
        category: categoryFilter,
      }),
    [list, activeRange.from, activeRange.to, search, categoryFilter],
  );
  // The strip above the list is the store's own money (its orders and its costs); a row is in
  // its expense's own currency, with the store's when it has none.
  const currency = useStoreCurrency(brandId);

  // ── COGS: use the immutable unit-cost snapshot captured on each order item ──
  const cogsQ = useQuery(ordersQueries.cogs(brandId, activeRange.from, activeRange.to));

  const downloadCogsCsv = () => {
    const blob = new Blob([cogsCsv(cogsQ.data ?? [], lang, locale)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = cogsCsvFileName(activeRange);
    a.click();
    URL.revokeObjectURL(url);
  };

  const del = async (id: string) => {
    setDeleting(true);
    try {
      const target = list.find((expense) => expense.id === id);
      const error = await deleteExpense(brandId, id).then(
        () => null,
        (err: { message: string }) => err,
      );
      if (error) toast.error(error.message);
      else {
        toast.success(t("common.delete"));
        setDeleteTargetId(null);
        if (target?.receipt_url)
          void deletePublicMediaUrl(brandId, target.receipt_url).catch(() => undefined);
        await invalidateExpenses(qc, brandId);
      }
    } finally {
      setDeleting(false);
    }
  };

  const onFilePicked = async (file: File | null) => {
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) {
      toast.error(
        lang === "ar" ? "الملف كبير جداً (الحد 40 ميغابايت)" : "File too large (max 40MB)",
      );
      return;
    }
    setScanning(true);
    try {
      const prepared = await prepareReceiptForScanning(file);
      const result = await scanFn({
        data: {
          dataUrl: prepared.dataUrl,
          mimeType: prepared.mimeType,
          targetLang: lang === "ar" ? "ar" : "en",
        },
      });
      setScanned(result);
      setEditing(null);
      setReviewOpen(true);
      toast.success(lang === "ar" ? "تم استخراج بيانات الفاتورة" : "Receipt data extracted");
    } catch (e: any) {
      toast.error(scanFailureMessage(e?.message, lang));
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // The profit and loss strip: the Reports' own figures for the page's days, so this page, the
  // overview and the monthly statement agree (running costs are every one of the period, not
  // only those the list's search shows).
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const reportRange = reportRangeOfDays(activeRange.from, activeRange.to);
  const periodQ = useQuery({
    ...reportingQueries.overview(brand.slug, reportRange, timeZone, false),
    retry: 1,
  });
  const figures = useMemo(
    () => periodFigures(Array.isArray(periodQ.data) ? periodQ.data : null, currency),
    [periodQ.data, currency],
  );

  return (
    <div className="space-y-3.5">
      {/* Hidden File Input for Scanner */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => void onFilePicked(e.target.files?.[0] ?? null)}
      />

      {/* 1. Command Header */}
      <ExpensesCommandHeader
        lang={lang === "ar" ? "ar" : "en"}
        expenseCount={filteredList.length}
        scanning={scanning}
        onScanReceipt={() => fileRef.current?.click()}
        onCreateNew={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      {/* 2. P&L Financial Scope Switcher */}
      <ExpensesScopeSwitcher
        lang={lang === "ar" ? "ar" : "en"}
        currency={currency}
        slug={brand.slug}
        figures={figures}
        period={{ from: activeRange.from, to: activeRange.to }}
      />

      {/* Financial & Accounting Hub Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-border pb-2 pt-1">
        <Button
          variant={mainTab === "opex_cogs" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMainTab("opex_cogs")}
          className="h-9 text-xs font-bold gap-1.5 shrink-0"
        >
          <Receipt className="h-4 w-4" />
          {lang === "ar" ? "المصاريف وتكلفة البضاعة" : "Expenses & cost of goods"}
        </Button>
        <Button
          variant={mainTab === "cash_flow" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMainTab("cash_flow")}
          className="h-9 text-xs font-bold gap-1.5 shrink-0"
        >
          <Wallet className="h-4 w-4" />
          {lang === "ar" ? "التدفقات النقدية والحسابات" : "Cash Flow & Liquidity"}
        </Button>
        <Button
          variant={mainTab === "vendors_pos" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMainTab("vendors_pos")}
          className="h-9 text-xs font-bold gap-1.5 shrink-0"
        >
          <Receipt className="h-4 w-4" />
          {lang === "ar" ? "الموردين وأوامر الشراء" : "Vendors & POs"}
        </Button>
        <Button
          variant={mainTab === "reports" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMainTab("reports")}
          className="h-9 text-xs font-bold gap-1.5 shrink-0"
        >
          <FileText className="h-4 w-4" />
          {lang === "ar" ? "التقارير المالية والدفاتر" : "Financial Statements"}
        </Button>
      </div>

      {/* Tab Views */}
      {mainTab === "opex_cogs" && <ExpensesOpExCogsTab activeRange={activeRange} />}
      {mainTab === "cash_flow" && <CashFlowLiquidityTab />}
      {mainTab === "vendors_pos" && <VendorsPurchaseOrdersTab />}
      {mainTab === "reports" && (
        <FinancialReportsTab slug={brand.slug} range={reportRange} figures={figures} />
      )}

      {/* 3. Toolbar */}
      <ExpensesToolbar
        lang={lang === "ar" ? "ar" : "en"}
        search={search}
        onSearchChange={setSearch}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        categories={categories}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        activeFilterCount={(search ? 1 : 0) + (categoryFilter !== "all" ? 1 : 0)}
        onClearFilters={() => {
          setSearch("");
          setCategoryFilter("all");
        }}
        onDownloadCogsCsv={downloadCogsCsv}
      />

      {/* 4. Mobile View */}
      <div className="space-y-2.5 block sm:hidden">
        {filteredList.map((e) => (
          <ExpenseMobileCard
            key={e.id}
            lang={lang === "ar" ? "ar" : "en"}
            expense={e}
            currency={currency}
            onEdit={(item) => {
              setEditing(item);
              setOpen(true);
            }}
            onDelete={(id) => setDeleteTargetId(id)}
          />
        ))}
      </div>

      {/* 5. Desktop High-Density Work Queue */}
      <div className="hidden sm:block">
        <ExpensesWorkQueue
          lang={lang === "ar" ? "ar" : "en"}
          expenses={filteredList}
          currency={currency}
          onEdit={(item) => {
            setEditing(item);
            setOpen(true);
          }}
          onDelete={(id) => setDeleteTargetId(id)}
        />
      </div>

      {/* Manual Expense Modal */}
      {open && (
        <ExpenseDialog
          key={editing?.id ?? "new-expense"}
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) setEditing(null);
          }}
          expense={editing}
          categories={categories}
          onSaved={() => {
            setOpen(false);
            void invalidateExpenses(qc, brandId);
          }}
        />
      )}

      {/* AI Scanned Review Dialog */}
      {scanned && (
        <ReceiptReviewDialog
          open={reviewOpen}
          onOpenChange={(v) => {
            setReviewOpen(v);
            if (!v) setScanned(null);
          }}
          scanned={scanned}
          onSaved={() => {
            setReviewOpen(false);
            setScanned(null);
            invalidateExpenses(qc, brandId);
          }}
        />
      )}

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(val) => !val && setDeleteTargetId(null)}>
        <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("expenses.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => deleteTargetId && void del(deleteTargetId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : (
                <Trash2 className="h-4 w-4 me-2" />
              )}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
