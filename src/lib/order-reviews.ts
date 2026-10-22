export type OrderReviewAdminRow = {
  review_id: string;
  request_id: string;
  order_id: string;
  invoice_number: number;
  customer_name: string;
  customer_phone: string | null;
  rating: number;
  highlights: string[];
  comment: string | null;
  /** The thank-you code the review was given; none when the store gave no discount. */
  reward_code: string | null;
  reviewed_at: string;
  request_sent_at: string | null;
  /** The customer agreed to the review being shown on the store. */
  show_on_store?: boolean | null;
  /** When the store hid the review's words from its product pages. */
  hidden_at?: string | null;
};

export const REVIEW_HIGHLIGHT_LABELS: Record<string, { ar: string; en: string }> = {
  quality: { ar: "جودة المنتج", en: "Product quality" },
  packaging: { ar: "التغليف", en: "Packaging" },
  speed: { ar: "سرعة التجهيز", en: "Preparation speed" },
  delivery: { ar: "التوصيل", en: "Delivery" },
  service: { ar: "التعامل والخدمة", en: "Service" },
};

/**
 * Where a review stands on the store's product pages: its words shown (the customer agreed),
 * hidden by the store, or private (the customer did not agree). Its stars count in every case.
 */
export function reviewStoreState(
  review: Pick<OrderReviewAdminRow, "show_on_store" | "hidden_at">,
): "shown" | "hidden" | "private" {
  if (!review.show_on_store) return "private";
  return review.hidden_at ? "hidden" : "shown";
}

export function calculateReviewMetrics(reviews: OrderReviewAdminRow[]) {
  const total = reviews.length;
  const average = total
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / total
    : 0;
  const distribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: reviews.filter((review) => Number(review.rating) === rating).length,
  }));
  const lowCount = reviews.filter((review) => Number(review.rating) <= 3).length;
  const positiveCount = reviews.filter((review) => Number(review.rating) >= 4).length;
  const positiveRate = total ? (positiveCount / total) * 100 : 0;
  return { total, average, distribution, lowCount, positiveRate };
}

/**
 * The reviews screen's filters: a star rating ("all" or 1–5), a period ("all",
 * "30" or "90" days back from `now`), and a search over the customer's name,
 * the invoice number and the comment (already trimmed and lower-cased).
 */
export function filterReviews(
  reviews: OrderReviewAdminRow[],
  { search, rating, period, now }: { search: string; rating: string; period: string; now: number },
): OrderReviewAdminRow[] {
  const periodDays = period === "30" ? 30 : period === "90" ? 90 : null;
  const cutoff = periodDays ? now - periodDays * 86_400_000 : null;
  return reviews.filter((review) => {
    if (rating !== "all" && Number(review.rating) !== Number(rating)) return false;
    if (cutoff && new Date(review.reviewed_at).getTime() < cutoff) return false;
    if (!search) return true;
    return (
      review.customer_name.toLowerCase().includes(search) ||
      String(review.invoice_number).includes(search) ||
      (review.comment ?? "").toLowerCase().includes(search)
    );
  });
}
