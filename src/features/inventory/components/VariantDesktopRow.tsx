import { useEffect, useState } from "react";
import { Pencil, TrendingUp, Wand as Wand2, Sparkles, Barcode, Copy, History } from "lucide-react";
import { toast } from "sonner";
import { formatSizeWithUnit, splitCompositeVariantSize } from "@/lib/format";
import { PrintLabelButton } from "@/components/barcode-label";

import type { Product, Variant, VariantViewMode } from "@/features/inventory/types";
import {
  attributeDraftFrom,
  normalizeAttributeDraft,
} from "@/features/inventory/lib/variant-attributes";
import { VariantAttributesEditor } from "@/features/inventory/components/VariantAttributesEditor";
import {
  decideSalePrice,
  marginBand,
  marginPercent,
  saleInputValue,
  stockRunRate,
} from "@/features/inventory/lib/variant-metrics";
import { InventoryDeleteAction } from "@/features/inventory/components/InventoryDeleteAction";
import { VariantImageUploader } from "@/features/inventory/components/VariantImageUploader";
import { StockStepper } from "@/features/inventory/components/StockStepper";
import { PremiumCurrencyInput } from "@/features/inventory/components/PremiumCurrencyInput";

export function VariantDesktopRow({
  v,
  canViewFinancials,
  barcodeLabel,
  salesByVariant,
  t,
  isAr,
  brand,
  update,
  productName,
  businessName,
  genBarcode,
  del,
  isSelected,
  onToggleSelect,
  product,
  onDuplicate,
  onOpenHistory,
  viewMode = "quick",
}: {
  v: Variant;
  canViewFinancials: boolean;
  barcodeLabel: string;
  salesByVariant: Map<string, number>;
  t: any;
  isAr: boolean;
  brand: { id: string };
  update: (v: Variant, patch: Partial<Variant>) => void;
  productName: string;
  businessName: string | null;
  genBarcode: () => string;
  del: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  renderImageCol?: boolean;
  renderSkuCol?: boolean;
  renderBarcodeCol?: boolean;
  product?: Product;
  onDuplicate?: (v: Variant) => void;
  onOpenHistory?: (v: Variant) => void;
  viewMode?: VariantViewMode;
}) {
  const [costVal, setCostVal] = useState(String(v.cost_price));
  const [sellingVal, setSellingVal] = useState(saleInputValue(v));

  useEffect(() => {
    setCostVal(String(v.cost_price));
  }, [v.cost_price]);

  useEffect(() => {
    setSellingVal(
      saleInputValue({ original_price: v.original_price, selling_price: v.selling_price }),
    );
  }, [v.original_price, v.selling_price]);

  const costNum = Number(costVal) || 0;
  const sellingNum = sellingVal ? Number(sellingVal) : Number(product?.base_price ?? 0);
  const currentMargin = marginPercent(sellingNum, costNum);

  const commitSalePrice = (rawValue: string) => {
    const decision = decideSalePrice(rawValue, Number(product?.base_price ?? 0));
    if (decision.kind === "invalid") {
      setSellingVal(saleInputValue(v));
      toast.error(
        isAr
          ? "لا يمكن أن يكون سعر التخفيض أعلى من السعر الأساسي. امسح الحقل لإزالة التخفيض."
          : "Sale price cannot exceed the regular price. Clear the field to remove the sale.",
      );
      return;
    }
    if (decision.kind === "clear") setSellingVal("");
    update(v, { selling_price: decision.sellingPrice });
  };

  // Draft for the inline attributes editor; follows the variant when it changes elsewhere.
  const [isEditingAttrs, setIsEditingAttrs] = useState(false);
  const [attrDraft, setAttrDraft] = useState(() => attributeDraftFrom(v));
  useEffect(() => {
    setAttrDraft(
      attributeDraftFrom({
        size: v.size,
        size_unit: v.size_unit,
        color: v.color,
        fabric: v.fabric,
        option_four: v.option_four,
        option_five: v.option_five,
      }),
    );
  }, [v.size, v.size_unit, v.color, v.fabric, v.option_four, v.option_five]);

  const saveAttributes = () => {
    update(v, normalizeAttributeDraft(attrDraft));
    setIsEditingAttrs(false);
  };

  const marginBg = {
    healthy:
      "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30",
    medium:
      "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30",
    low: "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30",
  }[marginBand(currentMargin)];

  const runRate = stockRunRate({
    stockMain: v.stock_main,
    stockIncubator: v.stock_incubator,
    qtySold: salesByVariant.get(v.id) || 0,
    createdAt: v.created_at,
  });
  let runRateText = isAr ? "لا مبيعات" : "No sales";
  let runRateColor = "text-muted-foreground text-xs";
  if (runRate.kind === "out") {
    runRateText = isAr ? "نفد" : "Out of stock";
    runRateColor = "text-rose-600 dark:text-rose-400 font-bold text-xs";
  } else if (runRate.kind === "days-left") {
    runRateText = isAr ? `ينفد في ${runRate.days} ي` : `${runRate.days} d left`;
    runRateColor =
      runRate.days <= 7
        ? "text-amber-600 dark:text-amber-400 font-bold text-xs"
        : "text-emerald-600 dark:text-emerald-400 font-medium text-xs";
  }

  return (
    <tr
      className={`border-t border-border transition-all ${
        isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/15"
      }`}
    >
      {/* Checkbox (Col 1) */}
      <td className="w-10 px-2 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer transition-all"
          checked={isSelected}
          onChange={onToggleSelect}
        />
      </td>

      {/* Variant & Identity (Col 2) */}
      <td className="px-3 py-3 text-start align-middle" onClick={(e) => e.stopPropagation()}>
        {isEditingAttrs ? (
          <VariantAttributesEditor
            variant={v}
            product={product}
            brandId={brand.id}
            isAr={isAr}
            draft={attrDraft}
            onDraftChange={(patch) => setAttrDraft((draft) => ({ ...draft, ...patch }))}
            onCancel={() => setIsEditingAttrs(false)}
            onSave={saveAttributes}
          />
        ) : (
          <div className="flex flex-col gap-1.5 min-w-0">
            {/* Top Line: Thumbnail & Attribute Badges */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="shrink-0">
                <VariantImageUploader
                  brandId={brand.id}
                  imageUrl={v.image_url}
                  onChange={(url) => update(v, { image_url: url })}
                  isAr={isAr}
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0 group/v">
                {(() => {
                  const split = splitCompositeVariantSize(v.size, v.size_unit);
                  const hasAttributes = Boolean(
                    v.size || v.color || v.fabric || v.option_four || v.option_five,
                  );

                  if (!hasAttributes) {
                    return (
                      <span className="text-muted-foreground text-xs italic">
                        {isAr ? "متغير قياسي" : "Standard Variant"}
                      </span>
                    );
                  }

                  return (
                    <>
                      {v.size && (
                        <span className="inline-flex items-center bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 border border-primary/20 rounded-md">
                          {split.isComposite
                            ? `${split.size} ${isAr ? (split.unit === "g" ? "غرام" : split.unit) : split.unit}`
                            : formatSizeWithUnit(v.size, v.size_unit, isAr ? "ar" : "en")}
                        </span>
                      )}
                      {split.isComposite && !v.color && split.option && (
                        <span className="inline-flex items-center bg-muted/80 text-foreground text-xs font-semibold px-2 py-0.5 border border-border rounded-md gap-1">
                          <Sparkles className="h-3 w-3 text-primary" />
                          {split.option}
                        </span>
                      )}
                      {v.color && (
                        <span className="inline-flex items-center bg-muted text-foreground text-xs font-semibold px-2 py-0.5 border border-border rounded-md gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0" />
                          {v.color}
                        </span>
                      )}
                      {v.fabric && (
                        <span className="inline-flex items-center bg-muted text-foreground text-xs font-semibold px-2 py-0.5 border border-border rounded-md">
                          {v.fabric}
                        </span>
                      )}
                      {v.option_four && (
                        <span className="inline-flex items-center bg-muted text-foreground text-xs font-semibold px-2 py-0.5 border border-border rounded-md">
                          {v.option_four}
                        </span>
                      )}
                      {v.option_five && (
                        <span className="inline-flex items-center bg-muted text-foreground text-xs font-semibold px-2 py-0.5 border border-border rounded-md">
                          {v.option_five}
                        </span>
                      )}
                    </>
                  );
                })()}

                <button
                  type="button"
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/v:opacity-100 transition-opacity"
                  onClick={() => setIsEditingAttrs(true)}
                  title={isAr ? "تعديل الخصائص" : "Edit attributes"}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Bottom Line: SKU & Barcode Controls */}
            {viewMode === "full" || viewMode === "barcodes" ? (
              <div className="flex items-center gap-2 pt-1 border-t border-border-subtle flex-wrap">
                <div className="flex items-center gap-1 bg-muted/30 hover:bg-muted/50 rounded-lg px-2 py-0.5 border border-border-subtle transition-colors">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight">
                    {t("inventory.sku")}:
                  </span>
                  <input
                    className="h-6 w-24 bg-transparent font-mono text-xs font-semibold outline-none focus:text-primary placeholder:text-muted-foreground"
                    defaultValue={v.sku ?? ""}
                    onBlur={(e) => update(v, { sku: e.target.value || null })}
                    placeholder="—"
                  />
                </div>

                <div className="flex items-center gap-1 bg-muted/30 hover:bg-muted/50 rounded-lg px-2 py-0.5 border border-border-subtle transition-colors">
                  <Barcode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-bold text-muted-foreground shrink-0">
                    {barcodeLabel}:
                  </span>
                  <input
                    className="h-6 w-28 bg-transparent font-mono text-xs font-semibold outline-none focus:text-primary placeholder:text-muted-foreground"
                    defaultValue={v.barcode ?? ""}
                    onBlur={(e) => update(v, { barcode: e.target.value.trim() || null })}
                    placeholder={isAr ? "بدون باركود" : "None"}
                  />
                  <button
                    type="button"
                    title={isAr ? "توليد باركود تلقائياً" : "Generate barcode"}
                    className="h-5.5 w-5.5 flex items-center justify-center rounded hover:bg-background text-muted-foreground hover:text-primary transition-colors active:scale-95 shadow-2xs shrink-0"
                    onClick={() => update(v, { barcode: genBarcode() })}
                  >
                    <Wand2 className="h-3 w-3" />
                  </button>
                </div>

                {v.barcode && (
                  <PrintLabelButton
                    label={isAr ? "طباعة" : "Print"}
                    data={{
                      code: v.barcode,
                      productName,
                      size: v.size,
                      color: v.color,
                      price: v.selling_price,
                      businessName,
                    }}
                  />
                )}
              </div>
            ) : v.barcode || v.sku ? (
              <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                {v.sku && (
                  <span className="inline-flex items-center font-mono text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border-subtle shrink-0">
                    SKU: {v.sku}
                  </span>
                )}
                {v.barcode && (
                  <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border-subtle shrink-0">
                    <Barcode className="h-3 w-3 text-muted-foreground" />
                    <span>{v.barcode}</span>
                  </span>
                )}
                {v.barcode && (
                  <PrintLabelButton
                    label={isAr ? "طباعة" : "Print"}
                    data={{
                      code: v.barcode,
                      productName,
                      size: v.size,
                      color: v.color,
                      price: v.selling_price,
                      businessName,
                    }}
                  />
                )}
              </div>
            ) : null}
          </div>
        )}
      </td>

      {/* Pricing & Financials (Col 3) */}
      <td className="w-48 px-2 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-1">
          <PremiumCurrencyInput
            value={sellingVal}
            onChange={setSellingVal}
            onBlur={(e) => commitSalePrice(e.target.value)}
            onClear={() => commitSalePrice("")}
            clearLabel={isAr ? "إزالة التخفيض" : "Remove sale"}
            placeholder={String(product?.base_price ?? "0.000")}
          />
          {viewMode === "full" && canViewFinancials ? (
            <div className="flex items-center justify-center gap-1 mt-1 pt-1 border-t border-border-subtle w-full">
              <span className="text-xs font-bold text-muted-foreground shrink-0">
                {isAr ? "التكلفة:" : "Cost:"}
              </span>
              <div className="relative inline-flex items-center w-22 shrink-0">
                <input
                  type="number"
                  step="0.001"
                  className="h-7 w-full ps-1 pe-5.5 text-center rounded-lg border border-input bg-background text-xs font-mono font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                  value={costVal}
                  onChange={(e) => setCostVal(e.target.value)}
                  onBlur={(e) => update(v, { cost_price: Number(e.target.value) })}
                  placeholder="0.000"
                />
                <span className="absolute end-1 text-xs font-black text-muted-foreground pointer-events-none">
                  BHD
                </span>
              </div>
              <span
                className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-black border shrink-0 ${marginBg}`}
                title={isAr ? "هامش الربح" : "Profit margin"}
              >
                <TrendingUp className="h-2.5 w-2.5" />
                {currentMargin.toFixed(0)}%
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground flex-wrap">
              {canViewFinancials && (
                <span>
                  {isAr ? "التكلفة" : "Cost"}:{" "}
                  <strong className="font-mono text-foreground">{costVal || "0"}</strong>
                </span>
              )}
              {canViewFinancials && (
                <span
                  className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.2 rounded-full text-xs font-bold border ${marginBg}`}
                >
                  <TrendingUp className="h-2.5 w-2.5" />
                  {currentMargin.toFixed(0)}%
                </span>
              )}
              {Number(v.original_price || 0) > Number(v.selling_price || 0) && (
                <span className="line-through text-muted-foreground text-xs">
                  {v.original_price}
                </span>
              )}
            </div>
          )}
        </div>
      </td>

      {/* Stock & Inventory (Col 4) */}
      <td className="w-56 px-2 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight shrink-0">
              {isAr ? "المحل:" : "Store:"}
            </span>
            <StockStepper
              value={v.stock_main ?? 0}
              onChange={(val) => update(v, { stock_main: val })}
            />
            {onOpenHistory && (
              <button
                type="button"
                className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => onOpenHistory(v)}
                title={isAr ? "سجل حركات المخزون" : "Inventory Ledger History"}
                aria-label={isAr ? "سجل حركات المخزون" : "Inventory Ledger History"}
              >
                <History className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {viewMode === "full" ? (
            <div className="flex flex-col items-center gap-1 mt-1 pt-1 border-t border-border-subtle w-full">
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight shrink-0">
                  {isAr ? "حاضنة:" : "Inc:"}
                </span>
                <StockStepper
                  value={v.stock_incubator ?? 0}
                  onChange={(val) => update(v, { stock_incubator: val })}
                />
              </div>
              <span className={`text-xs font-medium leading-none ${runRateColor}`}>
                {runRateText}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
              {(v.stock_incubator ?? 0) > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold text-xs border border-border-subtle">
                  {isAr ? "حاضنة:" : "Inc:"}{" "}
                  <strong className="ms-1 text-foreground">{v.stock_incubator}</strong>
                </span>
              )}
              <span className={`text-xs whitespace-nowrap leading-none ${runRateColor}`}>
                {runRateText}
              </span>
            </div>
          )}
        </div>
      </td>

      {/* Actions (Col 5) */}
      <td className="w-20 px-2 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          {onOpenHistory && (
            <button
              type="button"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => onOpenHistory(v)}
              title={isAr ? "سجل حركات المخزون" : "Inventory History"}
              aria-label={isAr ? "سجل حركات المخزون" : "Inventory History"}
            >
              <History className="h-4 w-4" />
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              onClick={() => onDuplicate(v)}
              title={
                isAr
                  ? "تكرار هذا المتغير (إضافة خيار بنفس المقاس/الوزن)"
                  : "Duplicate variant (add option with same size)"
              }
            >
              <Copy className="h-4 w-4" />
            </button>
          )}
          <InventoryDeleteAction
            message={t("inventory.deleteVariantConfirm")}
            onConfirm={() => del(v.id)}
          />
        </div>
      </td>
    </tr>
  );
}
