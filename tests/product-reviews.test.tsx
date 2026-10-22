import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// Reviews on each product's page: the stars of every review of an order that held the piece, what
// customers praise most, and the words of the reviews the customers let the store show, with a
// first name. The review form asks for that permission (never assumed, and the discount does not
// depend on it), Google reads the same stars, and the Reviews page says where each review stands.

const reviews = vi.hoisted(() => ({
  publicReview: null as unknown,
  submit: vi.fn(async (_review: Record<string, unknown>) => "THANKU10"),
}));
const reviewsData = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { reviewsQueries: object };
  return {
    ...actual,
    reviewsQueries: {
      ...actual.reviewsQueries,
      publicReview: () => ({ queryKey: ["public"], queryFn: async () => reviews.publicReview }),
    },
    submitPublicOrderReview: reviews.submit,
  };
};
vi.mock("../src/lib/data/reviews", (io) => reviewsData(io));
vi.mock("@/lib/data/reviews", (io) => reviewsData(io));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useParams: () => ({ token: "t1" }) }),
}));

const { ProductReviews } = await import("../src/features/product-page/components/ProductReviews");
const rules = await import("../src/features/product-page/lib/product-reviews");
const { productHead } = await import("../src/features/product-page/lib/product-head");
const { reviewStoreState } = await import("../src/lib/order-reviews");
const { Route: reviewRoute } = (await import("../src/routes/review.$token")) as unknown as {
  Route: { options: { component: React.ComponentType } };
};

const summary = {
  count: 5,
  average: 4.6,
  stars: { "1": 0, "2": 0, "3": 0, "4": 2, "5": 3 },
  highlights: { quality: 4, delivery: 2, packaging: 1, speed: 1 },
  reviews: [
    {
      id: "r1",
      rating: 5,
      highlights: [],
      comment: "Beautiful cut",
      name: "Fatima",
      date: "2026-10-01T10:00:00Z",
    },
    {
      id: "r2",
      rating: 4,
      highlights: [],
      comment: null,
      name: null,
      date: "2026-09-12T10:00:00Z",
    },
    {
      id: "r3",
      rating: 5,
      highlights: [],
      comment: "Fast delivery",
      name: "Noor",
      date: "2026-09-01T10:00:00Z",
    },
    {
      id: "r4",
      rating: 4,
      highlights: [],
      comment: "Fits well",
      name: "Sara",
      date: "2026-08-01T10:00:00Z",
    },
  ],
};

describe("the words of a product's reviews", () => {
  it("counts in each language, the Arabic noun by its number", () => {
    expect(rules.reviewCountLine(1, "en")).toBe("Based on 1 review");
    expect(rules.reviewCountLine(5, "en")).toBe("Based on 5 reviews");
    expect(rules.reviewCountLine(1, "ar")).toBe("من تقييم واحد");
    expect(rules.reviewCountLine(2, "ar")).toBe("من تقييمين");
    expect(rules.reviewCountLine(5, "ar")).toBe("من 5 تقييمات");
    expect(rules.reviewCountLine(12, "ar")).toBe("من 12 تقييماً");
  });

  it("names what is praised most in the store's words, three at most", () => {
    expect(rules.topPraise(summary.highlights, "en").map((item) => item.label)).toEqual([
      "Product quality",
      "Delivery",
      "Packaging",
    ]);
    expect(rules.topPraise({ unknown: 9 }, "en")).toEqual([]);
  });

  it("shares the stars out, and names nobody when a review has no name", () => {
    expect(rules.starShares(summary.stars, 5)[0]).toEqual({ stars: 5, count: 3, share: 0.6 });
    expect(rules.averageLabel(4.66)).toBe("4.7");
    expect(rules.reviewerName(null, "ar")).toBe("أحد العملاء");
    expect(rules.reviewDate("2026-10-01T10:00:00Z", "en")).toBe("October 2026");
  });
});

describe("the reviews section", () => {
  it("shows the average, the bars, the praise and the first reviews, the rest on request", () => {
    render(<ProductReviews reviews={summary} lang="en" />);
    expect(screen.getByRole("heading", { name: "Customer reviews" })).toBeInTheDocument();
    expect(screen.getByText("4.6")).toBeInTheDocument();
    expect(screen.getByText("Based on 5 reviews")).toBeInTheDocument();
    expect(screen.getByText("Product quality")).toBeInTheDocument();
    expect(screen.getByText("Beautiful cut")).toBeInTheDocument();
    expect(screen.getByText("A customer")).toBeInTheDocument();
    expect(screen.getAllByText("Confirmed purchase")).toHaveLength(3);
    expect(screen.queryByText("Fits well")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all reviews (4)" }));
    expect(screen.getByText("Fits well")).toBeInTheDocument();
  });

  it("speaks Arabic, and says so when no review's words may be shown", () => {
    render(<ProductReviews reviews={{ ...summary, reviews: [] }} lang="ar" />);
    expect(screen.getByRole("heading", { name: "آراء العملاء" })).toBeInTheDocument();
    expect(screen.getByText("من 5 تقييمات")).toBeInTheDocument();
    expect(screen.getByText("لا توجد تعليقات معروضة بعد.")).toBeInTheDocument();
  });
});

describe("Google's stars", () => {
  it("are the page's own: every review of the piece", () => {
    const head = productHead({
      loaderData: {
        product: {
          id: "p1",
          name_en: "Abaya",
          product_variants: [{ id: "v1", selling_price: 20, stock_main: 1 }],
        },
        productReviews: { count: 5, average: 4.6 },
      },
      params: { slug: "pura", id: "p1" },
    }) as { scripts: Array<{ children: string }> };
    const product = head.scripts
      .map((script) => JSON.parse(script.children))
      .find((schema) => schema["@type"] === "Product");
    expect(product.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.6,
      reviewCount: 5,
      bestRating: 5,
      worstRating: 1,
    });
  });
});

describe("the review form", () => {
  it("asks before showing a review on the store, and gives the discount either way", async () => {
    reviews.publicReview = {
      state: "pending",
      customer_name: "Fatima",
      brand_name: "Pura",
      brand_whatsapp_number: "+97333000000",
    };
    const Page = reviewRoute.options.component;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "5 نجوم" }));
    const consent = screen.getByRole("checkbox", { name: /أوافق على عرض تقييمي في المتجر/ });
    expect(consent).not.toBeChecked();
    expect(screen.getByText(/والخصم لك في الحالتين/)).toBeInTheDocument();
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: /إرسال التقييم/ }));
    await waitFor(() => expect(reviews.submit).toHaveBeenCalledTimes(1));
    expect(reviews.submit.mock.calls[0][0]).toMatchObject({ rating: 5, showOnStore: true });
  });
});

describe("a review on the Reviews page", () => {
  it("is shown, hidden by the store, or kept private by the customer", () => {
    expect(reviewStoreState({ show_on_store: true, hidden_at: null })).toBe("shown");
    expect(reviewStoreState({ show_on_store: true, hidden_at: "2026-10-22" })).toBe("hidden");
    expect(reviewStoreState({ show_on_store: false, hidden_at: null })).toBe("private");
  });
});
