import { Barcode, History, TableProperties, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product, VariantViewMode } from "@/features/inventory/types";
import { ManageProductAxesDialog } from "@/features/inventory/components/ManageProductAxesDialog";

/** Column presets for the desktop variants table, plus history and axis settings. */
export function VariantViewModeBar({
  viewMode,
  setViewMode,
  variantCount,
  productId,
  product,
  onChanged,
  onOpenHistory,
  isAr,
}: {
  viewMode: VariantViewMode;
  setViewMode: (mode: VariantViewMode) => void;
  variantCount: number;
  productId: string;
  product?: Product;
  onChanged: () => void;
  onOpenHistory: () => void;
  isAr: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-2 bg-muted/30 border-b border-border-subtle">
      <div className="flex items-center gap-1.5 bg-background/80 p-1 rounded-xl border border-border-subtle shadow-2xs">
        <button
          type="button"
          onClick={() => setViewMode("quick")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            viewMode === "quick"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Zap className="h-3.5 w-3.5" />
          <span>{isAr ? "الأسعار والمخزون السريع" : "Quick Stock & Prices"}</span>
          <span className="text-xs font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 ms-1">
            {isAr ? "مدمج" : "Compact"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode("barcodes")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            viewMode === "barcodes"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Barcode className="h-3.5 w-3.5" />
          <span>{isAr ? "الباركود و SKU" : "Barcodes & SKUs"}</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode("full")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            viewMode === "full"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <TableProperties className="h-3.5 w-3.5" />
          <span>{isAr ? "المصفوفة الكاملة" : "Full Matrix"}</span>
          <span className="text-xs font-black uppercase px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 ms-1">
            {isAr ? "بدون تمرير" : "Zero Scroll"}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2 px-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs font-bold gap-1.5 rounded-md"
          onClick={onOpenHistory}
          title={
            isAr
              ? "عرض سجل حركات المخزون لهذا المنتج"
              : "View inventory movements history for this product"
          }
        >
          <History className="h-3.5 w-3.5 text-primary" />
          <span>{isAr ? "سجل الحركات" : "History"}</span>
        </Button>
        <ManageProductAxesDialog productId={productId} product={product} onChanged={onChanged} />
        <div className="text-xs font-bold text-muted-foreground">
          {variantCount} {isAr ? "متغيرات" : "variants"}
        </div>
      </div>
    </div>
  );
}
