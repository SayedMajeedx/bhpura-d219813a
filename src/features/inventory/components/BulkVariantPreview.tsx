import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BulkVariantRow } from "@/features/inventory/types";

/** Batch-fill inputs; the dialog owns their values so they survive regenerating rows. */
export type BulkBatchControls = {
  mainStock: string;
  setMainStock: (value: string) => void;
  applyMainStock: () => void;
  incubatorStock: string;
  setIncubatorStock: (value: string) => void;
  applyIncubatorStock: () => void;
  salePrice: string;
  setSalePrice: (value: string) => void;
  applySalePrice: () => void;
};

/** Editable preview of generated variants, with apply-to-all stock and sale price. */
export function BulkVariantPreview({
  rows,
  onPatchRow,
  onRemoveRow,
  batch,
  axisLabels,
  basePricePlaceholder,
  canViewFinancials,
  isAr,
}: {
  rows: BulkVariantRow[];
  onPatchRow: (index: number, patch: Partial<BulkVariantRow>) => void;
  onRemoveRow: (index: number) => void;
  batch: BulkBatchControls;
  axisLabels: { size: string; color: string; fabric: string };
  basePricePlaceholder: string;
  canViewFinancials: boolean;
  isAr: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="font-semibold">
          {isAr
            ? `معاينة ${rows.length} متغير جاهز للحفظ`
            : `Preview ${rows.length} variants ready to save`}
        </Label>
        <span className="text-xs text-muted-foreground">
          {isAr
            ? "تم توليد رموز SKU وباركود EAN-13 متوافقة مع الطابعات"
            : "Generated printer-safe SKUs and unique EAN-13 barcodes"}
        </span>
      </div>

      {/* BATCH QUICK FILL TOOLBAR */}
      <div className="rounded-md border bg-muted/40 p-2.5 flex items-center gap-4 flex-wrap text-xs">
        <span className="font-semibold text-muted-foreground">
          {isAr ? "تعديل جماعي:" : "Batch edit:"}
        </span>
        <div className="flex items-center gap-1.5">
          <span>{isAr ? "مخزون المحل:" : "Store stock:"}</span>
          <Input
            className="h-7 w-16 text-xs"
            type="number"
            min="0"
            placeholder="0"
            value={batch.mainStock}
            onChange={(e) => batch.setMainStock(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={batch.applyMainStock}
          >
            {isAr ? "تطبيق للكل" : "Apply all"}
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <span>{isAr ? "الحاضنة:" : "Incubator:"}</span>
          <Input
            className="h-7 w-16 text-xs"
            type="number"
            min="0"
            placeholder="0"
            value={batch.incubatorStock}
            onChange={(e) => batch.setIncubatorStock(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={batch.applyIncubatorStock}
          >
            {isAr ? "تطبيق للكل" : "Apply all"}
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <span>{isAr ? "التخفيض:" : "Sale:"}</span>
          <Input
            className="h-7 w-20 text-xs"
            type="number"
            min="0"
            step="0.01"
            placeholder={basePricePlaceholder}
            value={batch.salePrice}
            onChange={(e) => batch.setSalePrice(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={batch.applySalePrice}
          >
            {isAr ? "تطبيق للكل" : "Apply all"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-secondary">
            <tr>
              {[
                axisLabels.size,
                axisLabels.color,
                axisLabels.fabric,
                "SKU",
                isAr ? "الباركود (EAN-13)" : "Barcode (EAN-13)",
                ...(canViewFinancials ? [isAr ? "التكلفة" : "Cost"] : []),
                isAr ? "السعر اللي يدفعه العميل" : "Customer price",
                isAr ? "مخزون المحل" : "Store Stock",
                isAr ? "مخزون الحاضنة" : "Incubator Stock",
                "",
              ].map((label) => (
                <th key={label} className="p-2 text-start font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${index}-${row.barcode}`} className="border-t hover:bg-muted/30">
                {(["size", "color", "fabric", "sku", "barcode"] as const).map((field) => (
                  <td key={field} className="p-1">
                    <Input
                      className="h-8 min-w-24"
                      value={row[field]}
                      onChange={(e) => onPatchRow(index, { [field]: e.target.value })}
                    />
                  </td>
                ))}
                {canViewFinancials && (
                  <td className="p-1">
                    <Input
                      className="h-8 w-24 bg-muted/50 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.cost_price}
                      disabled
                    />
                  </td>
                )}
                <td className="p-1">
                  <Input
                    className="h-8 w-24"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={basePricePlaceholder}
                    value={row.sale_price}
                    onChange={(e) => onPatchRow(index, { sale_price: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <Input
                    className="h-8 w-20"
                    type="number"
                    min="0"
                    value={row.stock_main}
                    onChange={(e) => onPatchRow(index, { stock_main: Number(e.target.value) })}
                  />
                </td>
                <td className="p-1">
                  <Input
                    className="h-8 w-20"
                    type="number"
                    min="0"
                    value={row.stock_incubator}
                    onChange={(e) => onPatchRow(index, { stock_incubator: Number(e.target.value) })}
                  />
                </td>
                <td className="p-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => onRemoveRow(index)}
                    aria-label={isAr ? "حذف" : "Delete"}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
