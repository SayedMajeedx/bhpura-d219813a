import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** On a review card: tick it for merging, and for a merged product, how many posts it holds and a way to split. */
export function DraftMergeControls({
  isAr,
  selected,
  mergedCount,
  onToggle,
  onSplit,
}: {
  isAr: boolean;
  selected: boolean;
  mergedCount: number;
  onToggle: () => void;
  onSplit: () => void;
}) {
  return (
    <>
      <label className="absolute bottom-2 start-2 z-10 flex cursor-pointer items-center gap-1.5 rounded-lg bg-background/90 px-2 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur-xs">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-3.5 w-3.5 accent-primary"
        />
        {isAr ? "تحديد للدمج" : "Select to merge"}
      </label>
      {mergedCount > 1 && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onSplit}
          className="absolute bottom-2 end-2 z-10 h-auto gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold shadow-sm"
          title={isAr ? "إرجاعها منتجات منفصلة" : "Back to separate products"}
        >
          <Undo2 className="h-3.5 w-3.5" />
          {isAr
            ? `مدموج من ${mergedCount} منشورات · فصل`
            : `Merged from ${mergedCount} posts · Split`}
        </Button>
      )}
    </>
  );
}
