import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in reviews data-layer tests");
});

type Call = { client: "admin" | "public"; fn: string; args: unknown };
type Reply = { data?: unknown; error: unknown };

const calls: Call[] = [];
let respond: (call: Call) => Reply = () => ({ data: [], error: null });

const rpc = (client: Call["client"]) => (fn: string, args: unknown) => {
  const call = { client, fn, args };
  calls.push(call);
  return Promise.resolve(respond(call));
};
const client = { supabase: { rpc: rpc("admin") }, publicSupabase: { rpc: rpc("public") } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const reviews = await import("../src/lib/data/reviews");

const denied = { message: "denied" };

beforeEach(() => {
  calls.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("the admin's reviews", () => {
  it("are one list per brand for the Reviews page and the dashboard summary", async () => {
    const options = reviews.reviewsQueries.orderReviews("b1");
    expect(options.queryKey).toEqual(["reviews", "b1", "order-reviews"]);
    expect(options.staleTime).toBe(30_000);
    await reviews.fetchOrderReviews("b1");
    expect(calls).toEqual([
      { client: "admin", fn: "list_brand_order_reviews", args: { p_brand_id: "b1" } },
    ]);
    respond = () => ({ data: null, error: denied });
    await expect(reviews.fetchOrderReviews("b1")).rejects.toBe(denied);
  });

  it("move a review request on and refresh only the queue", async () => {
    await reviews.updateReviewRequestStatus("r1", "sent");
    expect(calls[0]).toEqual({
      client: "admin",
      fn: "update_order_review_request_status",
      args: { p_request_id: "r1", p_status: "sent" },
    });
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await reviews.invalidateReadyReviewRequests(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["reviews", "b1", "ready-requests"]]);
    respond = () => ({ error: denied });
    await expect(reviews.updateReviewRequestStatus("r1", "dismissed")).rejects.toBe(denied);
  });
});

describe("the customer's review page", () => {
  it("reads the order behind the link through the anonymous client, none when unknown", async () => {
    respond = () => ({ data: [{ order_number: "1001" }], error: null });
    expect(await reviews.fetchPublicOrderReview("t1")).toEqual({ order_number: "1001" });
    expect(calls[0]).toMatchObject({ client: "public", fn: "get_public_order_review" });
    respond = () => ({ data: [], error: null });
    expect(await reviews.fetchPublicOrderReview("t1")).toBeNull();
    expect(reviews.reviewsQueries.publicReview("t1").retry).toBe(false);
  });

  it("submits the review and returns the reward code, leaving an empty comment to the default", async () => {
    respond = () => ({ data: "THANKS15", error: null });
    const code = await reviews.submitPublicOrderReview({
      token: "t1",
      rating: 5,
      highlights: ["fit"],
      comment: null,
    });
    expect(code).toBe("THANKS15");
    expect(calls[0]).toEqual({
      client: "public",
      fn: "submit_public_order_review",
      args: { p_token: "t1", p_rating: 5, p_highlights: ["fit"], p_comment: undefined },
    });
    respond = () => ({ data: null, error: denied });
    await expect(
      reviews.submitPublicOrderReview({ token: "t1", rating: 4, highlights: [], comment: "ok" }),
    ).rejects.toBe(denied);
  });
});
