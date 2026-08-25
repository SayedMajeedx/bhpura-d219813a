import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculateReviewMetrics, type OrderReviewAdminRow } from "../src/lib/order-reviews";

const route = readFileSync(resolve("src/routes/_authenticated/admin.b.$slug.reviews.tsx"), "utf8");
const navigation = readFileSync(resolve("src/config/admin-navigation.ts"), "utf8");
const migration = readFileSync(
  resolve("supabase/migrations/20260825153000_review_management_dashboard.sql"),
  "utf8",
);

const review = (rating: number): OrderReviewAdminRow => ({
  review_id: crypto.randomUUID(),
  request_id: crypto.randomUUID(),
  order_id: crypto.randomUUID(),
  invoice_number: 1000 + rating,
  customer_name: "Customer",
  customer_phone: null,
  rating,
  highlights: [],
  comment: null,
  reward_code: "THANKU10",
  reviewed_at: "2026-08-25T00:00:00Z",
  request_sent_at: null,
});

describe("review management dashboard", () => {
  it("calculates satisfaction and low-review metrics", () => {
    const metrics = calculateReviewMetrics([review(5), review(4), review(2)]);
    expect(metrics.total).toBe(3);
    expect(metrics.average).toBeCloseTo(3.67, 2);
    expect(metrics.positiveRate).toBeCloseTo(66.67, 2);
    expect(metrics.lowCount).toBe(1);
  });

  it("adds the customer reviews destination to operations navigation", () => {
    expect(navigation).toContain('id: "reviews"');
    expect(navigation).toContain('labelAr: lang === "ar" ? "تقييمات العملاء"');
  });

  it("supports search, rating and period filters with order navigation", () => {
    expect(route).toContain("ratingFilter");
    expect(route).toContain("deferredSearch");
    expect(route).toContain("periodDays");
    expect(route).toContain('to="/admin/b/$slug/orders/$id"');
  });

  it("keeps the review feed tenant scoped", () => {
    expect(migration).toContain("public.can_access_brand(rv.brand_id)");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.list_brand_order_reviews");
  });
});
