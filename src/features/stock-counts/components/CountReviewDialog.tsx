import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useBrand } from "@/lib/brand-context";
import { useProfileOptional } from "@/lib/profile-context";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { formatMoney, moneyFractionDigits } from "@/lib/format";
import { countOf } from "@/lib/arabic-count";
import { catalogQueries, invalidateCatalog } from "@/lib/data/catalog";
import {
  applyStockCount,
  invalidateStockCounts,
  stockCountQueries,
  type StockCount,
} from "@/lib/data/stock-counts";
import { downloadWorkbook } from "@/features/finance-reports/lib/workbook";
import { reviewRows, reviewTotals, stockCountError, stockCountLabel } from "../lib/stock-count";
import { countSheet } from "../lib/stock-count-sheet";

type Lang = "ar" | "en";

/**
 * What a count found, size by size, as the database works it out (`stock_count_review`): the
 * differences first, then the sizes not counted (they keep their stock), then those that
 * matched; for staff who see costs, what the differences are worth. An open count is applied from
 * here, every difference at once through the ledger; an applied one is its report.
 */
export function CountReviewDialog({
  count,
  scope,
  open,
  onOpenChange,
  lang,
}: {
  count: StockCount;
  scope: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
}) {
  const brand = useBrand();
  const qc = useQueryClient();
  const isAr = lang === "ar";
  const currency = useStoreCurrency(brand.id);
  const seesCosts = useProfileOptional()?.canViewFinancials ?? false;
  const linesData = useQuery(stockCountQueries.lines(brand.id, count.id)).data;
  const findings = useQuery({
    ...stockCountQueries.review(brand.id, count.id, open),
    staleTime: 0,
  });
  const variants = useQuery({ ...catalogQueries.variants(brand.id), enabled: open && seesCosts });
  const products = useQuery({ ...catalogQueries.products(brand.id), enabled: open && seesCosts });
  const [busy, setBusy] = useState(false);
  const editable = count.status === "counting";

  const rows = useMemo(() => {
    const sizeCost = new Map((variants.data ?? []).map((v) => [v.id, Number(v.cost_price ?? 0)]));
    const productCost = new Map(
      (products.data ?? []).map((p) => [p.id, Number(p.cost_price ?? 0)]),
    );
    const costOf = seesCosts
      ? (variant: string, product: string | null) =>
          (sizeCost.get(variant) ?? 0) || (product ? (productCost.get(product) ?? 0) : 0) || null
      : undefined;
    return reviewRows(linesData ?? [], findings.data ?? [], lang, costOf);
  }, [linesData, findings.data, lang, seesCosts, variants.data, products.data]);
  const totals = reviewTotals(rows);
  const money = (n: number) => formatMoney(n, currency, lang);

  const download = () =>
    downloadWorkbook(
      [
        countSheet(rows, {
          lang,
          store: (isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug,
          number: count.number,
          startedAt: count.started_at,
          finishedAt: count.finished_at,
          scope,
          note: count.note,
          digits: moneyFractionDigits(currency),
          showValue: seesCosts,
        }),
      ],
      `${stockCountLabel(count.number)}.xlsx`,
    );

  const apply = async () => {
    const sure = await confirmDialog({
      title: isAr ? "تطبيق الجرد على المخزون؟" : "Apply the count to the stock?",
      description: isAr
        ? "تتغير المقاسات التي فيها فرق مرة واحدة عبر سجل المخزون، ويُحفظ الجرد مع تقريره. المقاسات التي لم تُعد تبقى كما هي."
        : "The sizes with a difference change once, through the stock's history, and the count is kept with its report. Sizes not counted stay as they are.",
      facts: [
        {
          label: isAr ? "مقاسات تتغير" : "Sizes that change",
          value: countOf(totals.changed, "size", lang),
        },
        { label: isAr ? "قطع ناقصة" : "Pieces short", value: String(totals.short) },
        { label: isAr ? "قطع زائدة" : "Pieces over", value: String(totals.over) },
      ],
      confirmLabel: isAr ? "طبّق" : "Apply",
    });
    if (!sure) return;
    setBusy(true);
    try {
      const done = await applyStockCount(count.id);
      await invalidateStockCounts(qc, brand.id);
      await invalidateCatalog(qc, brand.id);
      toast.success(
        isAr
          ? `طُبّق الجرد: تغيّر ${countOf(done.changed, "size", "ar")}`
          : `Count applied: ${countOf(done.changed, "size", "en")} changed`,
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(stockCountError(error, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} kind="task" busy={busy}>
      <AppDialogHeader
        title={`${stockCountLabel(count.number)} · ${editable ? (isAr ? "المراجعة" : "Review") : isAr ? "التقرير" : "Report"}`}
        description={scope ?? (isAr ? "كل المنتجات" : "Every product")}
        meta={
          isAr
            ? `عُدّ ${totals.counted} من ${countOf(totals.sizes, "size", "ar")}، ولم يُعد ${totals.uncounted}`
            : `${totals.counted} of ${countOf(totals.sizes, "size", "en")} counted, ${totals.uncounted} not counted`
        }
      />
      <AppDialogBody className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure
            label={isAr ? "مقاسات فيها فرق" : "Sizes with a difference"}
            value={String(totals.changed)}
          />
          <Figure label={isAr ? "قطع ناقصة" : "Pieces short"} value={String(totals.short)} />
          <Figure label={isAr ? "قطع زائدة" : "Pieces over"} value={String(totals.over)} />
          {totals.lostValue !== null && (
            <Figure
              label={isAr ? "صافي الفرق بالتكلفة" : "Net difference at cost"}
              value={money((totals.foundValue ?? 0) - totals.lostValue)}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "الفرق هو المعدود مقابل مخزون المقاس لحظة عدّه، فالبيع أثناء الجرد لا يُحسب نقصًا."
            : "A difference is what was counted against the size's stock when it was counted, so a sale during the count is never a loss."}
        </p>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <li
              key={r.variantId}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm"
            >
              <span className="min-w-0 flex-1 break-words" dir="auto">
                {r.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {isAr ? "عند البدء" : "At start"} {r.expected}
                {r.moved ? ` · ${isAr ? "تحرك" : "moved"} ${r.moved > 0 ? "+" : ""}${r.moved}` : ""}
                {" · "}
                {r.counted === null
                  ? isAr
                    ? "لم يُعد"
                    : "not counted"
                  : `${isAr ? "المعدود" : "counted"} ${r.counted}`}
              </span>
              <span
                className={
                  r.difference && r.difference < 0
                    ? "font-semibold text-destructive"
                    : r.difference
                      ? "font-semibold text-success"
                      : "text-muted-foreground"
                }
                dir="ltr"
              >
                {r.difference === null
                  ? "—"
                  : r.difference > 0
                    ? `+${r.difference}`
                    : String(r.difference)}
                {r.value !== null ? ` · ${money(r.value)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </AppDialogBody>
      <AppDialogFooter>
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={download}
          disabled={rows.length === 0}
        >
          <FileSpreadsheet className="size-4" aria-hidden />
          {isAr ? "تنزيل Excel" : "Download Excel"}
        </Button>
        {editable && (
          <Button
            type="button"
            onClick={apply}
            disabled={busy || findings.isLoading || totals.counted === 0}
          >
            {isAr ? "طبّق على المخزون" : "Apply to the stock"}
          </Button>
        )}
      </AppDialogFooter>
    </AppDialog>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-bold">{value}</p>
    </div>
  );
}
