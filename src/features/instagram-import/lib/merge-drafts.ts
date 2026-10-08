import type { InstagramProductDraft } from "@/lib/instagram-ai-importer";

/**
 * Merging Instagram posts into one product.
 *
 * Many stores post one product as several separate posts in a row (three photos of the same
 * abaya). The importer makes one draft per post, so the review screen lets the merchant fold
 * several drafts into one product: all their pictures together, the best of their details. A merged
 * draft remembers the drafts it came from, so it can be split back, and every post it covers, so a
 * later import does not bring those posts in again.
 */

export type MergeableDraft = InstagramProductDraft & {
  /** Every other post folded into this product (the draft's own id is the main post). */
  mergedPostIds?: string[];
  /** The drafts as they were before merging, to split back. Never sent to the server. */
  mergedFrom?: InstagramProductDraft[];
};

/** Is this draft complete enough to save without a second look? */
export function isDraftReady(draft: InstagramProductDraft): boolean {
  if (typeof draft.price !== "number" || draft.price <= 0 || isNaN(draft.price)) return false;
  const hasSelectedValidImage = draft.images.some(
    (img) => img.selected !== false && img.r2Url && img.status === "success",
  );
  if (draft.imageUploadStatus === "failed" || !hasSelectedValidImage) return false;
  if (draft.fieldSources.price !== "manual" && draft.fieldConfidence.price < 0.7) return false;
  return draft.title.trim().length > 0;
}

/** Every Instagram post a draft stands for: its own, and those merged into it. */
export function postIdsOf(draft: { id: string; mergedPostIds?: string[] }): string[] {
  return [...new Set([draft.id, ...(draft.mergedPostIds ?? [])])];
}

/** The draft as the server should receive it: without the copies kept for splitting. */
export function forSave(
  draft: MergeableDraft,
): InstagramProductDraft & { mergedPostIds?: string[] } {
  const { mergedFrom: _kept, ...rest } = draft;
  return rest;
}

/** How complete a draft's details are: the most complete one of a group leads the merged product. */
function completeness(draft: InstagramProductDraft): number {
  let score = 0;
  if (typeof draft.price === "number" && draft.price > 0) score += 8;
  if (draft.title.trim()) score += 4;
  if (draft.fieldSources.price === "manual" || draft.fieldSources.name === "manual") score += 2;
  score += Math.min(draft.description.trim().length, 200) / 100;
  score += Math.min(draft.sizes.length, 5) / 5;
  score += draft.fieldConfidence.price + draft.fieldConfidence.name;
  return score;
}

const union = (lists: string[][]) => [...new Set(lists.flat())];

function imageStatus(
  images: InstagramProductDraft["images"],
): InstagramProductDraft["imageUploadStatus"] {
  if (images.length > 0 && images.every((image) => image.status === "success"))
    return "all_success";
  return images.some((image) => image.status === "success") ? "partial_success" : "failed";
}

/**
 * Folds the drafts with these ids into one, at the position of the first of them. With fewer than
 * two matching drafts the list is returned unchanged.
 */
export function mergeDrafts(drafts: MergeableDraft[], ids: ReadonlySet<string>): MergeableDraft[] {
  const units = drafts.filter((draft) => ids.has(draft.id));
  if (units.length < 2) return drafts;

  const primary = units.reduce((best, draft) =>
    completeness(draft) > completeness(best) ? draft : best,
  );
  const others = units.filter((draft) => draft !== primary);

  // Pictures: the main post's first, then the others in feed order. One cover only.
  const seen = new Set<string>();
  const ordered = [primary, ...others].flatMap((draft) => draft.images);
  const hadCover = primary.images.find((image) => image.isCover);
  const images = ordered
    .filter((image) => (seen.has(image.url) ? false : (seen.add(image.url), true)))
    .map((image, index) => ({
      ...image,
      isCover: hadCover ? image === hadCover : index === 0,
    }));
  const cover = images.find((image) => image.isCover) ?? images[0];

  // Details: the main post's, filling what it lacks from the others.
  const donorWithPrice = others.find((draft) => typeof draft.price === "number" && draft.price > 0);
  const needsPrice = !(typeof primary.price === "number" && primary.price > 0) && donorWithPrice;
  const price = needsPrice ? donorWithPrice.price : primary.price;
  const description =
    primary.description.trim() ||
    others.map((draft) => draft.description.trim()).sort((a, b) => b.length - a.length)[0] ||
    "";
  const imageUploadStatus = imageStatus(images);
  const issues = union(units.map((draft) => draft.issues)).filter(
    (issue) =>
      !(issue === "missing_price" && typeof price === "number" && price > 0) &&
      !(issue === "image_upload_failed" && imageUploadStatus === "all_success"),
  );

  const merged: MergeableDraft = {
    ...primary,
    images,
    coverImageUrl: cover?.r2Url || cover?.url || primary.coverImageUrl,
    imageUploadStatus,
    postType: images.length > 1 ? "carousel" : primary.postType,
    isSoldOut: units.some((draft) => draft.isSoldOut),
    price,
    fieldConfidence:
      needsPrice && donorWithPrice
        ? { ...primary.fieldConfidence, price: donorWithPrice.fieldConfidence.price }
        : primary.fieldConfidence,
    fieldSources:
      needsPrice && donorWithPrice
        ? { ...primary.fieldSources, price: donorWithPrice.fieldSources.price }
        : primary.fieldSources,
    description,
    category: primary.category ?? others.find((draft) => draft.category)?.category ?? null,
    sizes: union(units.map((draft) => draft.sizes)),
    colors: union(units.map((draft) => draft.colors)),
    issues,
    mergedPostIds: union(units.map((draft) => postIdsOf(draft))).filter((id) => id !== primary.id),
    mergedFrom: units.flatMap((draft) => draft.mergedFrom ?? [draft]),
  };

  const firstId = units[0].id;
  return drafts.flatMap((draft) => {
    if (draft.id === firstId) return [merged];
    return ids.has(draft.id) ? [] : [draft];
  });
}

/** Puts a merged draft's original drafts back, in its place. */
export function splitDraft(drafts: MergeableDraft[], id: string): MergeableDraft[] {
  return drafts.flatMap((draft) =>
    draft.id === id && draft.mergedFrom?.length ? draft.mergedFrom : [draft],
  );
}

/**
 * Merges every `size` posts in a row into one product: the first three, the next three and so on.
 * Drafts that are already merged are left alone and end a run, so nothing the merchant arranged by
 * hand is undone. A last run of one post stays a product of its own.
 */
export function groupEvery(drafts: MergeableDraft[], size: number): MergeableDraft[] {
  if (!Number.isInteger(size) || size < 2) return drafts;
  const result: MergeableDraft[] = [];
  let run: MergeableDraft[] = [];
  const flush = () => {
    for (let start = 0; start < run.length; start += size) {
      const chunk = run.slice(start, start + size);
      result.push(
        ...(chunk.length > 1 ? mergeDrafts(chunk, new Set(chunk.map((d) => d.id))) : chunk),
      );
    }
    run = [];
  };
  for (const draft of drafts) {
    if (draft.mergedFrom?.length) {
      flush();
      result.push(draft);
    } else {
      run.push(draft);
    }
  }
  flush();
  return result;
}
