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

/** Submits the customer's review and returns their reward code. */
export async function submitPublicOrderReview(review: {
  token: string;
  rating: number;
  highlights: string[];
  comment: string | null;
}) {
  const { data, error } = await publicSupabase.rpc("submit_public_order_review", {
    p_token: review.token,
    p_rating: review.rating,
    p_highlights: review.highlights,
    p_comment: review.comment ?? undefined,
  });
  if (error) throw error;
  return data;
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
