import { useEffect, useMemo, useState } from "react";
import {
  filterDrafts,
  reviewCounts,
  viewDrafts,
  type FilterTab,
  type SortMode,
} from "@/features/instagram-import/lib/review-view";
import type { MergeableDraft } from "@/features/instagram-import/lib/merge-drafts";

/** What the review shows: the tab, the search words and the order, applied to the drafts. */
export function useReviewView(drafts: MergeableDraft[]) {
  const [tab, setTab] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("feed");

  const counts = useMemo(() => reviewCounts(drafts), [drafts]);
  const readyDrafts = useMemo(() => filterDrafts(drafts, "ready"), [drafts]);
  const visible = useMemo(
    () => viewDrafts(drafts, { tab, query, sort }),
    [drafts, tab, query, sort],
  );

  // A tab that has nothing left (the last sold-out post was removed) goes back to all.
  useEffect(() => {
    if (
      (tab === "image_failed" && counts.imageFailed === 0) ||
      (tab === "sold_out" && counts.soldOut === 0)
    ) {
      setTab("all");
    }
  }, [tab, counts.imageFailed, counts.soldOut]);

  return { tab, setTab, query, setQuery, sort, setSort, counts, readyDrafts, visible };
}
