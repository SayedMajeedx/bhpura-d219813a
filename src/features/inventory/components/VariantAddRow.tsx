import { Barcode, Wand as Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import type { Product, VariantViewMode } from "@/features/inventory/types";
import type { VariantRowAxes } from "@/features/inventory/hooks/use-inventory-axis-defaults";
import { SIZE_UNITS, SIZE_UNIT_LABELS } from "@/features/inventory/lib/size-units";
import { stockLabels } from "@/features/inventory/lib/stock-labels";
import { makeInStoreBarcode, type VariantDraft } from "@/features/inventory/lib/variant-draft";
import { VariantImageUploader } from "@/features/inventory/components/VariantImageUploader";

/** Desktop table row for a new variant, matching the variant row's columns. */
export function VariantAddRow({
  row,
  setRow,
  axes,
  product,
  brandId,
  viewMode,
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
  viewMode: VariantViewMode;
}) {
  const t = useT();
  const { barcodeLabel } = stockLabels(isAr);
  const {
    size: sizeAxis,
    color: colorAxis,
    fabric: fabricAxis,
    four: fourAxis,
    five: fiveAxis,
  } = axes;

  return (
    <tr className="border-t border-border bg-secondary/30 animate-in fade-in duration-150">
      <td className="w-10 px-2 py-3 text-center align-middle"></td>

      {/* Variant & Identity (Col 2) */}
      <td className="px-3 py-3 align-middle text-start">
        <div className="flex items-start gap-2.5">
          <div className="shrink-0 pt-0.5">
            <VariantImageUploader
              brandId={brandId}
              imageUrl={row.image_url}
              onChange={(url) => setRow({ ...row, image_url: url || "" })}
              isAr={isAr}
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            {/* Attributes Inputs */}
            {(sizeAxis.visible || colorAxis.visible) && (
              <div
                className={`grid gap-1.5 ${
                  sizeAxis.visible && colorAxis.visible ? "grid-cols-2" : "grid-cols-1"
                }`}
              >
                {sizeAxis.visible && (
                  <div className="flex gap-1 min-w-0">
                    <Input
                      className="h-8 flex-1 min-w-[70px] text-start text-xs font-semibold"
                      value={row.size}
                      onChange={(e) => setRow({ ...row, size: e.target.value })}
                      placeholder={sizeAxis.label}
                    />
                    <select
                      className="h-8 w-20 shrink-0 rounded-md border border-input bg-background px-1 text-xs outline-none"
                      value={row.size_unit}
                      onChange={(e) => setRow({ ...row, size_unit: e.target.value })}
                      title={isAr ? `وحدة ${sizeAxis.label}` : `${sizeAxis.label} unit`}
                    >
                      {SIZE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {isAr
                            ? SIZE_UNIT_LABELS[u]?.ar || u
                            : SIZE_UNIT_LABELS[u]?.en || (u === "" ? "—" : u)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {colorAxis.visible && (
                  <Input
                    className="h-8 w-full min-w-[90px] text-xs font-semibold"
                    value={row.color}
                    onChange={(e) => setRow({ ...row, color: e.target.value })}
                    placeholder={colorAxis.label}
                  />
                )}
              </div>
            )}
            {(fabricAxis.visible || fourAxis.visible || fiveAxis.visible) && (
              <div className="grid grid-cols-2 gap-1.5">
                {fabricAxis.visible && (
                  <Input
                    className="h-8 w-full min-w-0 text-xs font-semibold"
                    value={row.fabric}
                    onChange={(e) => setRow({ ...row, fabric: e.target.value })}
                    placeholder={fabricAxis.label}
                  />
                )}
                {fourAxis.visible && (
                  <Input
                    className="h-8 w-full min-w-0 text-xs font-semibold"
                    value={row.option_four}
                    onChange={(e) => setRow({ ...row, option_four: e.target.value })}
                    placeholder={fourAxis.label}
                  />
                )}
                {fiveAxis.visible && (
                  <Input
                    className="h-8 w-full min-w-0 text-xs font-semibold"
                    value={row.option_five}
                    onChange={(e) => setRow({ ...row, option_five: e.target.value })}
                    placeholder={fiveAxis.label}
                  />
                )}
              </div>
            )}

            {/* SKU & Barcode directly under attributes if in full matrix or barcodes mode */}
            {(viewMode === "full" || viewMode === "barcodes") && (
              <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-border-subtle flex-wrap">
                <div className="flex items-center gap-1 bg-background rounded-lg px-2 py-0.5 border border-border">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight">
                    {t("inventory.sku")}:
                  </span>
                  <input
                    className="h-6 w-24 bg-transparent font-mono text-xs font-semibold outline-none focus:text-primary placeholder:text-muted-foreground"
                    value={row.sku}
                    onChange={(e) => setRow({ ...row, sku: e.target.value })}
                    placeholder={isAr ? "كود المنتج" : "SKU"}
                  />
                </div>
                <div className="flex items-center gap-1 bg-background rounded-lg px-2 py-0.5 border border-border">
                  <Barcode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-bold text-muted-foreground shrink-0">
                    {barcodeLabel}:
                  </span>
                  <input
                    className="h-6 w-28 bg-transparent font-mono text-xs font-semibold outline-none focus:text-primary placeholder:text-muted-foreground"
                    value={row.barcode}
                    onChange={(e) => setRow({ ...row, barcode: e.target.value })}
                    placeholder={isAr ? "بدون باركود" : "None"}
                  />
                  <button
                    type="button"
                    title={isAr ? "توليد باركود تلقائياً" : "Generate barcode"}
                    className="h-5.5 w-5.5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors active:scale-95 shadow-2xs shrink-0"
                    onClick={(e) => {
                      e.preventDefault();
                      setRow({ ...row, barcode: makeInStoreBarcode() });
                    }}
                  >
                    <Wand2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Selling & Cost Price (Col 3) */}
      <td className="w-48 px-2 py-3 text-center align-middle">
        <div className="flex flex-col items-center gap-1">
          <div className="relative inline-flex items-center w-full max-w-[130px]">
            <Input
              className="h-8 w-full ps-2 pe-7 text-center text-xs font-bold"
              type="number"
              step="0.001"
              value={row.selling_price}
              placeholder={String(product?.base_price ?? "0.000")}
              onChange={(e) => setRow({ ...row, selling_price: e.target.value })}
            />
            <span className="absolute end-2 text-xs font-black text-muted-foreground pointer-events-none uppercase">
              BHD
            </span>
          </div>
          {viewMode === "full" && canViewFinancials ? (
            <div className="flex items-center justify-center gap-1 mt-1 pt-1 border-t border-border-subtle w-full">
              <span className="text-xs font-bold text-muted-foreground shrink-0">
                {isAr ? "التكلفة:" : "Cost:"}
              </span>
              <div className="relative inline-flex items-center w-22 shrink-0">
                <Input
                  type="number"
                  step="0.001"
                  className="h-7 w-full ps-1 pe-5.5 text-center text-xs font-bold font-mono"
                  value={row.cost_price}
                  onChange={(e) => setRow({ ...row, cost_price: e.target.value })}
                  placeholder="0.000"
                />
                <span className="absolute end-1 text-xs font-black text-muted-foreground pointer-events-none">
                  BHD
                </span>
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {isAr ? "الأساسي" : "Base"}: {product?.base_price ?? "0.000"}
            </span>
          )}
        </div>
      </td>

      {/* Stock & Distribution (Col 4) */}
      <td className="w-56 px-2 py-3 text-center align-middle">
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight shrink-0">
              {isAr ? "المحل:" : "Store:"}
            </span>
            <Input
              className="h-8 w-22 text-center text-xs font-bold font-mono"
              type="number"
              value={row.stock_main}
              onChange={(e) => setRow({ ...row, stock_main: e.target.value })}
              placeholder="0"
            />
          </div>
          {viewMode === "full" ? (
            <div className="flex items-center justify-center gap-1.5 mt-1 pt-1 border-t border-border-subtle w-full">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight shrink-0">
                {isAr ? "حاضنة:" : "Inc:"}
              </span>
              <Input
                type="number"
                className="h-7 w-22 text-center text-xs font-bold font-mono"
                value={row.stock_incubator}
                onChange={(e) => setRow({ ...row, stock_incubator: e.target.value })}
                placeholder="0"
              />
            </div>
          ) : row.stock_incubator ? (
            <span className="text-xs text-muted-foreground font-semibold">
              {isAr ? "حاضنة:" : "Inc:"} {row.stock_incubator}
            </span>
          ) : null}
        </div>
      </td>

      {/* Actions (Col 5) */}
      <td className="w-20 px-2 py-3 text-center align-middle">
        <div className="flex justify-center items-center gap-1">
          <Button
            type="button"
            size="sm"
            className="h-8 px-2.5 rounded-lg text-xs font-bold"
            onClick={(e) => {
              e.preventDefault();
              onSave();
            }}
          >
            {t("common.save")}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-xs"
            onClick={(e) => {
              e.preventDefault();
              onCancel();
            }}
            aria-label={isAr ? "إغلاق" : "Close"}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
