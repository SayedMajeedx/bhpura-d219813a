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
  PHONE_FULL_SCREEN,
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
import { countOf, arNounOblique } from "@/lib/arabic-count";
import { TransferSizeRows } from "@/components/incubators/TransferSizeRows";

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
          ? `تم تحويل ${arNounOblique(pieces, "piece")} بنجاح إلى محل شريك ${selectedIncubator?.name || ""}`
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
      {/* A fixed height, so nothing jumps while the sizes load; the whole screen on a phone. */}
      <DialogContent
        className={`flex h-[min(92dvh,56rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl ${PHONE_FULL_SCREEN}`}
      >
        {/* Header */}
        <DialogHeader className="border-b border-border-strong bg-secondary/15 p-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:p-5 sm:pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="flex flex-wrap items-center gap-2 font-heading text-base font-bold text-foreground sm:text-lg">
                  <span>
                    {isAr
                      ? "تحويل وتعيين البضاعة إلى المحل الشريك"
                      : "Transfer stock to a partner shop"}
                  </span>
                  <Badge variant="secondary" className="font-mono text-xs font-semibold px-2">
                    {countOf(targetProducts.length, "product", isAr ? "ar" : "en")} ·{" "}
                    {countOf(rows.length, "size", isAr ? "ar" : "en")}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                  {isAr
                    ? "نقل المخزون وتحديد أسعار الأمانة وعمولة المحل الشريك دفعة واحدة وبضغطة زر."
                    : "Send pieces to a partner shop and set their prices, in one go."}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* One scrolling body: the controls scroll away, the search stays, the list has the room. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Top Control Bar: Incubator Picker & Quick Presets */}
          <div className="space-y-3 border-b border-border-subtle bg-muted/20 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* Incubator Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span>
                    {isAr ? "المحل الشريك المستهدف" : "Target Incubator / Consignment Store"}
                  </span>
                </Label>
                {incubatorsQ.isLoading ? (
                  <div className="h-9 w-full rounded-md bg-muted animate-pulse" />
                ) : activeIncubators.length === 0 ? (
                  <div className="text-xs text-destructive p-2 bg-destructive/10 rounded-md border border-destructive/20 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>
                      {isAr
                        ? "لا توجد محلات شركاء نشطة في حسابك. يرجى إضافة محل شريك أولاً من قسم محلات الشركاء."
                        : "No active incubators found. Please create one in Incubators section."}
                    </span>
                  </div>
                ) : (
                  <select
                    value={selectedIncubatorId}
                    onChange={(e) => setSelectedIncubatorId(e.target.value)}
                    aria-label={isAr ? "المحل الشريك المستهدف" : "Partner shop"}
                    className="h-10 w-full max-w-full rounded-lg border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
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

              {/* Batch Fast Actions */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  <span>{isAr ? "أدوات الضبط السريع للكميات" : "Fast Batch Actions"}</span>
                </Label>
                <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5 no-scrollbar sm:flex-wrap sm:overflow-visible">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTransferAllAvailableStock}
                    className="h-8 shrink-0 gap-1 bg-background text-xs font-medium hover:bg-secondary/40"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    {isAr ? "تحويل كامل المتوفر" : "All Available Stock"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetUniformQty(1)}
                    className="h-8 shrink-0 gap-1 bg-background text-xs font-medium hover:bg-secondary/40"
                  >
                    {isAr ? "1 قطعة لكل نوع" : "1 per variant"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleApplySellingPrices}
                    className="h-8 shrink-0 gap-1 bg-background text-xs font-medium hover:bg-secondary/40"
                  >
                    {isAr ? "اعتماد أسعار البيع" : "Reset Prices"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Search & Collapse Filter Bar: stays at the top while the list scrolls */}
          <div className="sticky top-0 z-10 flex flex-col items-stretch gap-2 border-b border-border-subtle bg-card/95 px-4 py-2.5 backdrop-blur sm:flex-row sm:items-center">
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
                aria-label={isAr ? "بحث في المنتجات" : "Search products"}
                className="h-9 w-full bg-background pe-9 ps-3 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              <Badge variant="outline" className="text-xs font-mono px-2 py-1">
                {countOf(productGroups.length, "product", isAr ? "ar" : "en")}
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">
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

          {/* Product-Grouped Collapsible List */}
          <div className="space-y-3 p-4">
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
                        {groupTotalTransferQty > 0 && (
                          <Badge
                            variant="secondary"
                            className="border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary sm:hidden"
                          >
                            {groupTotalTransferQty}
                          </Badge>
                        )}
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
                          aria-expanded={isExpanded}
                          aria-label={
                            isExpanded
                              ? isAr
                                ? `طي ${group.productName}`
                                : `Collapse ${group.productName}`
                              : isAr
                                ? `فتح ${group.productName}`
                                : `Open ${group.productName}`
                          }
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* This product's sizes: cards on a phone, a table from sm up */}
                    {isExpanded && (
                      <div className="border-t border-border-subtle">
                        <TransferSizeRows
                          rows={groupRows}
                          productName={group.productName}
                          isAr={isAr}
                          money={money}
                          onTick={tick}
                          onUpdate={updateRowByVariantId}
                        />
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
        </div>

        {/* Footer: Summary Metrics & Action Buttons */}
        <DialogFooter className="flex flex-col items-stretch justify-between gap-2.5 border-t border-border-strong bg-secondary/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs sm:justify-start">
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
              className="h-11 flex-1 text-sm sm:h-9 sm:flex-none sm:text-xs"
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
              className="h-11 flex-[2] gap-1.5 bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 sm:h-9 sm:flex-none sm:text-xs"
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
                      ? `تحويل ${arNounOblique(totalPieces, "piece")}`
                      : `Transfer ${countOf(totalPieces, "piece", "en")}`}
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
