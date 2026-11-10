import { describe, expect, it } from "vitest";
import { isReviewToken, reviewHead } from "../src/lib/review-head";
import { reviewAddress } from "../src/lib/platform-host";

// A review link is on the store's own address and previews as the store, as its invoice does.

const content = (head: ReturnType<typeof reviewHead>, key: string) =>
  (head.meta as Array<Record<string, string>>).find(
    (tag) => tag.property === key || tag.name === key,
  )?.content;

describe("a review link's address", () => {
  it("is on the store's own subdomain, or its own domain", () => {
    expect(reviewAddress({ slug: "pura" }, "t1")).toBe("https://pura.boutq.store/review/t1");
    expect(reviewAddress({ slug: "pura", custom_domain: "puraline.com" }, "t1")).toBe(
      "https://puraline.com/review/t1",
    );
  });
});

describe("a shared review link", () => {
  const head = reviewHead({
    invoiceNumber: 1108,
    settings: { business_name: "Pura Line", order_number_prefix: "PL-", order_number_digits: 5 },
    shareImage: "https://media.boutq.store/brands/b/hero.jpg",
  });

  it("shows the store's name and picture, and the order as the store writes it", () => {
    expect(content(head, "og:title")).toBe("قيّم طلبك من Pura Line");
    expect(content(head, "og:description")).toContain("PL-01108");
    expect(content(head, "og:site_name")).toBe("Pura Line");
    expect(content(head, "og:image")).toBe("https://media.boutq.store/brands/b/hero.jpg");
    expect(content(head, "twitter:image")).toBe("https://media.boutq.store/brands/b/hero.jpg");
  });

  it("stays out of search engines, and falls back to the store's name", () => {
    expect(content(head, "robots")).toBe("noindex, nofollow");
    expect(content(reviewHead({ storeName: "بيورا" }), "og:site_name")).toBe("بيورا");
    expect(content(reviewHead(null), "og:site_name")).toBe("Boutq");
  });

  it("never offers a picture a preview cannot draw", () => {
    expect(content(reviewHead({ shareImage: "https://x.test/logo.svg" }), "og:image")).toBe(
      "https://boutq.store/og-placeholder.png",
    );
  });

  it("reads only a uuid as a link's token", () => {
    expect(isReviewToken("25744f90-da8d-49a0-a5bc-8f17989fed56")).toBe(true);
    expect(isReviewToken("x")).toBe(false);
  });
});
