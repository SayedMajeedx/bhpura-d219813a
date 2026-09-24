import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n";
import type { Product } from "@/features/inventory/types";
import type { VariantRowAxes } from "@/features/inventory/hooks/use-inventory-axis-defaults";
import { SIZE_UNITS, SIZE_UNIT_LABELS } from "@/features/inventory/lib/size-units";
import { stockLabels } from "@/features/inventory/lib/stock-labels";
import type { VariantDraft } from "@/features/inventory/lib/variant-draft";
import { VariantImageUploader } from "@/features/inventory/components/VariantImageUploader";

/** Mobile form for a new variant; the draft is owned by the variant list. */
export function VariantAddCard({
  row,
  setRow,
  axes,
  product,
  brandId,
  canViewFinancials,
  isAr,
  onCancel,
  onSave,
}: {
  row: VariantDraft;
  setRow: (row: VariantDraft) => void;
  axes: VariantRowAxes;
  product?: Product;
  brandId: string;
  canViewFinancials: boolean;
  isAr: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useT();
  const { mainLabel, incLabel, mainTooltip, incTooltip, barcodeLabel } = stockLabels(isAr);
  const {
    size: sizeAxis,
    color: colorAxis,
    fabric: fabricAxis,
    four: fourAxis,
    five: fiveAxis,
  } = axes;

  return (
    <div className="rounded-xl border border-primary/35 bg-secondary/35 p-4 space-y-4 shadow-sm animate-in fade-in duration-200">
      <div className="font-extrabold text-sm text-foreground">{t("inventory.addVariant")}</div>
      <div className="grid grid-cols-2 gap-3.5">
        {sizeAxis.visible && (
          <div>
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              {sizeAxis.label}
            </Label>
            <Input
              className="mt-1 h-9 rounded-md text-xs"
              value={row.size}
              placeholder={sizeAxis.label}
              onChange={(e) => setRow({ ...row, size: e.target.value })}
            />
          </div>
        )}
        {sizeAxis.visible && (
          <div>
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              {isAr ? `وحدة ${sizeAxis.label}` : "Unit"}
            </Label>
            <select
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              value={row.size_unit}
              onChange={(e) => setRow({ ...row, size_unit: e.target.value })}
            >
              {SIZE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {isAr ? SIZE_UNIT_LABELS[u]?.ar || u : SIZE_UNIT_LABELS[u]?.en || u || "—"}
                </option>
              ))}
            </select>
          </div>
        )}
        {colorAxis.visible && (
          <div>
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              {colorAxis.label}
            </Label>
            <Input
              className="mt-1 h-9 rounded-md text-xs"
              value={row.color}
              placeholder={colorAxis.label}
              onChange={(e) => setRow({ ...row, color: e.target.value })}
            />
          </div>
        )}
        {fabricAxis.visible && (
          <div>
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              {fabricAxis.label}
            </Label>
            <Input
              className="mt-1 h-9 rounded-md text-xs"
              value={row.fabric}
              placeholder={fabricAxis.label}
              onChange={(e) => setRow({ ...row, fabric: e.target.value })}
            />
          </div>
        )}
        {fourAxis.visible && (
          <div>
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              {fourAxis.label}
            </Label>
            <Input
              className="mt-1 h-9 rounded-md text-xs"
              value={row.option_four}
              placeholder={fourAxis.label}
              onChange={(e) => setRow({ ...row, option_four: e.target.value })}
            />
          </div>
        )}
        {fiveAxis.visible && (
          <div>
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              {fiveAxis.label}
            </Label>
            <Input
              className="mt-1 h-9 rounded-md text-xs"
              value={row.option_five}
              placeholder={fiveAxis.label}
              onChange={(e) => setRow({ ...row, option_five: e.target.value })}
            />
          </div>
        )}
        <div>
          <Label className="text-xs font-bold text-muted-foreground uppercase">
            {t("inventory.sku")}
          </Label>
          <Input
            className="mt-1 h-9 rounded-md text-xs"
            value={row.sku}
            onChange={(e) => setRow({ ...row, sku: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs font-bold text-muted-foreground uppercase">
            {barcodeLabel}
          </Label>
          <Input
            className="mt-1 h-9 rounded-md text-xs"
            value={row.barcode}
            onChange={(e) => setRow({ ...row, barcode: e.target.value })}
          />
        </div>
        {canViewFinancials && (
          <div>
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              {t("inventory.cost")}
            </Label>
            <Input
              type="number"
              step="0.001"
              className="mt-1 h-9 rounded-md bg-muted/50 text-xs font-bold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
              value={row.cost_price}
              disabled
            />
          </div>
        )}
        <div>
          <Label className="text-xs font-bold text-muted-foreground uppercase">
            {isAr ? "السعر اللي يدفعه العميل" : "Customer Price"}
          </Label>
          <Input
            type="number"
            step="0.001"
            className="mt-1 h-9 rounded-md text-xs font-bold"
            value={row.selling_price}
            placeholder={String(product?.base_price ?? "0.000")}
            onChange={(e) => setRow({ ...row, selling_price: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs font-bold text-muted-foreground uppercase">
            {isAr ? "السعر الأساسي للمنتج" : "Base Price"}
          </Label>
          <Input
            type="number"
            step="0.001"
            min="0"
            className="mt-1 h-9 rounded-md text-xs"
            value={product?.base_price ?? 0}
            disabled
          />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-xs font-bold text-muted-foreground uppercase">{mainLabel}</Label>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <HelpCircle className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-center text-xs">
                  {mainTooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            type="number"
            className="mt-1 h-9 rounded-md text-xs"
            value={row.stock_main}
            onChange={(e) => setRow({ ...row, stock_main: e.target.value })}
          />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-xs font-bold text-muted-foreground uppercase">{incLabel}</Label>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <HelpCircle className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-center text-xs">
                  {incTooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            type="number"
            className="mt-1 h-9 rounded-md text-xs"
            value={row.stock_incubator}
            onChange={(e) => setRow({ ...row, stock_incubator: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs font-bold text-muted-foreground block uppercase mb-1">
            {isAr ? "صورة المتغير" : "Variant Image"}
          </Label>
          <div className="mt-1">
            <VariantImageUploader
              brandId={brandId}
              imageUrl={row.image_url}
              onChange={(url) => setRow({ ...row, image_url: url || "" })}
              isAr={isAr}
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
        <Button
          type="button"
          variant="ghost"
          className="h-8 rounded-lg text-xs font-bold touch-manipulation"
          onClick={(e) => {
            e.preventDefault();
            onCancel();
          }}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          className="h-8 rounded-lg text-xs font-bold touch-manipulation"
          onClick={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
