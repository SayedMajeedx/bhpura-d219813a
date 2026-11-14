/** Something to look at before a post goes out, in the reader's words. */
export type ShareCheck = { key: string; text: string };

/**
 * What could make a post wrong once shared, read from the studio's own state: an offer the post
 * prices by that is about to end (or has), a Last Chance with no offer or code behind its day, and
 * a product with no photo. The caption always says the post's own price (the offer's while one is
 * on), so the two cannot disagree; an empty list means nothing to check.
 */
export function shareChecks({
  templateId,
  saleEndsAt,
  hasSale,
  hasPhoto,
  deadlineBacked,
  now,
  lang,
}: {
  templateId: string;
  /** When the offer the post's price comes from ends (null: no end, or no offer). */
  saleEndsAt: string | null;
  hasSale: boolean;
  hasPhoto: boolean;
  /** Last Chance: its day comes from a live offer or a chosen code. */
  deadlineBacked: boolean;
  now: Date;
  lang: "ar" | "en";
}): ShareCheck[] {
  const ar = lang === "ar";
  const checks: ShareCheck[] = [];
  const ends = saleEndsAt ? new Date(saleEndsAt).getTime() : NaN;
  if (hasSale && !Number.isNaN(ends)) {
    const left = ends - now.getTime();
    if (left <= 0) {
      checks.push({
        key: "offer-ended",
        text: ar
          ? "العرض اللي يحسب منه السعر انتهى: حدّث الصفحة قبل النشر."
          : "The offer this price comes from has ended: refresh before posting.",
      });
    } else if (left <= 2 * 3_600_000) {
      checks.push({
        key: "offer-ending",
        text: ar
          ? "العرض ينتهي خلال ساعتين: انشر الحين أو استخدم قالب «فرصة أخيرة»."
          : "The offer ends within two hours: post now, or use Last Chance.",
      });
    }
  }
  if (templateId === "last-chance" && !deadlineBacked) {
    checks.push({
      key: "deadline-unbacked",
      text: ar
        ? "ما في عرض أو كود ينتهي بهاليوم: تأكد من اليوم قبل النشر."
        : "No offer or code ends on this day: check the day before posting.",
    });
  }
  if (!hasPhoto && templateId !== "occasion-pack" && templateId !== "how-to-order") {
    checks.push({
      key: "no-photo",
      text: ar
        ? "هذا المنتج بدون صورة: أضف صورة من المخزون لمنشور أجمل."
        : "This product has no photo: add one in Inventory for a better post.",
    });
  }
  return checks;
}
