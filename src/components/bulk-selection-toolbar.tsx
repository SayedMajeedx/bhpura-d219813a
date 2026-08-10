import { CheckSquare, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type BulkSelectionToolbarProps = {
  lang: "en" | "ar";
  entityAr: string;
  entityEn: string;
  selectedCount: number;
  allFilteredSelected: boolean;
  disabled?: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDeleteSelected: () => void;
};

export function BulkSelectionToolbar({
  lang,
  entityAr,
  entityEn,
  selectedCount,
  allFilteredSelected,
  disabled,
  onSelectAll,
  onDeselectAll,
  onDeleteSelected,
}: BulkSelectionToolbarProps) {
  const isAr = lang === "ar";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-2xs">
      <div className="inline-flex items-center gap-2 text-xs font-bold text-foreground">
        <CheckSquare className="h-4 w-4 text-primary" />
        <span>
          {selectedCount} {isAr ? `${entityAr} محدد` : `${entityEn} selected`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || allFilteredSelected}
          onClick={onSelectAll}
          className="h-9 gap-1.5 text-xs"
        >
          <CheckSquare className="h-4 w-4" />
          {isAr ? "تحديد الكل" : "Select all"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || selectedCount === 0}
          onClick={onDeselectAll}
          className="h-9 gap-1.5 text-xs"
        >
          <Square className="h-4 w-4" />
          {isAr ? "إلغاء تحديد الكل" : "Deselect all"}
        </Button>
        {selectedCount > 0 && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={disabled}
            onClick={onDeleteSelected}
            className="h-9 gap-1.5 text-xs"
          >
            <Trash2 className="h-4 w-4" />
            {isAr ? `حذف المحدد (${selectedCount})` : `Delete selected (${selectedCount})`}
          </Button>
        )}
      </div>
    </div>
  );
}
