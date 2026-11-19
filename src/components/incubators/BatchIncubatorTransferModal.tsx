import { useState, useMemo, useEffect } from "react";
import { StockMoveTask } from "@/features/incubators/components/StockMoveTask";
import {
  allAvailable,
  fromPickPatch,
  transferPick,
  transferProblem,
  sameOfEach,
  tickSizes,
  tickedCount,
  transferRows,
  type BatchTransferProduct,
  type BatchTransferVariant,
  type TransferRowState,
} from "@/features/incubators/lib/batch-transfer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { batchTransferRefusal } from "@/features/incubators/lib/errors";
import { transferLabel } from "@/features/incubators/lib/move-pieces";
import {
  incubatorsQueries,
  invalidateIncubators,
  transferStockBatchToIncubator,
  type TransferDone,
} from "@/lib/data/incubators";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { catalogKeys } from "@/lib/data/catalog";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import { countOf, arNounOblique } from "@/lib/arabic-count";

export type { BatchTransferProduct, BatchTransferVariant };

export interface BatchIncubatorTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetProducts: BatchTransferProduct[];
  variantsByProduct?: Record<string, BatchTransferVariant[]>;
  allVariants?: BatchTransferVariant[];
  /** Called with the numbered batch once the pieces are sent. */
  onSuccess?: (done?: TransferDone) => void;
  initialIncubatorId?: string | null;
  /**
   * Tick the listed products' sizes that have pieces when the screen opens: for products the
   * merchant chose (the inventory's selection), not for the partner page's whole catalog.
   */
  preselect?: boolean;
}

/** The modal's own variant type over the typed rows. */
const asBatchVariants = (rows: unknown[]) => rows as BatchTransferVariant[];

export function BatchIncubatorTransferModal({
  open,
  onOpenChange,
  targetProducts,
  variantsByProduct,
  allVariants,
  onSuccess,
  initialIncubatorId,
  preselect = false,
}: BatchIncubatorTransferModalProps) {
  const brand = useBrand();
  const brandId = brand.id;
  const currency = useStoreCurrency(brandId);
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const money = useMoneyLabel(isAr ? "ar" : "en");
  const qc = useQueryClient();

  const [selectedIncubatorId, setSelectedIncubatorId] = useState<string>(initialIncubatorId || "");
  const [rows, setRows] = useState<TransferRowState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch all active incubators for this brand
  const incubatorsQ = useQuery({
    ...incubatorsQueries.active(brandId),
    enabled: open && Boolean(brandId),
  });

  const activeIncubators = useMemo(() => incubatorsQ.data || [], [incubatorsQ.data]);
  const selectedIncubator = useMemo(
    () => activeIncubators.find((inc) => inc.id === selectedIncubatorId),
    [activeIncubators, selectedIncubatorId],
  );

  // Auto-select first active incubator if none selected
  useEffect(() => {
    if (open && activeIncubators.length > 0 && !selectedIncubatorId) {
      const defaultInc = initialIncubatorId
        ? activeIncubators.find((i) => i.id === initialIncubatorId) || activeIncubators[0]
        : activeIncubators[0];
      setSelectedIncubatorId(defaultInc.id);
    }
  }, [open, activeIncubators, selectedIncubatorId, initialIncubatorId]);

  // If variants aren't passed, fetch variants for target products including incubator allocations
  const productIds = useMemo(() => targetProducts.map((p) => p.id), [targetProducts]);

  const fetchedVariantsQ = useQuery({
    ...incubatorsQueries.batchVariants(brandId, productIds),
    select: asBatchVariants,
    enabled: open && productIds.length > 0 && !variantsByProduct && !allVariants,
  });

  // Build row states whenever targetProducts or variants change
  useEffect(() => {
    if (!open) return;

    let availableVariants: BatchTransferVariant[] = [];
    if (variantsByProduct) {
      availableVariants = productIds.flatMap((pid) => variantsByProduct[pid] || []);
    } else if (allVariants) {
      availableVariants = allVariants.filter((v) => productIds.includes(v.product_id));
    } else if (fetchedVariantsQ.data) {
      availableVariants = fetchedVariantsQ.data;
    }

    const newRows = transferRows(availableVariants, targetProducts, isAr, preselect);

    setRows(newRows);
  }, [
    open,
    targetProducts,
    variantsByProduct,
    allVariants,
    fetchedVariantsQ.data,
    isAr,
    productIds,
    preselect,
  ]);

  // Row update helpers
  const updateRowByVariantId = (variantId: string, patch: Partial<TransferRowState>) => {
    setRows((prev) => prev.map((r) => (r.variantId === variantId ? { ...r, ...patch } : r)));
  };

  /** Ticks or unticks the sizes named (a sold-out size is never ticked). */
  const tick = (ids: string[], on: boolean) => setRows((prev) => tickSizes(prev, new Set(ids), on));

  // Quick preset actions
  const handleTransferAllAvailableStock = () => {
    setRows((prev) => allAvailable(prev));
  };

  const handleSetUniformQty = (qty: number) => {
    setRows((prev) => sameOfEach(prev, qty));
  };

  const handleApplySellingPrices = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        consignmentPrice: r.sellingPrice,
      })),
    );
  };

  // Group rows by product and apply search filter
  const productGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        productId: string;
        productName: string;
        category: string;
        rows: TransferRowState[];
      }
    >();

    for (const r of rows) {
      if (!map.has(r.productId)) {
        map.set(r.productId, {
          productId: r.productId,
          productName: r.productName,
          category: r.category,
          rows: [],
        });
      }
      map.get(r.productId)!.rows.push(r);
    }

    const q = searchQuery.trim().toLowerCase();
    const groups = Array.from(map.values());

    if (!q) return groups;

    return groups
      .map((g) => {
        const matchesProduct =
          g.productName.toLowerCase().includes(q) || g.category.toLowerCase().includes(q);
        if (matchesProduct) return g;

        const filteredRows = g.rows.filter(
          (r) =>
            r.variantLabel.toLowerCase().includes(q) ||
            r.sku.toLowerCase().includes(q) ||
            r.barcode.toLowerCase().includes(q) ||
            r.size.toLowerCase().includes(q) ||
            r.color.toLowerCase().includes(q),
        );

        return filteredRows.length > 0 ? { ...g, rows: filteredRows } : null;
      })
      .filter(Boolean) as typeof groups;
  }, [rows, searchQuery]);
  // What the search shows: "Select all" and "Deselect all" act on these sizes.
  const shownRows = useMemo(() => productGroups.flatMap((group) => group.rows), [productGroups]);
  const shownCount = tickedCount(shownRows);

  // Calculated totals for active rows
  const activeRows = useMemo(() => rows.filter((r) => r.selected && r.transferQty > 0), [rows]);

  // Execution
  const handleExecuteTransfer = async (notes: string) => {
    if (!selectedIncubatorId) {
      toast.error(isAr ? "يرجى اختيار المحل الشريك أولاً" : "Please select a partner shop first");
      return;
    }

    if (activeRows.length === 0) {
      toast.error(
        isAr
          ? "يرجى تحديد كميات أكبر من 0 للتحويل"
          : "Please specify transfer quantities greater than 0",
      );
      return;
    }

    // Check if any row exceeds total available transferable stock
    const overstocked = activeRows.find((r) => r.transferQty > r.totalAvailable);
    if (overstocked) {
      toast.error(
        isAr
          ? `الكمية المطلوبة لـ (${overstocked.productName} - ${overstocked.variantLabel}) أكبر من المخزون المتوفر (${overstocked.totalAvailable})`
          : `Requested qty exceeds available stock for ${overstocked.productName}`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const commType = selectedIncubator?.commission_type || "percentage";
      const commVal = Number(selectedIncubator?.commission_value || 0);

      // One transaction: every piece moves, or none does. (Sent one at a time, a failure
      // midway left half a transfer behind while the screen announced the whole.)
      const done = await transferStockBatchToIncubator({
        incubatorId: selectedIncubatorId,
        items: activeRows.map((row) => ({
          variantId: row.variantId,
          quantity: row.transferQty,
          externalCode: row.externalCode.trim() || null,
          price: Number(row.consignmentPrice),
          commissionType: commType,
          commissionValue: commVal,
        })),
        notes: notes.trim() || null,
      });

      toast.success(
        isAr
          ? `تم تحويل ${arNounOblique(done.pieces, "piece")} إلى ${selectedIncubator?.name || ""} · ${transferLabel(done.number)}`
          : `${countOf(done.pieces, "piece", "en")} sent to ${selectedIncubator?.name || "the partner"} · ${transferLabel(done.number)}`,
      );

      // Invalidate all inventory and incubator queries
      await Promise.all([
        qc.invalidateQueries({ queryKey: catalogKeys.variants(brandId) }),
        invalidateIncubators(qc, brandId),
      ]);

      if (onSuccess) onSuccess(done);
      onOpenChange(false);
    } catch (err) {
      const pieceOf = (variantId: string) => {
        const row = activeRows.find((item) => item.variantId === variantId);
        return row ? `${row.productName} - ${row.variantLabel}` : null;
      };
      toast.error(batchTransferRefusal(err, pieceOf, isAr ? "ar" : "en"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const lang2 = isAr ? "ar" : "en";
  const shownPicks = shownRows.map(transferPick);
  const storeName =
    (isAr ? brand.name_ar : null) || brand.name_en || (isAr ? "المحل" : "The store");

  return (
    <StockMoveTask
      open={open}
      onClose={() => onOpenChange(false)}
      busy={isSubmitting}
      isAr={isAr}
      lang={lang2}
      money={(amount) => formatMoney(amount, currency, lang)}
      icon={<Building2 />}
      title={isAr ? "تحويل بضاعة إلى محل شريك" : "Send stock to a partner shop"}
      description={
        isAr
          ? "اختر المحل والقطع وسعرها وكودها عنده، راجعها، ثم حوّلها في دفعة واحدة مرقّمة."
          : "Choose the partner, the pieces and their price and code there, review them, then send them in one numbered batch."
      }
      size="xl"
      empty={
        !incubatorsQ.isLoading && activeIncubators.length === 0
          ? isAr
            ? "لا توجد محلات شركاء نشطة. أضف محلاً شريكاً أولاً."
            : "There is no active partner shop. Add one first."
          : !fetchedVariantsQ.isLoading && rows.length === 0
            ? isAr
              ? "لا توجد مقاسات للمنتجات المحددة."
              : "These products have no sizes."
            : null
      }
      rows={rows.map(transferPick)}
      listed={shownPicks}
      onChoose={(ids, on) => tick([...ids], on)}
      onEdit={(id, patch) => updateRowByVariantId(id, fromPickPatch(patch))}
      fields={{ price: true, code: true }}
      priceLabel={isAr ? `السعر عندهم (${money})` : `Price there (${money})`}
      top={
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="send-target">{isAr ? "إلى المحل الشريك" : "To the partner shop"}</Label>
            {incubatorsQ.isLoading ? (
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            ) : (
              <select
                id="send-target"
                value={selectedIncubatorId}
                onChange={(e) => setSelectedIncubatorId(e.target.value)}
                className="h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
              >
                {activeIncubators.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    {inc.name} — (
                    {inc.commission_type === "percentage"
                      ? isAr
                        ? `${inc.commission_value}% عمولة`
                        : `${inc.commission_value}% commission`
                      : `${formatMoney(inc.commission_value, inc.currency || currency, lang)} ${isAr ? "ثابت" : "fixed"}`}
                    )
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{isAr ? "اختيار سريع" : "Quick choices"}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTransferAllAvailableStock}
              >
                {isAr ? "كل المتوفر" : "Everything available"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSetUniformQty(1)}
              >
                {isAr ? "قطعة من كل مقاس" : "One of each size"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleApplySellingPrices}>
                {isAr ? "أسعار البيع" : "Selling prices"}
              </Button>
            </div>
          </div>
          {fetchedVariantsQ.isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground md:col-span-2">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {isAr ? "جارٍ تحميل المقاسات…" : "Loading the sizes…"}
            </p>
          )}
        </div>
      }
      toolbar={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAr
                  ? "ابحث بالمنتج أو اللون أو المقاس أو الكود"
                  : "Search by product, colour, size or code"
              }
              aria-label={isAr ? "بحث في المنتجات" : "Search products"}
              className="ps-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {isAr
                ? `${shownCount.ticked} من ${arNounOblique(shownCount.tickable, "size")}`
                : `${shownCount.ticked} of ${shownCount.tickable} sizes`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={shownCount.ticked === shownCount.tickable}
              onClick={() =>
                tick(
                  shownRows.map((row) => row.variantId),
                  true,
                )
              }
            >
              {isAr ? "تحديد الكل" : "Select all"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={shownCount.ticked === 0}
              onClick={() =>
                tick(
                  shownRows.map((row) => row.variantId),
                  false,
                )
              }
            >
              {isAr ? "إلغاء التحديد" : "Deselect all"}
            </Button>
          </div>
        </div>
      }
      problem={transferProblem(rows, Boolean(selectedIncubator), lang2)}
      from={storeName}
      to={selectedIncubator?.name ?? ""}
      reviewLabel={isAr ? "مراجعة التحويل" : "Review the transfer"}
      goLabel={(pieces) =>
        isAr ? `تحويل ${arNounOblique(pieces, "piece")}` : `Send ${countOf(pieces, "piece", "en")}`
      }
      onSubmit={(notes) => handleExecuteTransfer(notes)}
    />
  );
}
