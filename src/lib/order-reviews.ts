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
  reward_code: string;
  reviewed_at: string;
  request_sent_at: string | null;
};

export const REVIEW_HIGHLIGHT_LABELS: Record<string, { ar: string; en: string }> = {
  quality: { ar: "جودة المنتج", en: "Product quality" },
  packaging: { ar: "التغليف", en: "Packaging" },
  speed: { ar: "سرعة التجهيز", en: "Preparation speed" },
  delivery: { ar: "التوصيل", en: "Delivery" },
  service: { ar: "التعامل والخدمة", en: "Service" },
};

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
