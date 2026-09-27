import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calculateReviewMetrics,
  filterReviews,
  type OrderReviewAdminRow,
} from "../src/lib/order-reviews";
import { getAdminNavItems } from "../src/config/admin-navigation";

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
    const items = getAdminNavItems({
      activeSlug: "pura",
      isCourier: false,
      isAdmin: true,
      hasPermission: () => true,
      t: (key: string) => key,
      lang: "ar",
    } as Parameters<typeof getAdminNavItems>[0]);
    expect(items.find((item) => item.id === "reviews")).toMatchObject({
      to: "/admin/b/$slug/reviews",
      params: { slug: "pura" },
      labelAr: "تقييمات العملاء",
    });
  });

  it("supports search, rating and period filters", () => {
    const now = Date.parse("2026-09-27T00:00:00Z");
    const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();
    const rows = [
      {
        ...review(5),
        customer_name: "Sara",
        comment: "Beautiful stitching",
        reviewed_at: daysAgo(5),
      },
      { ...review(2), customer_name: "Noor", comment: null, reviewed_at: daysAgo(60) },
      { ...review(4), customer_name: "Huda", comment: "Late", reviewed_at: daysAgo(120) },
    ];
    const names = (filters: Partial<Parameters<typeof filterReviews>[1]>) =>
      filterReviews(rows, { search: "", rating: "all", period: "all", now, ...filters }).map(
        (row) => row.customer_name,
      );
    expect(names({})).toEqual(["Sara", "Noor", "Huda"]);
    expect(names({ rating: "2" })).toEqual(["Noor"]);
    expect(names({ period: "30" })).toEqual(["Sara"]);
    expect(names({ period: "90" })).toEqual(["Sara", "Noor"]);
    expect(names({ search: "stitch" })).toEqual(["Sara"]);
    expect(names({ search: "noor" })).toEqual(["Noor"]);
    expect(names({ search: String(rows[2].invoice_number) })).toEqual(["Huda"]);
  });

  it("keeps the review feed tenant scoped", () => {
    expect(migration).toContain("public.can_access_brand(rv.brand_id)");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.list_brand_order_reviews");
  });
});
