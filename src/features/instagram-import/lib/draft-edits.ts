import type { InstagramProductDraft } from "@/lib/instagram-ai-importer";

/**
 * The review screen's edits to a draft, as plain functions of the list: the screen only decides
 * which draft and what changed, and these return the new list (so each rule can be tested).
 */

export type EditableField = "title" | "price" | "category" | "sizes" | "description";

type Drafts<T extends InstagramProductDraft> = T[];

const update = <T extends InstagramProductDraft>(
  drafts: Drafts<T>,
  id: string,
  change: (draft: T) => T,
): Drafts<T> => drafts.map((draft) => (draft.id === id ? change(draft) : draft));

const coverUrl = (
  image: InstagramProductDraft["images"][number] | null | undefined,
  fallback: string,
) => image?.r2Url || image?.url || fallback;

/** A field the merchant typed: marked as hand-written and fully trusted, its warnings cleared. */
export function editDraftField<T extends InstagramProductDraft>(
  drafts: Drafts<T>,
  id: string,
  field: EditableField,
  value: unknown,
): Drafts<T> {
  // The title is tracked as the product's "name" (the old screen recorded it under "title" in the
  // sources, a key nothing reads, so a typed name still looked machine-read).
  const tracked = field === "title" ? "name" : field;
  return update(drafts, id, (draft) => ({
    ...draft,
    [field]: value,
    fieldSources: { ...draft.fieldSources, [tracked]: "manual" as const },
    // Merchant manual review gives 100% confidence.
    fieldConfidence: { ...draft.fieldConfidence, [tracked]: 1.0 },
    priceConflict: field === "price" ? undefined : draft.priceConflict,
    issues:
      field === "price"
        ? draft.issues.filter((issue) => issue !== "missing_price" && issue !== "price_conflict")
        : draft.issues,
  }));
}

/** Makes one picture the cover (and selects it, so it is saved). */
export function setDraftCover<T extends InstagramProductDraft>(
  drafts: Drafts<T>,
  id: string,
  imageIndex: number,
): Drafts<T> {
  return update(drafts, id, (draft) => {
    const images = draft.images.map((image, index) => ({
      ...image,
      isCover: index === imageIndex,
      selected: index === imageIndex ? true : image.selected !== false,
    }));
    return { ...draft, images, coverImageUrl: coverUrl(images[imageIndex], draft.coverImageUrl) };
  });
}

/** Ticks or unticks one picture; unticking the cover hands the cover to the next ticked picture. */
export function toggleDraftImage<T extends InstagramProductDraft>(
  drafts: Drafts<T>,
  id: string,
  imageIndex: number,
): Drafts<T> {
  return update(drafts, id, (draft) => {
    const target = draft.images[imageIndex];
    if (!target) return draft;
    const nowSelected = target.selected === false;
    let images = draft.images.map((image, index) =>
      index === imageIndex ? { ...image, selected: nowSelected } : image,
    );
    if (!nowSelected && target.isCover) {
      const next = images.findIndex((image) => image.selected !== false);
      images = images.map((image, index) => ({ ...image, isCover: index === next }));
    }
    const cover =
      images.find((image) => image.isCover) ||
      images.find((image) => image.selected !== false) ||
      images[0];
    return { ...draft, images, coverImageUrl: coverUrl(cover, draft.coverImageUrl) };
  });
}

/** Ticks all of a draft's pictures, or none of them. */
export function selectAllDraftImages<T extends InstagramProductDraft>(
  drafts: Drafts<T>,
  id: string,
  selectAll: boolean,
): Drafts<T> {
  return update(drafts, id, (draft) => {
    const images = draft.images.map((image, index) => ({
      ...image,
      selected: selectAll,
      isCover: selectAll ? image.isCover || index === 0 : false,
    }));
    const cover = images.find((image) => image.isCover) || (selectAll ? images[0] : null);
    return { ...draft, images, coverImageUrl: coverUrl(cover, draft.coverImageUrl) };
  });
}

/**
 * A picture that was copied on a retry. It was left unticked only because it had failed, so it is
 * ticked now: otherwise a picture the merchant just fixed would silently stay out of the product.
 */
export function markImageRehosted<T extends InstagramProductDraft>(
  drafts: Drafts<T>,
  id: string,
  imageUrl: string,
  r2Url: string,
): Drafts<T> {
  return update(drafts, id, (draft) => {
    const images = draft.images.map((image) =>
      image.url === imageUrl
        ? { ...image, r2Url, status: "success" as const, selected: true, errorMessage: undefined }
        : image,
    );
    const everyPictureCopied = images.every((image) => image.status === "success");
    const anyPictureCopied = images.some((image) => image.status === "success");
    return {
      ...draft,
      images,
      coverImageUrl: draft.coverImageUrl || r2Url,
      imageUploadStatus: everyPictureCopied
        ? "all_success"
        : anyPictureCopied
          ? "partial_success"
          : "failed",
      issues: draft.issues.filter((issue) => issue !== "image_upload_failed"),
    };
  });
}
