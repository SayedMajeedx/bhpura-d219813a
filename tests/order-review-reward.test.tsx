import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260825120000_order_review_rewards.sql"),
  "utf8",
);

// The admin queue and the public review page read through the reviews data layer.
const reviews = vi.hoisted(() => ({
  ready: [] as unknown[],
  publicReview: null as unknown,
  updateReviewRequestStatus: vi.fn(async () => undefined),
}));
const reviewsData = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { reviewsQueries: object };
  return {
    ...actual,
    reviewsQueries: {
      ...actual.reviewsQueries,
      readyRequests: () => ({ queryKey: ["ready"], queryFn: async () => reviews.ready }),
      publicReview: () => ({ queryKey: ["public"], queryFn: async () => reviews.publicReview }),
    },
    updateReviewRequestStatus: reviews.updateReviewRequestStatus,
    invalidateReadyReviewRequests: async () => undefined,
  };
};
vi.mock("../src/lib/data/reviews", (io) => reviewsData(io));
vi.mock("@/lib/data/reviews", (io) => reviewsData(io));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useParams: () => ({ token: "t1" }) }),
}));

const { ReviewRequestQueue } = await import("../src/components/dashboard/ReviewRequestQueue");
const { Route: reviewRoute } = (await import("../src/routes/review.$token")) as unknown as {
  Route: { options: { component: React.ComponentType } };
};
const withQuery = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

// Bug #33: the enqueue trigger must see completion set by the BEFORE trigger.
const enqueueFix = readFileSync(
  resolve("supabase/migrations/20260928170000_enqueue_review_request_on_completion.sql"),
  "utf8",
);

describe("post-purchase review reward", () => {
  it("schedules the request when a status change completes the order (bug #33)", () => {
    // UPDATE OF completed_at never fires: the app never sets completed_at itself.
    expect(enqueueFix).not.toMatch(/CREATE TRIGGER[^;]*UPDATE OF completed_at/);
    expect(enqueueFix).toMatch(
      /AFTER UPDATE ON public\.orders[\s\S]*?OLD\.completed_at IS DISTINCT FROM NEW\.completed_at/,
    );
    // A phone added after completion schedules it too.
    expect(enqueueFix).toContain(
      "OLD.customer_phone_snapshot IS DISTINCT FROM NEW.customer_phone_snapshot",
    );
    expect(enqueueFix).toMatch(
      /AFTER INSERT ON public\.orders[\s\S]*?WHEN \(NEW\.completed_at IS NOT NULL\)/,
    );
    // Missed orders are scheduled once, without duplicates.
    expect(enqueueFix).toContain("o.completed_at + interval '3 days'");
    expect(enqueueFix).toContain("ON CONFLICT (order_id) DO NOTHING");
  });

  it("schedules one tokenized request three days after completion", () => {
    expect(migration).toContain("UNIQUE REFERENCES public.orders(id)");
    expect(migration).toContain("NEW.completed_at + interval '3 days'");
    expect(migration).toContain("public_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()");
  });

  it("keeps review tables private and exposes token-scoped public RPCs", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "REVOKE ALL ON public.order_reviews FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("WHERE r.public_token = p_token AND r.eligible_at <= now()");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.submit_public_order_review");
  });

  it("separates opening WhatsApp from confirming that the message was sent", async () => {
    reviews.ready = [
      {
        request_id: "r1",
        order_id: "o1",
        invoice_number: 1098,
        customer_name: "Sara",
        customer_phone: "97339001122",
        eligible_at: "2026-09-26T00:00:00Z",
        request_status: "ready",
        review_url_token: "t1",
      },
    ];
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    try {
      withQuery(<ReviewRequestQueue brandId="b1" brandName="Pura" isAr={false} />);
      fireEvent.click(await screen.findByRole("button", { name: "Open WhatsApp" }));
      await waitFor(() =>
        expect(reviews.updateReviewRequestStatus).toHaveBeenCalledWith("r1", "whatsapp_opened"),
      );
      expect(open.mock.calls[0][0]).toContain("https://wa.me/97339001122");
      expect(reviews.updateReviewRequestStatus).not.toHaveBeenCalledWith("r1", "sent");
      fireEvent.click(screen.getByRole("button", { name: "Mark sent" }));
      await waitFor(() =>
        expect(reviews.updateReviewRequestStatus).toHaveBeenCalledWith("r1", "sent"),
      );
    } finally {
      open.mockRestore();
    }
  });

  it("reveals THANKU10 only after completion", async () => {
    expect(migration).toContain("CASE WHEN r.status = 'completed'");
    const ReviewPage = reviewRoute.options.component;
    const base = {
      brand_name: "Pura",
      brand_logo_url: null,
      invoice_number: 1098,
      customer_name: "Sara",
      brand_whatsapp_number: "97330000000",
    };

    reviews.publicReview = { ...base, state: "ready", reward_code: null };
    const pending = withQuery(<ReviewPage />);
    expect(
      await screen.findByRole("button", { name: /إرسال التقييم واستلام الخصم/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("THANKU10")).not.toBeInTheDocument();
    pending.unmount();

    reviews.publicReview = { ...base, state: "completed", reward_code: "THANKU10" };
    withQuery(<ReviewPage />);
    expect(await screen.findByText("THANKU10")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /استخدام الخصم عبر الواتساب/ }).getAttribute("href"),
    ).toContain("https://wa.me/97330000000");
  });
});
