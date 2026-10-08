import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  groupEvery,
  mergeDrafts,
  splitDraft,
  type MergeableDraft,
} from "@/features/instagram-import/lib/merge-drafts";

/**
 * The review screen's merging: which drafts are ticked, merging the ticked ones, merging every N
 * posts in a row, and splitting a merged product back into its posts.
 */
export function useDraftMerge(
  drafts: MergeableDraft[],
  setDrafts: Dispatch<SetStateAction<MergeableDraft[]>>,
  isAr: boolean,
) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  // A draft that is gone (merged away) can no longer be ticked.
  const selected = useMemo(
    () => new Set(drafts.filter((draft) => ticked.has(draft.id)).map((draft) => draft.id)),
    [drafts, ticked],
  );

  const toggle = useCallback((id: string) => {
    setTicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setTicked(new Set()), []);

  const mergeSelected = useCallback(() => {
    if (selected.size < 2) return;
    setDrafts((current) => mergeDrafts(current, selected));
    setTicked(new Set());
    toast.success(
      isAr
        ? `تم دمج ${selected.size} منشورات في منتج واحد.`
        : `Merged ${selected.size} posts into one product.`,
    );
  }, [selected, setDrafts, isAr]);

  const groupBy = useCallback(
    (size: number) => {
      const next = groupEvery(drafts, size);
      setDrafts(next);
      setTicked(new Set());
      toast.success(
        isAr
          ? `صارت ${drafts.length} منشورات ${next.length} منتجاً.`
          : `${drafts.length} posts became ${next.length} products.`,
      );
    },
    [drafts, setDrafts, isAr],
  );

  /** Merges each of these groups of posts (ids), as proposed by the smart grouping. */
  const applyGroups = useCallback(
    (groups: string[][]) => {
      if (groups.length === 0) return;
      setDrafts((current) =>
        groups.reduce((list, ids) => mergeDrafts(list, new Set(ids)), current),
      );
      setTicked(new Set());
      toast.success(isAr ? `تم دمج ${groups.length} مجموعة.` : `Merged ${groups.length} groups.`);
    },
    [setDrafts, isAr],
  );

  const split = useCallback(
    (id: string) => setDrafts((current) => splitDraft(current, id)),
    [setDrafts],
  );

  return { selected, toggle, clear, mergeSelected, groupBy, applyGroups, split };
}
