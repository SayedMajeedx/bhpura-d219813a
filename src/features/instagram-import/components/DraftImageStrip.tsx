import { Check, ChevronLeft, ChevronRight, Layers, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MergeableDraft } from "@/features/instagram-import/lib/merge-drafts";

/**
 * A draft's pictures in a row: tick which to keep, choose the cover, and put them in order (the
 * order is the order on the product page; the cover always comes first there).
 */
export function DraftImageStrip({
  draft,
  isAr,
  onToggle,
  onCover,
  onSelectAll,
  onMove,
}: {
  draft: MergeableDraft;
  isAr: boolean;
  onToggle: (index: number) => void;
  onCover: (index: number) => void;
  onSelectAll: (selectAll: boolean) => void;
  onMove: (from: number, to: number) => void;
}) {
  const selectedCount = draft.images.filter((image) => image.selected !== false).length;
  const last = draft.images.length - 1;

  return (
    <div className="flex flex-col border-b border-border bg-muted/20">
      <div className="flex items-center justify-between border-b border-border-subtle bg-muted/40 px-2.5 py-1.5 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span>
            {isAr
              ? `${selectedCount} من ${draft.images.length} صور محددة`
              : `${selectedCount} of ${draft.images.length} selected`}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 cursor-pointer px-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onSelectAll(selectedCount < draft.images.length)}
        >
          {selectedCount === draft.images.length
            ? isAr
              ? "إلغاء التحديد"
              : "Deselect All"
            : isAr
              ? "تحديد الكل"
              : "Select All"}
        </Button>
      </div>

      <div className="scrollbar-thin flex items-center gap-2 overflow-x-auto p-2">
        {draft.images.map((image, index) => {
          const isSelected = image.selected !== false;
          const isCover = image.isCover;
          return (
            <div
              key={image.url}
              className={cn(
                "group/thumb relative h-16 w-16 shrink-0 select-none overflow-hidden rounded-lg border-2 transition-all",
                isCover
                  ? "border-primary shadow-xs ring-2 ring-primary/40"
                  : isSelected
                    ? "border-primary/60 hover:border-primary"
                    : "border-border opacity-40 grayscale hover:opacity-80 hover:grayscale-0",
              )}
            >
              <button
                type="button"
                onClick={() => (isSelected ? onCover(index) : onToggle(index))}
                className="h-full w-full cursor-pointer focus:outline-hidden"
                title={
                  isCover
                    ? isAr
                      ? "الغلاف الرئيسي الحالي"
                      : "Main Cover Photo"
                    : isSelected
                      ? isAr
                        ? "انقر لتعيينه كغلاف رئيسي"
                        : "Click to set as main cover"
                      : isAr
                        ? "انقر لتضمين الصورة وحفظها"
                        : "Click to include photo"
                }
              >
                <img
                  src={image.r2Url || image.url}
                  alt={`thumb-${index}`}
                  className="h-full w-full object-cover"
                />
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(index);
                }}
                className={cn(
                  "absolute start-1 top-1 flex h-4 w-4 cursor-pointer items-center justify-center rounded transition-transform hover:scale-110",
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "border border-white/60 bg-black/60 text-white hover:border-white",
                )}
                title={
                  isSelected
                    ? isAr
                      ? "إلغاء حفظ هذه الصورة"
                      : "Exclude this photo"
                    : isAr
                      ? "حفظ هذه الصورة مع المنتج"
                      : "Save this photo with product"
                }
              >
                {isSelected ? (
                  <Check className="h-3 w-3 stroke-[3]" />
                ) : (
                  <div className="h-2 w-2" />
                )}
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCover(index);
                }}
                className={cn(
                  "absolute end-1 top-1 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full transition-all",
                  isCover
                    ? "bg-amber-500 text-white shadow-xs"
                    : "bg-black/50 text-white/80 opacity-0 hover:bg-amber-500 hover:text-white group-hover/thumb:opacity-100",
                )}
                title={
                  isCover
                    ? isAr
                      ? "الغلاف الرئيسي"
                      : "Main Cover"
                    : isAr
                      ? "تعيين كغلاف رئيسي"
                      : "Set as main cover"
                }
              >
                <Star className={cn("h-2.5 w-2.5", isCover ? "fill-white" : "")} />
              </button>

              {/* Order: earlier / later, and the cover label between them */}
              <div className="absolute inset-x-0 bottom-0 flex h-4 items-center justify-between bg-black/55 text-white">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === 0}
                  onClick={() => onMove(index, index - 1)}
                  className="h-4 w-4 rounded-none p-0 text-white hover:bg-transparent hover:text-white disabled:opacity-30"
                  aria-label={isAr ? "قدّم الصورة" : "Move photo earlier"}
                >
                  <ChevronLeft className="h-3 w-3 rtl:rotate-180" />
                </Button>
                {isCover && (
                  <span className="pointer-events-none text-xs font-bold leading-none">
                    {isAr ? "الغلاف" : "Cover"}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === last}
                  onClick={() => onMove(index, index + 1)}
                  className="h-4 w-4 rounded-none p-0 text-white hover:bg-transparent hover:text-white disabled:opacity-30"
                  aria-label={isAr ? "أخّر الصورة" : "Move photo later"}
                >
                  <ChevronRight className="h-3 w-3 rtl:rotate-180" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
