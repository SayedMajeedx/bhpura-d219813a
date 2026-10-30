import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listenForCartOpen, openCartDrawer, triggerShown } from "../src/lib/cart-drawer";
import { SocialProofBadge } from "../src/features/product-page/components/SocialProofBadge";

// The storefront feels immediate: a tapped product shows its shape at once, the header and the
// gallery stay in view, adding to the cart opens the cart, and the page says what sold calmly.

const storefront = vi.hoisted(() => ({
  useStorefront: () => ({
    settings: { pdp_gallery_aspect_ratio: "4:5" },
    t: (_ar: string, en: string) => en,
  }),
}));
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);

const { ProductPagePending } =
  await import("../src/features/product-page/components/ProductPagePending");

describe("a product being read after a tap", () => {
  it("shows the page's shape, in the store's gallery frame, and says it is loading", () => {
    render(<ProductPagePending />);
    const status = screen.getByRole("status", { name: "Loading the product" });
    expect(status.querySelector(".aspect-\\[4\\/5\\]")).not.toBeNull();
  });
});

describe("opening the cart after adding to it", () => {
  const stops: Array<() => void> = [];
  afterEach(() => stops.splice(0).forEach((stop) => stop()));

  it("opens the drawer whose button is on screen, and only one", () => {
    const opened: string[] = [];
    stops.push(listenForCartOpen(() => (opened.push("phone"), false)));
    stops.push(listenForCartOpen(() => (opened.push("wide"), true)));
    stops.push(listenForCartOpen(() => (opened.push("never"), true)));
    expect(openCartDrawer()).toBe(true);
    expect(opened).toEqual(["phone", "wide"]);
  });

  it("says no drawer opened when none could (a catalog store), so the page says it its way", () => {
    expect(openCartDrawer()).toBe(false);
    stops.push(listenForCartOpen(() => false));
    expect(openCartDrawer()).toBe(false);
  });

  it("knows a button inside a hidden header is not on screen", () => {
    expect(triggerShown(null)).toBe(false);
    const shown = document.createElement("button");
    shown.getClientRects = () => [{}] as unknown as DOMRectList;
    expect(triggerShown(shown)).toBe(true);
    const hidden = document.createElement("button");
    hidden.getClientRects = () => [] as unknown as DOMRectList;
    expect(triggerShown(hidden)).toBe(false);
  });
});

describe("what sold this week", () => {
  it("counts in Arabic as Arabic counts", () => {
    const { rerender } = render(<SocialProofBadge count={5} lang="ar" />);
    expect(screen.getByText("تم شراؤه 5 مرات خلال الأسبوع الماضي")).toBeTruthy();
    rerender(<SocialProofBadge count={12} lang="ar" />);
    expect(screen.getByText("تم شراؤه 12 مرة خلال الأسبوع الماضي")).toBeTruthy();
    rerender(<SocialProofBadge count={3} lang="en" />);
    expect(screen.getByText("Bought 3 times in the last 7 days")).toBeTruthy();
  });
});
