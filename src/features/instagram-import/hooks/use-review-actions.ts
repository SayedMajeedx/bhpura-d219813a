import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  bulkSetField,
  moveDraftImage,
  removeDrafts,
  restoreDrafts,
} from "@/features/instagram-import/lib/review-view";
import type { MergeableDraft } from "@/features/instagram-import/lib/merge-drafts";

/**
 * The review's bulk actions: set the category, sizes or price of the ticked drafts at once, remove
 * drafts (the ticked ones, or every sold-out one) with an Undo, and reorder a draft's pictures.
 */
export function useReviewActions({
  drafts,
  setDrafts,
  selected,
  clearSelection,
  isAr,
}: {
  drafts: MergeableDraft[];
  setDrafts: Dispatch<SetStateAction<MergeableDraft[]>>;
  selected: ReadonlySet<string>;
  clearSelection: () => void;
  isAr: boolean;
}) {
  const setForSelected = useCallback(
    (field: "category" | "sizes" | "price", value: unknown) => {
      if (selected.size === 0) return;
      setDrafts((current) => bulkSetField(current, selected, field, value));
      toast.success(
        isAr ? `تم التعديل على ${selected.size} منتج.` : `Updated ${selected.size} products.`,
      );
    },
    [selected, setDrafts, isAr],
  );

  const remove = useCallback(
    (ids: ReadonlySet<string>) => {
      if (ids.size === 0) return;
      // Remember where each one was, so Undo puts it back in its place even after other edits.
      const removed = drafts.flatMap((draft, index) =>
        ids.has(draft.id) ? [{ draft, index }] : [],
      );
      setDrafts((current) => removeDrafts(current, ids));
      clearSelection();
      toast(
        isAr
          ? `تمت إزالة ${removed.length} من المراجعة.`
          : `Removed ${removed.length} from the review.`,
        {
          duration: 10_000,
          action: {
            label: isAr ? "تراجع" : "Undo",
            onClick: () => setDrafts((current) => restoreDrafts(current, removed)),
          },
        },
      );
    },
    [drafts, setDrafts, clearSelection, isAr],
  );

  const removeSelected = useCallback(() => remove(selected), [remove, selected]);
  const removeSoldOut = useCallback(
    () => remove(new Set(drafts.filter((draft) => draft.isSoldOut).map((draft) => draft.id))),
    [remove, drafts],
  );
  const moveImage = useCallback(
    (id: string, from: number, to: number) =>
      setDrafts((current) => moveDraftImage(current, id, from, to)),
    [setDrafts],
  );

  return { setForSelected, removeSelected, removeSoldOut, moveImage };
}
