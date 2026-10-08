import { useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Above the review cards: merge every N posts in a row into one product (a store that posts one
 * product as three photos in a row), or merge the posts ticked on the cards.
 */
export function MergeToolbar({
  isAr,
  selectedCount,
  onGroup,
  onMerge,
  onClear,
}: {
  isAr: boolean;
  selectedCount: number;
  onGroup: (size: number) => void;
  onMerge: () => void;
  onClear: () => void;
}) {
  const [size, setSize] = useState(3);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex items-center gap-2 text-xs font-bold text-foreground">
        <Layers className="h-4 w-4 text-primary" />
        {isAr ? "كل منتج في عدة منشورات؟" : "One product in several posts?"}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{isAr ? "ادمج كل" : "Merge every"}</span>
        <Input
          type="number"
          min={2}
          max={10}
          value={size}
          aria-label={isAr ? "عدد المنشورات لكل منتج" : "Posts per product"}
          onChange={(event) =>
            setSize(Math.min(10, Math.max(2, parseInt(event.target.value, 10) || 2)))
          }
          className="h-8 w-16 rounded-lg text-center font-mono text-xs font-bold"
        />
        <span className="text-xs text-muted-foreground">
          {isAr ? "منشورات متتالية في منتج" : "posts in a row into a product"}
        </span>
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-lg text-xs font-bold"
          onClick={() => onGroup(size)}
        >
          {isAr ? "دمج" : "Merge"}
        </Button>
      </div>
      <div className="flex items-center gap-2 sm:ms-auto">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selectedCount < 2}
          className="h-8 rounded-lg text-xs font-bold"
          onClick={onMerge}
        >
          {isAr ? `دمج المحدد (${selectedCount})` : `Merge selected (${selectedCount})`}
        </Button>
        {selectedCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 rounded-lg text-xs"
            onClick={onClear}
          >
            {isAr ? "إلغاء التحديد" : "Clear"}
          </Button>
        )}
      </div>
    </div>
  );
}
