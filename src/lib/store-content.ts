/**
 * A store's pictures and questions (store_gallery_items, store_faq_items;
 * migration 20261002140000): the merchant edits them, the storefront shows
 * them. Pure rules only: grouping, wording, ordering and the editor's forms.
 */

export type GalleryItem = {
  id: string;
  image_url: string;
  caption_en: string | null;
  caption_ar: string | null;
  sort_order: number;
  is_active: boolean;
};

export type FaqItem = {
  id: string;
  group_en: string | null;
  group_ar: string | null;
  question_en: string | null;
  question_ar: string | null;
  answer_en: string | null;
  answer_ar: string | null;
  sort_order: number;
  is_active: boolean;
};

const clean = (text: string | null | undefined) => text?.trim() || null;

/** The caption in the reader's language, falling back to the other one. */
export function captionText(item: Pick<GalleryItem, "caption_en" | "caption_ar">, isAr: boolean) {
  return (
    (isAr
      ? clean(item.caption_ar) || clean(item.caption_en)
      : clean(item.caption_en) || clean(item.caption_ar)) ?? ""
  );
}

/** A question or answer in the reader's language, falling back to the other one. */
export function faqText(item: FaqItem, field: "question" | "answer" | "group", isAr: boolean) {
  const en = clean(item[`${field}_en`]);
  const ar = clean(item[`${field}_ar`]);
  return (isAr ? ar || en : en || ar) ?? "";
}

export type FaqGroup = { key: string; title: string; items: FaqItem[] };

/** The questions as the customer reads them: active ones, in order, under their group's heading. */
export function groupFaqs(items: readonly FaqItem[], isAr: boolean): FaqGroup[] {
  const groups = new Map<string, FaqGroup>();
  for (const item of [...items].sort(bySortOrder)) {
    if (!item.is_active || !faqText(item, "question", isAr)) continue;
    const title = faqText(item, "group", isAr);
    const group = groups.get(title) ?? { key: title, title, items: [] };
    group.items.push(item);
    groups.set(title, group);
  }
  return [...groups.values()];
}

/** Items in the order the merchant gave them (ties: as given). */
export const bySortOrder = (a: { sort_order: number }, b: { sort_order: number }) =>
  a.sort_order - b.sort_order;

/**
 * The new order after moving an item one place up or down: every item's id
 * with its sort_order, renumbered from 0 (nothing to do at the ends).
 */
export function moveItem<T extends { id: string; sort_order: number }>(
  items: readonly T[],
  id: string,
  direction: -1 | 1,
): Array<{ id: string; sort_order: number }> | null {
  const sorted = [...items].sort(bySortOrder);
  const from = sorted.findIndex((item) => item.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= sorted.length) return null;
  const [moved] = sorted.splice(from, 1);
  sorted.splice(to, 0, moved);
  return sorted.map((item, index) => ({ id: item.id, sort_order: index }));
}

/** The sort_order a new item takes: after the last one. */
export function nextSortOrder(items: readonly { sort_order: number }[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map((item) => item.sort_order)) + 1;
}

// ── The merchant's forms ────────────────────────────────────────────────────

export type GalleryForm = {
  image_url: string;
  caption_en: string;
  caption_ar: string;
  is_active: boolean;
};

export const EMPTY_GALLERY_FORM: GalleryForm = {
  image_url: "",
  caption_en: "",
  caption_ar: "",
  is_active: true,
};

export const galleryFormFrom = (item: GalleryItem): GalleryForm => ({
  image_url: item.image_url,
  caption_en: item.caption_en ?? "",
  caption_ar: item.caption_ar ?? "",
  is_active: item.is_active,
});

export const galleryFormError = (form: GalleryForm, isAr: boolean): string | null =>
  form.image_url.trim() ? null : isAr ? "أضف صورة." : "Add a picture.";

export const galleryColumns = (form: GalleryForm) => ({
  image_url: form.image_url.trim(),
  caption_en: clean(form.caption_en),
  caption_ar: clean(form.caption_ar),
  is_active: form.is_active,
});

export type FaqForm = {
  group_en: string;
  group_ar: string;
  question_en: string;
  question_ar: string;
  answer_en: string;
  answer_ar: string;
  is_active: boolean;
};

export const EMPTY_FAQ_FORM: FaqForm = {
  group_en: "",
  group_ar: "",
  question_en: "",
  question_ar: "",
  answer_en: "",
  answer_ar: "",
  is_active: true,
};

export const faqFormFrom = (item: FaqItem): FaqForm => ({
  group_en: item.group_en ?? "",
  group_ar: item.group_ar ?? "",
  question_en: item.question_en ?? "",
  question_ar: item.question_ar ?? "",
  answer_en: item.answer_en ?? "",
  answer_ar: item.answer_ar ?? "",
  is_active: item.is_active,
});

/** Why the question can't be saved: it needs a question and an answer, in at least one language. */
export function faqFormError(form: FaqForm, isAr: boolean): string | null {
  const question = clean(form.question_en) || clean(form.question_ar);
  const answer = clean(form.answer_en) || clean(form.answer_ar);
  if (!question) return isAr ? "اكتب السؤال." : "Write the question.";
  if (!answer) return isAr ? "اكتب الإجابة." : "Write the answer.";
  return null;
}

export const faqColumns = (form: FaqForm) => ({
  group_en: clean(form.group_en),
  group_ar: clean(form.group_ar),
  question_en: clean(form.question_en),
  question_ar: clean(form.question_ar),
  answer_en: clean(form.answer_en),
  answer_ar: clean(form.answer_ar),
  is_active: form.is_active,
});
