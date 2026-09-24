import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, HelpCircle, Copy, History } from "lucide-react";
import { toast } from "sonner";
import { formatSizeWithUnit, splitCompositeVariantSize } from "@/lib/format";

import type { Product, Variant } from "@/features/inventory/types";
import { InventoryDeleteAction } from "@/features/inventory/components/InventoryDeleteAction";
import { VariantImageUploader } from "@/features/inventory/components/VariantImageUploader";
import { StockStepper } from "@/features/inventory/components/StockStepper";
import { PremiumCurrencyInput } from "@/features/inventory/components/PremiumCurrencyInput";

export function VariantMobileCard({
  v,
  canViewFinancials,
  barcodeLabel,
  SIZE_UNITS: _SIZE_UNITS,
  salesByVariant,
  t,
  isAr,
  brand,
  update,
  del,
  mainLabel,
  incLabel,
  isSelected,
  onToggleSelect,
  product,
  onDuplicate,
  onOpenHistory,
}: {
  v: Variant;
  canViewFinancials: boolean;
  barcodeLabel: string;
  SIZE_UNITS: readonly string[];
  salesByVariant: Map<string, number>;
  t: any;
  isAr: boolean;
  brand: { id: string };
  update: (v: Variant, patch: Partial<Variant>) => void;
  del: (id: string) => void;
  mainLabel: string;
  incLabel: string;
  isSelected: boolean;
  onToggleSelect: () => void;
  product?: Product;
  onDuplicate?: (v: Variant) => void;
  onOpenHistory?: (v: Variant) => void;
}) {
  const [costVal, setCostVal] = useState(String(v.cost_price));
  const [sellingVal, setSellingVal] = useState(
    Number(v.original_price || 0) > Number(v.selling_price || 0) ? String(v.selling_price) : "",
  );

  useEffect(() => {
    setCostVal(String(v.cost_price));
  }, [v.cost_price]);

  useEffect(() => {
    setSellingVal(
      Number(v.original_price || 0) > Number(v.selling_price || 0) ? String(v.selling_price) : "",
    );
  }, [v.original_price, v.selling_price]);

  const costNum = Number(costVal) || 0;
  const sellingNum = sellingVal ? Number(sellingVal) : Number(product?.base_price ?? 0);
  const currentMargin = sellingNum > 0 ? ((sellingNum - costNum) / sellingNum) * 100 : 0;

  const commitSalePrice = (rawValue: string) => {
    const regularPrice = Number(product?.base_price ?? 0);
    const salePrice = rawValue === "" ? 0 : Number(rawValue);
    if (rawValue === "" || salePrice === 0 || salePrice === regularPrice) {
      setSellingVal("");
      update(v, { selling_price: regularPrice });
      return;
    }
    if (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > regularPrice) {
      setSellingVal(
        Number(v.original_price || 0) > Number(v.selling_price || 0) ? String(v.selling_price) : "",
      );
      toast.error(
        isAr
          ? "لا يمكن أن يكون سعر التخفيض أعلى من السعر الأساسي. امسح الحقل لإزالة التخفيض."
          : "Sale price cannot exceed the regular price. Clear the field to remove the sale.",
      );
      return;
    }
    update(v, { selling_price: salePrice });
  };

  return (
    <div
      className={`rounded-xl border p-4 space-y-3.5 shadow-sm transition-all bg-background ${isSelected ? "border-primary bg-primary/5/10" : "border-border"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2.5">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="h-4.5 w-4.5 rounded border-input text-primary focus:ring-primary cursor-pointer transition-all"
            checked={isSelected}
            onChange={onToggleSelect}
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {(() => {
              const split = splitCompositeVariantSize(v.size, v.size_unit);
              const hasAttributes = Boolean(
                v.size || v.color || v.fabric || v.option_four || v.option_five,
              );

              if (!hasAttributes) {
                return (
                  <span className="text-muted-foreground text-xs italic font-semibold">
                    {isAr ? "متغير قياسي" : "Standard Variant"}
                  </span>
                );
              }

              return (
                <>
                  {v.size && (
                    <span className="inline-flex items-center bg-primary/5 text-primary text-xs font-bold px-1.5 py-0.5 border border-primary/10 rounded-sm">
                      {split.isComposite
                        ? `${split.size} ${isAr ? (split.unit === "g" ? "غرام" : split.unit) : split.unit}`
                        : formatSizeWithUnit(v.size, v.size_unit, isAr ? "ar" : "en")}
                    </span>
                  )}
                  {split.isComposite && !v.color && split.option && (
                    <span className="inline-flex items-center bg-primary/10 text-primary text-xs font-bold px-1.5 py-0.5 border border-primary/20 rounded-sm gap-1">
                      <Sparkles className="h-2.5 w-2.5" />
                      {split.option}
                    </span>
                  )}
                  {v.color && (
                    <span className="inline-flex items-center bg-muted text-foreground text-xs font-bold px-1.5 py-0.5 border border-border rounded-sm">
                      {v.color}
                    </span>
                  )}
                  {v.fabric && (
                    <span className="inline-flex items-center bg-muted text-foreground text-xs font-bold px-1.5 py-0.5 border border-border rounded-sm">
                      {v.fabric}
                    </span>
                  )}
                  {v.option_four && (
                    <span className="inline-flex items-center bg-muted text-foreground text-xs font-bold px-1.5 py-0.5 border border-border rounded-sm">
                      {v.option_four}
                    </span>
                  )}
                  {v.option_five && (
                    <span className="inline-flex items-center bg-muted text-foreground text-xs font-bold px-1.5 py-0.5 border border-border rounded-sm">
                      {v.option_five}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {onOpenHistory && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 touch-manipulation"
              onClick={() => onOpenHistory(v)}
              title={isAr ? "سجل حركات المخزون" : "Inventory Ledger History"}
              aria-label={isAr ? "سجل حركات المخزون" : "Inventory Ledger History"}
            >
              <History className="h-4 w-4" />
            </Button>
          )}
          {onDuplicate && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 touch-manipulation"
              onClick={() => onDuplicate(v)}
              title={
                isAr
                  ? "تكرار هذا المتغير (إضافة خيار بنفس المقاس/الوزن)"
                  : "Duplicate variant (add option with same size)"
              }
              aria-label={isAr ? "تكرار هذا المتغير" : "Duplicate variant"}
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
          <InventoryDeleteAction
            message={t("inventory.deleteVariantConfirm")}
            onConfirm={() => del(v.id)}
            mobile
          />
        </div>
      </div>

      {/* Quick stock is the default mobile workflow. */}
      <div
        className="grid grid-cols-2 gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-xs font-black uppercase text-muted-foreground">
              {mainLabel}
            </Label>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <HelpCircle className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-center text-xs">
                  {isAr
                    ? "القطع المتوفرة فعلياً داخل متجرك والجاهزة للبيع المباشر والشحن."
                    : "Physical stock in your primary store, ready for instant sale and shipping."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="mt-1">
            <StockStepper
              value={v.stock_main ?? 0}
              onChange={(val) => update(v, { stock_main: val })}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-xs font-black uppercase text-muted-foreground">{incLabel}</Label>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <HelpCircle className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-center text-xs">
                  {isAr
                    ? "القطع المعروضة في محلات خارجية أو حاضنات شريكة."
                    : "Items held at partner boutiques or business incubators."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="mt-1">
            <StockStepper
              value={v.stock_incubator ?? 0}
              onChange={(val) => update(v, { stock_incubator: val })}
            />
          </div>
        </div>
      </div>

      <details
        className="group rounded-xl border border-border-subtle bg-muted/15"
        onClick={(e) => e.stopPropagation()}
      >
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-bold [&::-webkit-details-marker]:hidden">
          <span>{isAr ? "تفاصيل السعر والباركود والصورة" : "Price, barcode & image details"}</span>
          <span className="text-muted-foreground group-open:hidden">{isAr ? "فتح" : "Open"}</span>
          <span className="hidden text-muted-foreground group-open:inline">
            {isAr ? "إغلاق" : "Close"}
          </span>
        </summary>
        <div className="grid grid-cols-2 gap-3 border-t border-border-subtle p-3">
          {/* Inherited cost and optional sale price */}
          {canViewFinancials && (
            <div>
              <Label className="text-xs font-black uppercase text-muted-foreground">
                {t("inventory.cost")}
              </Label>
              <div className="mt-1">
                <PremiumCurrencyInput
                  value={costVal}
                  onChange={setCostVal}
                  onBlur={(e) => update(v, { cost_price: Number(e.target.value) })}
                  className="h-10 rounded-xl text-xs"
                  disabled
                />
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs font-black uppercase text-muted-foreground">
              {isAr ? "السعر اللي يدفعه العميل" : "Customer Price"}
            </Label>
            <div className="mt-1">
              <PremiumCurrencyInput
                value={sellingVal}
                onChange={setSellingVal}
                onBlur={(e) => commitSalePrice(e.target.value)}
                onClear={() => commitSalePrice("")}
                clearLabel={isAr ? "إزالة التخفيض" : "Remove sale"}
                className="h-10 rounded-xl text-xs"
                placeholder={String(product?.base_price ?? "0.000")}
              />
            </div>
          </div>

          {/* Dynamic image picker and regular price */}
          <div>
            <Label className="text-xs font-black uppercase text-muted-foreground">
              {isAr ? "صورة المتغير" : "Variant Image"}
            </Label>
            <div className="mt-1">
              <VariantImageUploader
                brandId={brand.id}
                imageUrl={v.image_url}
                onChange={(url) => update(v, { image_url: url })}
                isAr={isAr}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-black uppercase text-muted-foreground">
              {isAr ? "السعر العادي" : "Regular Price"}
            </Label>
            <input
              type="number"
              step="0.001"
              min="0"
              className="mt-1 h-9 w-full rounded-lg border border-input bg-muted/40 px-3 text-xs font-semibold disabled:opacity-100"
              value={product?.base_price ?? 0}
              disabled
            />
          </div>

          {/* SKU & Barcode */}
          <div>
            <Label className="text-xs font-black uppercase text-muted-foreground">SKU</Label>
            <input
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              defaultValue={v.sku ?? ""}
              onBlur={(e) => update(v, { sku: e.target.value || null })}
              placeholder="—"
            />
          </div>
          <div>
            <Label className="text-xs font-black uppercase text-muted-foreground">
              {barcodeLabel}
            </Label>
            <input
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              defaultValue={v.barcode ?? ""}
              onBlur={(e) => update(v, { barcode: e.target.value.trim() || null })}
              placeholder="—"
            />
          </div>
        </div>
      </details>

      {/* Summary Footer */}
      <div className="flex items-center justify-between rounded-xl bg-secondary/25 px-4 py-3 text-xs border border-border-subtle font-semibold">
        <div className="flex items-center gap-2">
          <span>
            {t("inventory.stock")}:{" "}
            <b className="text-sm font-black">{(v.stock_main ?? 0) + (v.stock_incubator ?? 0)}</b>
          </span>
          {onOpenHistory && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-primary rounded-md"
              onClick={() => onOpenHistory(v)}
            >
              <History className="h-3 w-3" />
              <span>{isAr ? "السجل" : "History"}</span>
            </Button>
          )}
        </div>
        {(() => {
          const stock = (v.stock_main ?? 0) + (v.stock_incubator ?? 0);
          const qtySold = salesByVariant.get(v.id) || 0;
          const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
          const daysElapsed = variantCreatedAt
            ? Math.max(
                1,
                Math.min(
                  45,
                  Math.ceil(
                    (new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
                  ),
                ),
              )
            : 45;
          const dailyVelocity = qtySold / daysElapsed;

          let runRateText = isAr ? "لا مبيعات مؤخراً" : "No recent sales";
          let runRateColor = "text-muted-foreground";

          if (stock <= 0) {
            runRateText = isAr ? "نفد المخزون" : "Out of stock";
            runRateColor = "text-rose-600 dark:text-rose-500 font-extrabold";
          } else if (dailyVelocity > 0) {
            const days = Math.ceil(stock / dailyVelocity);
            runRateText = isAr ? `ينفد خلال ${days} يوم` : `Out of stock in ${days} d`;
            runRateColor =
              days <= 7
                ? "text-amber-600 dark:text-amber-500 font-extrabold animate-pulse"
                : "text-emerald-600 dark:text-emerald-500 font-extrabold";
          }

          return <span className={runRateColor}>{runRateText}</span>;
        })()}
        {canViewFinancials && (
          <span className="text-primary font-black">
            {t("inventory.margin")}: {currentMargin.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}
