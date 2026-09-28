import { useEffect, useRef, useState } from "react";
import { extractSnappySnippet, type Product } from "@/features/content-studio/lib/studio-content";

/**
 * The edition label, headline and body, refilled from the product when the
 * merchant picks another one (or switches language).
 */
export function useStudioCopy({
  selected,
  isAr,
  brandNameEn,
  defaultEditionLabel,
}: {
  selected: Product | undefined;
  isAr: boolean;
  brandNameEn: string;
  defaultEditionLabel: string;
}) {
  const [editionLabel, setEditionLabel] = useState(() => defaultEditionLabel);
  const [headline, setHeadline] = useState("صُممت لتبقى في الذاكرة");
  const [body, setBody] = useState("أناقة هادئة، وتفاصيل مدروسة لكل لحظة.");
  // Set when a draft brings its own copy along with a new product, so the
  // product's refill below does not overwrite it.
  const keepRestoredCopy = useRef(false);

  useEffect(() => {
    setEditionLabel((prev) => {
      if (
        !prev ||
        prev === "The Pura Edit" ||
        (prev.startsWith("The ") && prev.endsWith(" Edit"))
      ) {
        return `The ${brandNameEn} Edit`;
      }
      return prev;
    });
  }, [brandNameEn]);

  useEffect(() => {
    if (!selected) return;
    if (keepRestoredCopy.current) {
      keepRestoredCopy.current = false;
      return;
    }
    const name = isAr ? selected.name_ar || selected.name : selected.name_en || selected.name;
    if (name) {
      setHeadline(name);
    }
    const rawDesc = isAr
      ? selected.description_ar || selected.description
      : selected.description || selected.description_ar;
    const autoBody = extractSnappySnippet(
      rawDesc,
      isAr
        ? "أناقة هادئة، وتفاصيل مدروسة لكل لحظة."
        : "Quiet elegance, thoughtful details for every moment.",
    );
    setBody(autoBody);
    // Intentionally omitted `selected`: headline and body snippets should only initialize when switching products (by id) or language, without overwriting merchant manual edits on every product object change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, isAr]);

  /** Puts a draft's copy back. `productChanges`: the draft also picks another product. */
  const restoreCopy = (
    copy: { editionLabel: string; headline: string; body: string },
    productChanges: boolean,
  ) => {
    keepRestoredCopy.current = productChanges;
    if (copy.editionLabel) setEditionLabel(copy.editionLabel);
    setHeadline(copy.headline);
    setBody(copy.body);
  };

  return {
    restoreCopy,
    editionLabel,
    setEditionLabel,
    headline,
    setHeadline,
    body,
    setBody,
  };
}
