import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Floating actions for the selected variants. */
export function VariantBulkToolbar({
  selectedCount,
  canViewFinancials,
  isAr,
  onSetPrice,
  onAddStock,
  onApplyMarkup,
  onDelete,
  onClear,
}: {
  selectedCount: number;
  canViewFinancials: boolean;
  isAr: boolean;
  onSetPrice: () => void;
  onAddStock: (amount: number) => void;
  onApplyMarkup: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 max-w-[95vw] overflow-x-auto bg-white/85 dark:bg-black/75 backdrop-blur-2xl backdrop-saturate-200 border border-white/50 dark:border-white/15 shadow-2xl rounded-2xl py-2.5 px-4 flex items-center gap-3 z-55 animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-center gap-2 border-e border-border pe-4 shrink-0">
        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-xs text-primary-foreground font-black">
          {selectedCount}
        </div>
        <span className="text-xs font-bold text-muted-foreground">
          {isAr ? "محدد" : "selected"}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
          onClick={onSetPrice}
        >
          {isAr ? "تحديد السعر" : "Set Price"}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
          onClick={() => onAddStock(5)}
        >
          {isAr ? "مخزون 5+" : "+5 Stock"}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
          onClick={() => onAddStock(10)}
        >
          {isAr ? "مخزون 10+" : "+10 Stock"}
        </Button>
        {canViewFinancials && (
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
            onClick={onApplyMarkup}
          >
            {isAr ? "تطبيق الهامش" : "Cost Markup %"}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-8 text-xs font-bold rounded-lg px-2.5"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3 me-1" />
          {isAr ? "حذف" : "Delete"}
        </Button>
      </div>

      <button
        type="button"
        className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors ms-2"
        onClick={onClear}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
