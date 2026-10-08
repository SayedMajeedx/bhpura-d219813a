import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  clearSession,
  loadSession,
  saveSession,
  type ImportSession,
} from "@/features/instagram-import/lib/session-store";
import type { MergeableDraft } from "@/features/instagram-import/lib/merge-drafts";

const SAVE_DELAY_MS = 400;

/**
 * Keeps the review in this browser while it is open, and offers it back when the importer opens
 * with nothing in progress (see lib/session-store.ts).
 */
export function useImportSession({
  brandId,
  step,
  username,
  drafts,
  setDrafts,
  setUsername,
  setStep,
}: {
  brandId: string;
  step: string;
  username: string;
  drafts: MergeableDraft[];
  setDrafts: Dispatch<SetStateAction<MergeableDraft[]>>;
  setUsername: (username: string) => void;
  setStep: (step: "review") => void;
}) {
  const [resumable, setResumable] = useState<ImportSession | null>(null);

  // On the form, look for a review left behind.
  useEffect(() => {
    if (step === "input") setResumable(loadSession(brandId));
  }, [step, brandId]);

  // In review, keep it (a moment after the last change); once saved or emptied, drop it.
  useEffect(() => {
    // Done (or nothing left): drop it. After a save, drafts that were not ready are still here: keep them.
    if (drafts.length === 0 && (step === "success" || step === "review")) {
      clearSession(brandId);
      return;
    }
    if (step !== "review" && step !== "success") return;
    // After a save the leftovers are kept at once; while editing, a moment after the last change.
    const timer = setTimeout(
      () => saveSession(brandId, { username, drafts }),
      step === "success" ? 0 : SAVE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [step, brandId, username, drafts]);

  const resume = useCallback(() => {
    if (!resumable) return;
    setDrafts(resumable.drafts);
    setUsername(resumable.username);
    setStep("review");
    setResumable(null);
  }, [resumable, setDrafts, setUsername, setStep]);

  const discard = useCallback(() => {
    clearSession(brandId);
    setResumable(null);
  }, [brandId]);

  return { resumable, resume, discard };
}
