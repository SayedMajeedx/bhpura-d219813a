import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  contentDraftsQueries,
  createContentDraft,
  deleteContentDraft,
  invalidateContentDrafts,
  updateContentDraft,
  type ContentDraft,
  type ContentDraftValues,
} from "@/lib/data/content-drafts";

/**
 * The brand's saved drafts: save the studio's design (as a new draft, or over
 * the one that is open), reopen one, or delete it. `snapshot` reads the
 * studio; `apply` puts a draft back into it.
 */
export function useDrafts({
  brandId,
  isAr,
  snapshot,
  apply,
}: {
  brandId: string;
  isAr: boolean;
  snapshot: (name: string) => ContentDraftValues;
  apply: (draft: ContentDraft) => void;
}) {
  const qc = useQueryClient();
  const draftsQ = useQuery(contentDraftsQueries.list(brandId));
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [openDraftId, setOpenDraftId] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const openDraft = draftsQ.data?.find((draft) => draft.id === openDraftId) ?? null;

  const saveDraft = async (name: string, asNew: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setDraftBusy(true);
    try {
      const values = snapshot(trimmed);
      if (openDraft && !asNew) {
        await updateContentDraft(brandId, openDraft.id, values);
      } else {
        setOpenDraftId(await createContentDraft(brandId, values));
      }
      await invalidateContentDrafts(qc, brandId);
      toast.success(isAr ? "تم حفظ المسودة" : "Draft saved");
    } catch (error) {
      console.error("Saving the draft failed", error);
      toast.error(isAr ? "تعذر حفظ المسودة" : "Could not save the draft");
    } finally {
      setDraftBusy(false);
    }
  };

  const reopenDraft = (draft: ContentDraft) => {
    apply(draft);
    setOpenDraftId(draft.id);
    setDraftsOpen(false);
    toast.success(isAr ? `تم فتح «${draft.name}»` : `Opened “${draft.name}”`);
  };

  const removeDraft = async (draft: ContentDraft) => {
    setDraftBusy(true);
    try {
      await deleteContentDraft(brandId, draft.id);
      if (draft.id === openDraftId) setOpenDraftId(null);
      await invalidateContentDrafts(qc, brandId);
      toast.success(isAr ? "تم حذف المسودة" : "Draft deleted");
    } catch (error) {
      console.error("Deleting the draft failed", error);
      toast.error(isAr ? "تعذر حذف المسودة" : "Could not delete the draft");
    } finally {
      setDraftBusy(false);
    }
  };

  return {
    draftsQ,
    draftsOpen,
    setDraftsOpen,
    openDraft,
    draftBusy,
    saveDraft,
    reopenDraft,
    removeDraft,
  };
}
