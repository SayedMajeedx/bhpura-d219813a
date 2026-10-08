import { AlertTriangle, Check, CheckCircle2, Search, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BulkEditBar } from "./BulkEditBar";
import { MergeToolbar } from "./MergeToolbar";
import type { useDraftMerge } from "@/features/instagram-import/hooks/use-draft-merge";
import type { useReviewActions } from "@/features/instagram-import/hooks/use-review-actions";
import type { useReviewView } from "@/features/instagram-import/hooks/use-review-view";
import type { MergeableDraft } from "@/features/instagram-import/lib/merge-drafts";
import type { SortMode } from "@/features/instagram-import/lib/review-view";

const SORTS: Array<{ mode: SortMode; ar: string; en: string }> = [
  { mode: "feed", ar: "ترتيب الحساب", en: "Feed order" },
  { mode: "needs_review", ar: "الناقص أولاً", en: "Needs review first" },
  { mode: "price_asc", ar: "السعر: الأقل أولاً", en: "Price: low to high" },
  { mode: "price_desc", ar: "السعر: الأعلى أولاً", en: "Price: high to low" },
  { mode: "name", ar: "الاسم", en: "Name" },
];

/**
 * The top of the review: the tabs, search and sort, approving the ready ones, the merge tools, and
 * (when posts are ticked) editing them together or taking them out.
 */
export function ReviewHeader({
  isAr,
  drafts,
  view,
  merge,
  actions,
  onApprove,
}: {
  isAr: boolean;
  drafts: MergeableDraft[];
  view: ReturnType<typeof useReviewView>;
  merge: ReturnType<typeof useDraftMerge>;
  actions: ReturnType<typeof useReviewActions>;
  onApprove: () => void;
}) {
  const { counts, tab, setTab } = view;
  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 flex flex-col gap-3 border-b border-border bg-card/95 pb-3 backdrop-blur-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant={tab === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("all")}
              className="h-8 rounded-lg text-xs font-bold"
            >
              {isAr ? "الكل" : "All"} ({counts.all})
            </Button>
            <Button
              type="button"
              variant={tab === "ready" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("ready")}
              className={cn(
                "h-8 gap-1.5 rounded-lg text-xs font-bold",
                tab !== "ready" && "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10",
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isAr ? "جاهز للاعتماد" : "Ready"} ({counts.ready})
            </Button>
            <Button
              type="button"
              variant={tab === "needs_review" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("needs_review")}
              className={cn(
                "h-8 gap-1.5 rounded-lg text-xs font-bold",
                tab !== "needs_review" &&
                  "border-amber-500/30 text-amber-600 hover:bg-amber-500/10",
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {isAr ? "يحتاج مراجعة" : "Needs Review"} ({counts.needsReview})
            </Button>
            {counts.imageFailed > 0 && (
              <Button
                type="button"
                variant={tab === "image_failed" ? "destructive" : "outline"}
                size="sm"
                onClick={() => setTab("image_failed")}
                className="h-8 gap-1.5 rounded-lg text-xs font-bold"
              >
                <XCircle className="h-3.5 w-3.5" />
                {isAr ? "فشل تحميل الصور" : "Image Failed"} ({counts.imageFailed})
              </Button>
            )}
            {counts.soldOut > 0 && (
              <Button
                type="button"
                variant={tab === "sold_out" ? "default" : "outline"}
                size="sm"
                onClick={() => setTab("sold_out")}
                className="h-8 rounded-lg text-xs font-bold"
              >
                {isAr ? "مباع" : "Sold out"} ({counts.soldOut})
              </Button>
            )}
          </div>

          <Button
            type="button"
            onClick={onApprove}
            disabled={counts.ready === 0}
            className="h-8 gap-2 rounded-lg px-4 text-xs font-bold shadow-sm"
            title={
              counts.ready === 0
                ? isAr
                  ? "لا يمكن الاعتماد الجماعي قبل استكمال الحقول الإلزامية والأسعار"
                  : "Bulk approval requires all products to have valid prices and high confidence"
                : undefined
            }
          >
            <Check className="h-4 w-4" />
            {isAr ? `اعتماد المنتجات الجاهزة (${counts.ready})` : `Approve Ready (${counts.ready})`}
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={view.query}
              onChange={(event) => view.setQuery(event.target.value)}
              placeholder={
                isAr
                  ? "ابحث في الاسم أو الوصف أو التصنيف..."
                  : "Search names, captions, categories..."
              }
              aria-label={isAr ? "بحث في المسودات" : "Search drafts"}
              className="h-8 rounded-lg ps-8 text-xs"
            />
          </div>
          <select
            value={view.sort}
            onChange={(event) => view.setSort(event.target.value as SortMode)}
            aria-label={isAr ? "ترتيب المسودات" : "Sort drafts"}
            className="h-8 rounded-lg border border-input bg-background px-2 text-xs font-medium text-foreground"
          >
            {SORTS.map((sort) => (
              <option key={sort.mode} value={sort.mode}>
                {isAr ? sort.ar : sort.en}
              </option>
            ))}
          </select>
          {counts.soldOut > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={actions.removeSoldOut}
              className="h-8 gap-1.5 rounded-lg text-xs font-bold"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isAr ? `إزالة المباع (${counts.soldOut})` : `Remove sold out (${counts.soldOut})`}
            </Button>
          )}
        </div>
      </div>

      <MergeToolbar
        isAr={isAr}
        drafts={drafts}
        selectedCount={merge.selected.size}
        onGroup={merge.groupBy}
        onApplyGroups={merge.applyGroups}
        onMerge={merge.mergeSelected}
        onClear={merge.clear}
      />

      {merge.selected.size > 0 && (
        <BulkEditBar
          isAr={isAr}
          count={merge.selected.size}
          onCategory={(category) => actions.setForSelected("category", category)}
          onSizes={(sizes) => actions.setForSelected("sizes", sizes)}
          onPrice={(price) => actions.setForSelected("price", price)}
          onRemove={actions.removeSelected}
        />
      )}
    </div>
  );
}
