import { useState, useMemo, useEffect } from "react";
import {
  allAvailable,
  overAvailable,
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
import {
  incubatorsQueries,
  invalidateIncubators,
  transferStockBatchToIncubator,
} from "@/lib/data/incubators";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Package,
  Sparkles,
  Zap,
  Loader2,
  ArrowRightLeft,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
  Layers,
  CheckSquare,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { catalogKeys } from "@/lib/data/catalog";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import { arNoun, countOf } from "@/lib/arabic-count";

export type { BatchTransferProduct, BatchTransferVariant };

export interface BatchIncubatorTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetProducts: BatchTransferProduct[];
  variantsByProduct?: Record<string, BatchTransferVariant[]>;
  allVariants?: BatchTransferVariant[];
  onSuccess?: () => void;
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
  const [transferNotes, setTransferNotes] = useState<string>("");
  const [rows, setRows] = useState<TransferRowState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());

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
    // Expand all products by default
    const allProdIds = new Set(newRows.map((r) => r.productId));
    setExpandedProductIds(allProdIds);
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

  const toggleProductAccordion = (productId: string) => {
    setExpandedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set(rows.map((r) => r.productId));
    setExpandedProductIds(allIds);
  };

  const collapseAll = () => {
    setExpandedProductIds(new Set());
  };

  // Quick preset actions
  const handleTransferAllAvailableStock = () => {
    setRows((prev) => allAvailable(prev));
    toast.info(
      isAr ? "تم ضبط الكميات لكامل المخزون المتوفر" : "Quantities set to all available stock",
    );
  };

  const handleSetUniformQty = (qty: number) => {
    setRows((prev) => sameOfEach(prev, qty));
    toast.info(
      isAr ? `تم ضبط الكمية (${qty}) لجميع المتغيرات` : `Set uniform quantity (${qty}) for all`,
    );
  };

  const handleApplySellingPrices = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        consignmentPrice: r.sellingPrice,
      })),
    );
    toast.info(isAr ? "تمت استعادة أسعار البيع الافتراضية" : "Applied standard selling prices");
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
  const tooMany = useMemo(() => overAvailable(rows), [rows]);
  const totalPieces = useMemo(
    () => activeRows.reduce((sum, r) => sum + r.transferQty, 0),
    [activeRows],
  );
  const totalValue = useMemo(
    () => activeRows.reduce((sum, r) => sum + r.transferQty * r.consignmentPrice, 0),
    [activeRows],
  );

  // Execution
  const handleExecuteTransfer = async () => {
    if (!selectedIncubatorId) {
      toast.error(isAr ? "يرجى اختيار الحاضنة أولاً" : "Please select an incubator first");
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
      const pieces = await transferStockBatchToIncubator({
        incubatorId: selectedIncubatorId,
        items: activeRows.map((row) => ({
          variantId: row.variantId,
          quantity: row.transferQty,
          externalCode: row.externalCode.trim() || null,
          price: Number(row.consignmentPrice),
          commissionType: commType,
          commissionValue: commVal,
        })),
        notes: transferNotes.trim() || null,
      });

      toast.success(
        isAr
          ? `تم تحويل ${arNoun(pieces, "piece")} بنجاح إلى حاضنة ${selectedIncubator?.name || ""}`
          : `Successfully transferred ${pieces} items to ${selectedIncubator?.name || "incubator"}`,
      );

      // Invalidate all inventory and incubator queries
      await Promise.all([
        qc.invalidateQueries({ queryKey: catalogKeys.variants(brandId) }),
        invalidateIncubators(qc, brandId),
      ]);

      if (onSuccess) onSuccess();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-border shadow-2xl bg-card">
        {/* Header */}
        <DialogHeader className="p-5 pb-4 border-b border-border-strong bg-secondary/15">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold font-heading text-foreground flex items-center gap-2">
                  <span>
                    {isAr ? "تحويل وتعيين البضاعة إلى الحاضنة" : "Transfer Stock to Incubator"}
                  </span>
                  <Badge variant="secondary" className="font-mono text-xs font-semibold px-2">
                    {countOf(targetProducts.length, "product", isAr ? "ar" : "en")} · {rows.length}{" "}
                    {isAr ? "متغيرات" : "variants"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "نقل المخزون وتحديد أسعار الأمانة وعمولة الحاضنة دفعة واحدة وبضغطة زر."
                    : "Batch transfer products, set consignment prices and incubator commission instantly."}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Top Control Bar: Incubator Picker & Quick Presets */}
        <div className="p-4 border-b border-border-subtle bg-muted/20 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            {/* Incubator Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span>
                  {isAr
                    ? "الحاضنة أو المتجر الشريك المستهدف"
                    : "Target Incubator / Consignment Store"}
                </span>
              </Label>
              {incubatorsQ.isLoading ? (
                <div className="h-9 w-full rounded-md bg-muted animate-pulse" />
              ) : activeIncubators.length === 0 ? (
                <div className="text-xs text-destructive p-2 bg-destructive/10 rounded-md border border-destructive/20 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    {isAr
                      ? "لا توجد حاضنات نشطة في حسابك. يرجى إضافة حاضنة أولاً من قسم الحاضنات."
                      : "No active incubators found. Please create one in Incubators section."}
                  </span>
                </div>
              ) : (
                <select
                  value={selectedIncubatorId}
                  onChange={(e) => setSelectedIncubatorId(e.target.value)}
                  className="w-full h-9 text-xs rounded-lg border border-input bg-background px-3 font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                >
                  {activeIncubators.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      {inc.name} — (
                      {inc.commission_type === "percentage"
                        ? `${inc.commission_value}% عمولة`
                        : `${formatMoney(inc.commission_value, inc.currency || currency, lang)} ثابت`}
                      )
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Batch Fast Actions */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                <span>{isAr ? "أدوات الضبط السريع للكميات" : "Fast Batch Actions"}</span>
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTransferAllAvailableStock}
                  className="h-8 text-xs gap-1 bg-background hover:bg-secondary/40 font-medium"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  {isAr ? "تحويل كامل المتوفر" : "All Available Stock"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSetUniformQty(1)}
                  className="h-8 text-xs gap-1 bg-background hover:bg-secondary/40 font-medium"
                >
                  {isAr ? "1 قطعة لكل نوع" : "1 per variant"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleApplySellingPrices}
                  className="h-8 text-xs gap-1 bg-background hover:bg-secondary/40 font-medium"
                >
                  {isAr ? "اعتماد أسعار البيع" : "Reset Prices"}
                </Button>
              </div>
            </div>
          </div>

          {/* Search & Collapse Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
            <div className="relative flex-1 w-full">
              <Search className="absolute end-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isAr
                    ? "بحث باسم المنتج، اللون، المقاس، أو الـ SKU..."
                    : "Search by product name, color, size, or SKU..."
                }
                className="h-8 text-xs pe-9 ps-3 w-full bg-background"
              />
            </div>
            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
              <Badge variant="outline" className="text-xs font-mono px-2 py-1">
                {countOf(productGroups.length, "product", isAr ? "ar" : "en")}
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">
                {isAr
                  ? `${shownCount.ticked} من ${arNoun(shownCount.tickable, "size")}`
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
                className="h-7 text-xs px-2"
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
                className="h-7 text-xs px-2"
              >
                {isAr ? "إلغاء التحديد" : "Deselect all"}
              </Button>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={expandAll}
                  className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="h-3.5 w-3.5 me-1" />
                  {isAr ? "توسيع الكل" : "Expand All"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={collapseAll}
                  className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                >
                  <ChevronUp className="h-3.5 w-3.5 me-1" />
                  {isAr ? "طي الكل" : "Collapse All"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Product-Grouped Collapsible List */}
        <div className="flex-1 overflow-y-auto p-4 max-h-[50vh] space-y-3">
          {fetchedVariantsQ.isLoading ? (
            <div className="p-8 text-center space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground">
                {isAr ? "جاري تجهيز المتغيرات..." : "Loading variants..."}
              </p>
            </div>
          ) : productGroups.length === 0 ? (
            <div className="p-8 text-center space-y-2 border border-dashed border-border rounded-xl">
              <Package className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold">
                {searchQuery
                  ? isAr
                    ? "لا توجد نتائج مطابقة لبحثك"
                    : "No matching products found"
                  : isAr
                    ? "لا توجد متغيرات للمنتجات المحددة"
                    : "No variants found"}
              </p>
            </div>
          ) : (
            productGroups.map((group) => {
              const isExpanded = expandedProductIds.has(group.productId);
              const groupRows = group.rows;
              // A product's box ticks its sizes that have pieces; sold-out ones never count.
              const tickable = groupRows.filter((r) => r.totalAvailable > 0);
              const allSelected = tickable.length > 0 && tickable.every((r) => r.selected);
              const someSelected = groupRows.some((r) => r.selected);
              const groupTotalAvailable = groupRows.reduce((sum, r) => sum + r.totalAvailable, 0);
              const groupTotalTransferQty = groupRows.reduce(
                (sum, r) => sum + (r.selected ? r.transferQty : 0),
                0,
              );
              const groupTotalValue = groupRows.reduce(
                (sum, r) => sum + (r.selected ? r.transferQty * r.consignmentPrice : 0),
                0,
              );

              return (
                <div
                  key={group.productId}
                  className="border border-border-strong rounded-xl overflow-hidden bg-background shadow-2xs transition-all"
                >
                  {/* Product Group Header / Dropdown Banner */}
                  <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3 select-none">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Checkbox for whole product */}
                      <button
                        type="button"
                        disabled={tickable.length === 0}
                        aria-pressed={allSelected}
                        onClick={() =>
                          tick(
                            tickable.map((r) => r.variantId),
                            !allSelected,
                          )
                        }
                        className="text-primary hover:opacity-80 p-0.5 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={
                          isAr
                            ? `تحديد مقاسات ${group.productName} المتوفرة`
                            : `Select the sizes of ${group.productName} in stock`
                        }
                      >
                        {allSelected ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : someSelected ? (
                          <div className="h-4 w-4 border-2 border-primary rounded flex items-center justify-center bg-primary/20">
                            <div className="h-2 w-2 bg-primary rounded-xs" />
                          </div>
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>

                      {/* Product Name & Details */}
                      <button
                        type="button"
                        onClick={() => toggleProductAccordion(group.productId)}
                        className="flex items-center gap-2.5 text-end font-medium text-xs text-foreground hover:text-primary transition-colors cursor-pointer"
                      >
                        <Layers className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-bold text-sm text-foreground">
                          {group.productName}
                        </span>
                        {group.category && (
                          <Badge
                            variant="secondary"
                            className="text-xs px-1.5 py-0 font-normal hidden sm:inline-block"
                          >
                            {group.category}
                          </Badge>
                        )}
                      </button>
                    </div>

                    {/* Group Metrics and Chevron */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="hidden sm:flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground font-mono">
                          {isAr ? "المتاح: " : "Avail: "}
                          <strong className="text-foreground">{groupTotalAvailable}</strong>
                        </span>
                        <span>•</span>
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary border-primary/20"
                        >
                          {groupTotalTransferQty} {isAr ? "محول" : "transferred"}
                        </Badge>
                        <span className="font-mono font-bold text-muted-foreground">
                          {formatMoney(groupTotalValue, currency, lang)}
                        </span>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleProductAccordion(group.productId)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Collapsible Variants Table for this Product */}
                  {isExpanded && (
                    <div className="border-t border-border-subtle">
                      <table className="w-full text-xs text-end divide-y divide-border/40">
                        <thead className="bg-muted/15 font-semibold text-muted-foreground text-xs">
                          <tr>
                            <th className="p-2.5 w-8 text-center"></th>
                            <th className="p-2.5">{isAr ? "النسخة والرمز" : "Variant & SKU"}</th>
                            <th className="p-2.5 text-center">
                              {isAr ? "المخزون المتوفر" : "Available Stock"}
                            </th>
                            <th className="p-2.5 text-center w-36">
                              {isAr ? "الكمية المحولة" : "Transfer Qty"}
                            </th>
                            <th className="p-2.5 text-center w-32">
                              {isAr ? "سعر الحاضنة" : "Consignment Price"}
                            </th>
                            <th className="p-2.5 w-32">{isAr ? "كود الحاضنة" : "Ext. Code"}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {groupRows.map((row) => {
                            const isExceeding = row.transferQty > row.totalAvailable;
                            const isZeroStock = row.totalAvailable <= 0;

                            return (
                              <tr
                                key={row.variantId}
                                className={`transition-colors ${
                                  row.selected
                                    ? "bg-background hover:bg-muted/10"
                                    : "bg-muted/20 opacity-60"
                                }`}
                              >
                                {/* Checkbox */}
                                <td className="p-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={row.selected}
                                    disabled={isZeroStock}
                                    onChange={(e) => tick([row.variantId], e.target.checked)}
                                    aria-label={
                                      isZeroStock
                                        ? isAr
                                          ? `${group.productName} ${row.variantLabel}: لا توجد قطع للتحويل`
                                          : `${group.productName} ${row.variantLabel}: nothing to transfer`
                                        : isAr
                                          ? `تحويل ${group.productName} ${row.variantLabel}`
                                          : `Transfer ${group.productName} ${row.variantLabel}`
                                    }
                                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </td>

                                {/* Variant label */}
                                <td className="p-2.5">
                                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                                    <span>{row.variantLabel}</span>
                                    {row.color && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs px-1 py-0 font-normal"
                                      >
                                        {row.color}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-xs font-mono text-muted-foreground mt-0.5">
                                    {row.sku}
                                  </div>
                                </td>

                                {/* Stock info */}
                                <td className="p-2.5 text-center">
                                  <div className="inline-flex items-center gap-1 font-mono text-xs flex-wrap justify-center">
                                    <Badge
                                      variant="outline"
                                      className={`px-1.5 py-0.5 text-xs font-bold ${
                                        isZeroStock
                                          ? "bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400"
                                          : "bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-400"
                                      }`}
                                    >
                                      {isAr ? "متاح: " : "Avail: "}
                                      {row.totalAvailable}
                                    </Badge>
                                    {row.unallocatedInc > 0 && row.stockMain > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        ({row.stockMain} ر + {row.unallocatedInc} ح)
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Transfer Qty Input */}
                                <td className="p-2.5">
                                  <div className="flex items-center gap-1 justify-center">
                                    <Input
                                      type="number"
                                      min="0"
                                      max={row.totalAvailable}
                                      value={row.transferQty}
                                      disabled={!row.selected}
                                      onChange={(e) =>
                                        updateRowByVariantId(row.variantId, {
                                          transferQty: Math.max(0, parseInt(e.target.value) || 0),
                                        })
                                      }
                                      className={`h-8 w-20 text-center font-mono font-bold text-xs ${
                                        isExceeding ? "border-destructive text-destructive" : ""
                                      }`}
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disabled={!row.selected || row.totalAvailable <= 0}
                                      onClick={() =>
                                        updateRowByVariantId(row.variantId, {
                                          transferQty: row.totalAvailable,
                                        })
                                      }
                                      className="h-8 px-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                                    >
                                      {isAr ? "الكل" : "Max"}
                                    </Button>
                                  </div>
                                  {isExceeding && (
                                    <div className="text-xs text-destructive mt-0.5 text-center font-medium">
                                      {isAr ? "تجاوز المخزون المتوفر!" : "Exceeds stock!"}
                                    </div>
                                  )}
                                </td>

                                {/* Consignment Price */}
                                <td className="p-2.5">
                                  <div className="flex items-center gap-1 justify-center">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.001"
                                      value={row.consignmentPrice}
                                      disabled={!row.selected}
                                      onChange={(e) =>
                                        updateRowByVariantId(row.variantId, {
                                          consignmentPrice: parseFloat(e.target.value) || 0,
                                        })
                                      }
                                      className="h-8 w-24 text-center font-mono text-xs"
                                    />
                                    <span className="text-xs text-muted-foreground shrink-0 font-mono">
                                      {money}
                                    </span>
                                  </div>
                                </td>

                                {/* External Code */}
                                <td className="p-2.5">
                                  <Input
                                    type="text"
                                    placeholder={isAr ? "كود اختياري" : "Optional"}
                                    value={row.externalCode}
                                    disabled={!row.selected}
                                    onChange={(e) =>
                                      updateRowByVariantId(row.variantId, {
                                        externalCode: e.target.value,
                                      })
                                    }
                                    className="h-8 text-xs"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Delivery / Transfer Notes */}
          <div className="mt-4 space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              {isAr
                ? "ملاحظات إيصال التسليم والتحويل (اختياري)"
                : "Transfer / Delivery Notes (Optional)"}
            </Label>
            <Textarea
              placeholder={
                isAr ? "مثال: تسليم دفعة العيد لمحل دار لولوة..." : "E.g. Delivery batch note..."
              }
              value={transferNotes}
              onChange={(e) => setTransferNotes(e.target.value)}
              className="text-xs min-h-[50px] resize-none"
            />
          </div>
        </div>

        {/* Footer: Summary Metrics & Action Buttons */}
        <DialogFooter className="p-4 border-t border-border-strong bg-secondary/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {tooMany.length > 0 && (
              <span role="alert" className="font-medium text-destructive">
                {isAr
                  ? `مقاسات تطلب أكثر من المتوفر: ${tooMany.length}`
                  : `${tooMany.length} ${tooMany.length === 1 ? "size asks" : "sizes ask"} for more than is in stock`}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">
                {isAr ? "إجمالي القطع:" : "Total Units:"}
              </span>
              <span className="font-mono font-bold text-foreground text-sm bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                {countOf(totalPieces, "piece", isAr ? "ar" : "en")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">
                {isAr ? "القيمة التقديرية:" : "Total Value:"}
              </span>
              <span className="font-mono font-bold text-foreground text-sm">
                {formatMoney(totalValue, currency, lang)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none h-9 text-xs"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={
                isSubmitting ||
                totalPieces === 0 ||
                activeIncubators.length === 0 ||
                tooMany.length > 0
              }
              onClick={handleExecuteTransfer}
              className="flex-1 sm:flex-none h-9 text-xs gap-1.5 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{isAr ? "جاري التحويل والتحديث..." : "Transferring..."}</span>
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-4 w-4" />
                  <span>
                    {isAr
                      ? `تأكيد تحويل (${totalPieces}) قطعة للحاضنة`
                      : `Confirm Transfer (${totalPieces} items)`}
                  </span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
