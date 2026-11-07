import { describe, expect, it } from "vitest";
import { invoiceHead, isInvoiceToken } from "../src/lib/invoice-head";

const content = (head: ReturnType<typeof invoiceHead>, key: string) =>
  (head.meta as Array<Record<string, string>>).find(
    (tag) => tag.property === key || tag.name === key,
  )?.content;

describe("a shared invoice link", () => {
  const head = invoiceHead({
    order: { invoice_number: 1102 },
    settings: { business_name: "Pura Line", order_number_prefix: "PL-", order_number_digits: 5 },
    shareImage: "https://media.boutq.store/brands/b/hero.jpg",
  });

  it("shows the store's name and picture, its number as the store writes it", () => {
    expect(content(head, "og:title")).toBe("Invoice PL-01102 — Pura Line");
    expect(content(head, "og:description")).toBe("Invoice from Pura Line.");
    expect(content(head, "og:site_name")).toBe("Pura Line");
    expect(content(head, "og:image")).toBe("https://media.boutq.store/brands/b/hero.jpg");
    expect(content(head, "twitter:image")).toBe("https://media.boutq.store/brands/b/hero.jpg");
  });

  it("stays out of search engines", () => {
    expect(content(head, "robots")).toBe("noindex, nofollow");
  });

  it("falls back to the store's own name before the platform's", () => {
    expect(content(invoiceHead({ storeName: "Pura" }), "og:site_name")).toBe("Pura");
    expect(content(invoiceHead(null), "og:site_name")).toBe("Boutq");
  });

  it("never offers a picture a preview cannot draw", () => {
    expect(content(invoiceHead({ shareImage: "https://x.test/logo.svg" }), "og:image")).toBe(
      "https://boutq.store/og-placeholder.png",
    );
  });
});

describe("an invoice's link", () => {
  it("holds a uuid, or the page says it was not found", () => {
    expect(isInvoiceToken("25744f90-da8d-49a0-a5bc-8f17989fed56")).toBe(true);
    expect(isInvoiceToken("x")).toBe(false);
  });
});
