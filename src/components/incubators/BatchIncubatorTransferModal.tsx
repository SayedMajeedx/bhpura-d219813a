import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";
import { toast } from "sonner";

export interface BatchTransferProduct {
  id: string;
  name: string;
  name_ar?: string | null;
  category?: string | null;
  base_price?: number | string | null;
}

export interface BatchTransferVariant {
  id: string;
  product_id: string;
  sku?: string | null;
  barcode?: string | null;
  size?: string | null;
  color?: string | null;
  stock_main: number;
  stock_incubator: number;
  selling_price: number;
  cost_price?: number;
}

export interface BatchIncubatorTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetProducts: BatchTransferProduct[];
  variantsByProduct?: Record<string, BatchTransferVariant[]>;
  allVariants?: BatchTransferVariant[];
  onSuccess?: () => void;
  initialIncubatorId?: string | null;
}

interface TransferRowState {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  stockMain: number;
  stockIncubator: number;
  sellingPrice: number;
  transferQty: number;
  consignmentPrice: number;
  externalCode: string;
  selected: boolean;
}

const db = supabase as any;

export function BatchIncubatorTransferModal({
  open,
  onOpenChange,
  targetProducts,
  variantsByProduct,
  allVariants,
  onSuccess,
  initialIncubatorId,
}: BatchIncubatorTransferModalProps) {
  const brand = useBrand();
  const brandId = brand.id;
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();

  const [selectedIncubatorId, setSelectedIncubatorId] = useState<string>(initialIncubatorId || "");
  const [transferNotes, setTransferNotes] = useState<string>("");
  const [rows, setRows] = useState<TransferRowState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customCommissionType, setCustomCommissionType] = useState<"percentage" | "fixed">(
    "percentage",
  );
  const [customCommissionValue, setCustomCommissionValue] = useState<number>(0);

  // Fetch all active incubators for this brand
  const incubatorsQ = useQuery({
    queryKey: ["incubators-active", brandId],
    queryFn: async () => {
      const { data, error } = await db
        .from("incubators")
        .select("id, name, commission_type, commission_value, currency, settlement_day, is_active")
        .eq("brand_id", brandId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: open,
    staleTime: 30_000,
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
      setCustomCommissionType(defaultInc.commission_type || "percentage");
      setCustomCommissionValue(Number(defaultInc.commission_value || 0));
    }
  }, [open, activeIncubators, selectedIncubatorId, initialIncubatorId]);

  // If variants aren't passed, fetch variants for target products
  const productIds = useMemo(() => targetProducts.map((p) => p.id), [targetProducts]);

  const fetchedVariantsQ = useQuery({
    queryKey: ["batch-transfer-variants", brandId, productIds],
    queryFn: async () => {
      if (productIds.length === 0) return [];
      const { data, error } = await db
        .from("product_variants")
        .select(
          "id, product_id, sku, barcode, size, color, stock_main, stock_incubator, selling_price, cost_price",
        )
        .in("product_id", productIds);
      if (error) throw error;
      return (data || []) as BatchTransferVariant[];
    },
    enabled: open && productIds.length > 0 && !variantsByProduct && !allVariants,
    staleTime: 10_000,
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

    const prodMap = new Map<string, BatchTransferProduct>();
    targetProducts.forEach((p) => prodMap.set(p.id, p));

    const newRows: TransferRowState[] = availableVariants.map((v) => {
      const prod = prodMap.get(v.product_id);
      const pName = (isAr ? prod?.name_ar || prod?.name : prod?.name) || prod?.name || "";
      const variantParts = [v.size, v.color].filter(Boolean);
      const vLabel =
        variantParts.length > 0 ? variantParts.join(" / ") : isAr ? "النسخة القياسية" : "Standard";
      const mainStock = Number(v.stock_main || 0);
      const incStock = Number(v.stock_incubator || 0);
      const sPrice = Number(v.selling_price || prod?.base_price || 0);

      return {
        variantId: v.id,
        productId: v.product_id,
        productName: pName,
        variantLabel: vLabel,
        sku: v.sku || v.barcode || v.id.slice(0, 8),
        stockMain: mainStock,
        stockIncubator: incStock,
        sellingPrice: sPrice,
        transferQty: mainStock > 0 ? mainStock : 1, // Default transfer all available stock or 1
        consignmentPrice: sPrice,
        externalCode: "",
        selected: true,
      };
    });

    setRows(newRows);
  }, [
    open,
    targetProducts,
    variantsByProduct,
    allVariants,
    fetchedVariantsQ.data,
    isAr,
    productIds,
  ]);

  // Row update helpers
  const updateRow = (index: number, patch: Partial<TransferRowState>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  // Quick preset actions
  const handleTransferAllAvailableStock = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        transferQty: Math.max(0, r.stockMain),
        selected: r.stockMain > 0,
      })),
    );
    toast.info(
      isAr ? "تم ضبط الكميات لكامل المخزون المتوفر" : "Quantities set to all available stock",
    );
  };

  const handleSetUniformQty = (qty: number) => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        transferQty: qty,
        selected: true,
      })),
    );
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

  const handleToggleAll = (selected: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, selected })));
  };

  // Calculated totals for active rows
  const activeRows = useMemo(() => rows.filter((r) => r.selected && r.transferQty > 0), [rows]);
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

    // Check if any row exceeds main stock
    const overstocked = activeRows.find((r) => r.transferQty > r.stockMain);
    if (overstocked) {
      toast.error(
        isAr
          ? `الكمية المطلوبة لـ (${overstocked.productName} - ${overstocked.variantLabel}) أكبر من المخزون المتوفر (${overstocked.stockMain})`
          : `Requested qty exceeds available stock for ${overstocked.productName}`,
      );
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;
    const errors: string[] = [];

    try {
      const commType = selectedIncubator?.commission_type || "percentage";
      const commVal = Number(selectedIncubator?.commission_value || 0);

      for (const row of activeRows) {
        try {
          const { error } = await db.rpc("transfer_stock_to_incubator", {
            p_incubator_id: selectedIncubatorId,
            p_variant_id: row.variantId,
            p_quantity: row.transferQty,
            p_external_code: row.externalCode.trim() || null,
            p_price: Number(row.consignmentPrice),
            p_commission_type: commType,
            p_commission_value: commVal,
            p_notes: transferNotes.trim() || null,
          });

          if (error) throw error;
          successCount++;
        } catch (err: any) {
          console.error(`Failed transferring variant ${row.variantId}:`, err);
          errors.push(row.variantLabel);
        }
      }

      if (successCount > 0) {
        toast.success(
          isAr
            ? `تم تحويل ${totalPieces} قطعة بنجاح إلى حاضنة ${selectedIncubator?.name || ""}`
            : `Successfully transferred ${totalPieces} items to ${selectedIncubator?.name || "incubator"}`,
        );

        // Invalidate all inventory and incubator queries
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["inventory_variants", brandId] }),
          qc.invalidateQueries({ queryKey: ["dashboard-variants", brandId] }),
          qc.invalidateQueries({ queryKey: ["incubator_stock", selectedIncubatorId] }),
          qc.invalidateQueries({ queryKey: ["incubator_movements", selectedIncubatorId] }),
          qc.invalidateQueries({ queryKey: ["incubator_summary", brandId] }),
          qc.invalidateQueries({ queryKey: ["incubators", brandId] }),
        ]);

        if (onSuccess) onSuccess();
        onOpenChange(false);
      }

      if (errors.length > 0) {
        toast.error(
          isAr
            ? `تعذر تحويل ${errors.length} عنصر بسبب قيود المخزون`
            : `Failed to transfer ${errors.length} items due to stock constraints`,
        );
      }
    } catch (err: any) {
      console.error("Batch incubator transfer error:", err);
      toast.error(isAr ? "حدث خطأ أثناء تنفيذ التحويل" : "An error occurred during transfer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-border shadow-2xl bg-card">
        {/* Header */}
        <DialogHeader className="p-5 pb-4 border-b border-border/70 bg-secondary/15">
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
                    {targetProducts.length} {isAr ? "منتجات" : "products"} · {rows.length}{" "}
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
        <div className="p-4 border-b border-border/60 bg-muted/20 space-y-3">
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
                        : `${formatMoney(inc.commission_value, inc.currency || "BHD")} ثابت`}
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
        </div>

        {/* Table of Variants to Transfer */}
        <div className="flex-1 overflow-y-auto p-4 max-h-[50vh]">
          {fetchedVariantsQ.isLoading ? (
            <div className="p-8 text-center space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground">
                {isAr ? "جاري تجهيز المتغيرات..." : "Loading variants..."}
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center space-y-2 border border-dashed border-border rounded-xl">
              <Package className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold">
                {isAr ? "لا توجد متغيرات للمنتجات المحددة" : "No variants found"}
              </p>
            </div>
          ) : (
            <div className="border border-border/80 rounded-xl overflow-hidden bg-background shadow-2xs">
              <table className="w-full text-xs text-right divide-y divide-border/60">
                <thead className="bg-muted/40 font-bold text-muted-foreground select-none">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && rows.every((r) => r.selected)}
                        onChange={(e) => handleToggleAll(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">{isAr ? "المنتج والنسخة" : "Product & Variant"}</th>
                    <th className="p-3 text-center">{isAr ? "المخزون الحالي" : "Current Stock"}</th>
                    <th className="p-3 text-center w-32">
                      {isAr ? "الكمية المحولة" : "Transfer Qty"}
                    </th>
                    <th className="p-3 text-center w-32">
                      {isAr ? "سعر الحاضنة" : "Consignment Price"}
                    </th>
                    <th className="p-3 w-32">{isAr ? "كود الحاضنة" : "Ext. Code"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {rows.map((row, idx) => {
                    const isExceeding = row.transferQty > row.stockMain;
                    const isZeroStock = row.stockMain <= 0;

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
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) => updateRow(idx, { selected: e.target.checked })}
                            className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                          />
                        </td>

                        {/* Product & Variant info */}
                        <td className="p-3">
                          <div className="font-bold text-foreground">{row.productName}</div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                            <span className="font-medium text-foreground/80">
                              {row.variantLabel}
                            </span>
                            <span>•</span>
                            <span className="font-mono">{row.sku}</span>
                          </div>
                        </td>

                        {/* Current Stock info */}
                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                            <Badge
                              variant="outline"
                              className={`px-1.5 py-0.5 text-[11px] font-bold ${
                                isZeroStock
                                  ? "bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400"
                                  : "bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-400"
                              }`}
                            >
                              {isAr ? "رئيسي: " : "Main: "}
                              {row.stockMain}
                            </Badge>
                            {row.stockIncubator > 0 && (
                              <Badge
                                variant="secondary"
                                className="px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {isAr ? "حاضنة: " : "Inc: "}
                                {row.stockIncubator}
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Transfer Qty Input */}
                        <td className="p-3">
                          <div className="flex items-center gap-1 justify-center">
                            <Input
                              type="number"
                              min="0"
                              max={row.stockMain}
                              value={row.transferQty}
                              disabled={!row.selected}
                              onChange={(e) =>
                                updateRow(idx, {
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
                              disabled={!row.selected || row.stockMain <= 0}
                              onClick={() => updateRow(idx, { transferQty: row.stockMain })}
                              className="h-8 px-1.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
                            >
                              {isAr ? "الكل" : "Max"}
                            </Button>
                          </div>
                          {isExceeding && (
                            <div className="text-[10px] text-destructive mt-0.5 text-center font-medium">
                              {isAr ? "تجاوز المخزون المتوفر!" : "Exceeds stock!"}
                            </div>
                          )}
                        </td>

                        {/* Consignment Price */}
                        <td className="p-3">
                          <div className="flex items-center gap-1 justify-center">
                            <Input
                              type="number"
                              min="0"
                              step="0.001"
                              value={row.consignmentPrice}
                              disabled={!row.selected}
                              onChange={(e) =>
                                updateRow(idx, {
                                  consignmentPrice: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="h-8 w-24 text-center font-mono text-xs"
                            />
                            <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                              د.ب
                            </span>
                          </div>
                        </td>

                        {/* External Code */}
                        <td className="p-3">
                          <Input
                            type="text"
                            placeholder={isAr ? "كود اختياري" : "Optional"}
                            value={row.externalCode}
                            disabled={!row.selected}
                            onChange={(e) => updateRow(idx, { externalCode: e.target.value })}
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
        <DialogFooter className="p-4 border-t border-border/80 bg-secondary/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">
                {isAr ? "إجمالي القطع:" : "Total Units:"}
              </span>
              <span className="font-mono font-bold text-foreground text-sm bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                {totalPieces} {isAr ? "قطعة" : "units"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">
                {isAr ? "القيمة التقديرية:" : "Total Value:"}
              </span>
              <span className="font-mono font-bold text-foreground text-sm">
                {formatMoney(totalValue, "BHD")}
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
              disabled={isSubmitting || totalPieces === 0 || activeIncubators.length === 0}
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
