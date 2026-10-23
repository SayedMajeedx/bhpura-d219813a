import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { publicSupabase, supabase } from "@/integrations/supabase/client";

/**
 * Order reviews: the admin list (Reviews page and the dashboard's summary),
 * the review requests ready to send (dashboard queue), and the customer's
 * public review page, which reads and submits by the link's token through
 * the anonymous client.
 */

export const reviewsKeys = {
  all: (brandId: string) => ["reviews", brandId] as const,
  orderReviews: (brandId: string) => [...reviewsKeys.all(brandId), "order-reviews"] as const,
  readyRequests: (brandId: string) => [...reviewsKeys.all(brandId), "ready-requests"] as const,
  /** The public page is keyed by its link token, not by brand. */
  publicReview: (token: string) => ["public-order-review", token] as const,
  /** A store's reviews for its home page, keyed by its slug (a visitor has no brand id yet). */
  store: (brandSlug: string) => ["store-reviews", brandSlug] as const,
};

/** Every review of the brand's orders. */
export async function fetchOrderReviews(brandId: string) {
  const { data, error } = await supabase.rpc("list_brand_order_reviews", { p_brand_id: brandId });
  if (error) throw error;
  return data ?? [];
}

/** Review requests whose wait is over and that have not been sent yet. */
export async function fetchReadyReviewRequests(brandId: string) {
  const { data, error } = await supabase.rpc("list_ready_order_review_requests", {
    p_brand_id: brandId,
  });
  if (error) throw error;
  return data ?? [];
}

export type ReviewRequestStatus = "whatsapp_opened" | "sent" | "dismissed";

export async function updateReviewRequestStatus(requestId: string, status: ReviewRequestStatus) {
  const { error } = await supabase.rpc("update_order_review_request_status", {
    p_request_id: requestId,
    p_status: status,
  });
  if (error) throw error;
}

/** The order a review link points to, or null when the link matches none. */
export async function fetchPublicOrderReview(token: string) {
  const { data, error } = await publicSupabase.rpc("get_public_order_review", { p_token: token });
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

/**
 * Submits the customer's review and returns their reward code. `showOnStore` is the customer's
 * answer to whether their review may be shown on the store (first name only); unasked, it is not.
 */
export async function submitPublicOrderReview(review: {
  token: string;
  rating: number;
  highlights: string[];
  comment: string | null;
  showOnStore?: boolean;
}) {
  const { data, error } = await publicSupabase.rpc("submit_public_order_review", {
    p_token: review.token,
    p_rating: review.rating,
    p_highlights: review.highlights,
    p_comment: review.comment ?? undefined,
    p_show_on_store: review.showOnStore ?? false,
  });
  if (error) throw error;
  return data;
}

/** Hides a review's words from the store's product pages, or shows them again (staff only). */
export async function setReviewHidden(reviewId: string, hidden: boolean) {
  const { error } = await supabase.rpc("set_order_review_hidden", {
    p_review_id: reviewId,
    p_hidden: hidden,
  });
  if (error) throw error;
}

/** One review as a product's page shows it: the customer's first name only. */
export type ProductReview = {
  id: string;
  rating: number;
  highlights: string[];
  comment: string | null;
  name: string | null;
  date: string;
};

/**
 * What a product's page says about its reviews: the stars of every review of an order that held
 * it, what customers praise, and the words the customers let the store show.
 */
export type ProductReviews = {
  count: number;
  average: number;
  stars: Record<string, number>;
  highlights: Record<string, number>;
  reviews: ProductReview[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A product's reviews for its page, or null when it has none (or the read fails: a page with no
 * reviews section is better than a broken page). Read beside the product, never after it.
 */
export async function fetchProductReviews(
  brandSlug: string,
  productId: string,
): Promise<ProductReviews | null> {
  if (!brandSlug || !UUID.test(productId)) return null;
  try {
    const { data, error } = await publicSupabase.rpc("storefront_product_reviews", {
      p_brand_slug: brandSlug,
      p_product_id: productId,
    });
    const reviews = data as ProductReviews | null;
    return error || !reviews || !(Number(reviews.count) > 0) ? null : reviews;
  } catch {
    return null;
  }
}

/**
 * A store's reviews as a whole (a services store's home page), by the product page's rules
 * (storefront_store_reviews, migration 20261023120000), or null when it has none or the read
 * fails: the page is better without the section than broken.
 */
export async function fetchStoreReviews(brandSlug: string): Promise<ProductReviews | null> {
  if (!brandSlug) return null;
  try {
    const { data, error } = await publicSupabase.rpc("storefront_store_reviews", {
      p_brand_slug: brandSlug,
    });
    const reviews = data as ProductReviews | null;
    return error || !reviews || !(Number(reviews.count) > 0) ? null : reviews;
  } catch {
    return null;
  }
}

/** Why the database refused a review (the codes `submit_public_order_review` raises). */
export type ReviewRefusal =
  "REVIEW_NOT_FOUND" | "INVALID_RATING" | "INVALID_HIGHLIGHT" | "COMMENT_TOO_LONG";

const REVIEW_REFUSALS: readonly ReviewRefusal[] = [
  "REVIEW_NOT_FOUND",
  "INVALID_RATING",
  "INVALID_HIGHLIGHT",
  "COMMENT_TOO_LONG",
];

/** The refusal code in a failed submission's error, or null (network and other errors). */
export function reviewRefusal(error: unknown): ReviewRefusal | null {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== "string") return null;
  return REVIEW_REFUSALS.find((code) => message.includes(code)) ?? null;
}

export const reviewsQueries = {
  orderReviews: (brandId: string) =>
    queryOptions({
      queryKey: reviewsKeys.orderReviews(brandId),
      queryFn: () => fetchOrderReviews(brandId),
      enabled: Boolean(brandId),
      staleTime: 30_000,
    }),
  readyRequests: (brandId: string) =>
    queryOptions({
      queryKey: reviewsKeys.readyRequests(brandId),
      queryFn: () => fetchReadyReviewRequests(brandId),
      enabled: Boolean(brandId),
    }),
  store: (brandSlug: string) =>
    queryOptions({
      queryKey: reviewsKeys.store(brandSlug),
      queryFn: () => fetchStoreReviews(brandSlug),
      enabled: Boolean(brandSlug),
      staleTime: 5 * 60_000,
    }),
  publicReview: (token: string) =>
    queryOptions({
      queryKey: reviewsKeys.publicReview(token),
      queryFn: () => fetchPublicOrderReview(token),
      enabled: Boolean(token),
      retry: false,
    }),
};

export function invalidateReadyReviewRequests(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: reviewsKeys.readyRequests(brandId) });
}
