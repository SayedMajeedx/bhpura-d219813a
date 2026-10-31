import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Checkout's header keeps the logo and one way back: the announcement, menu, search, wishlist
// and cart were each a way to leave in the middle of paying.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to: _to, params: _params, ...rest }: Record<string, unknown>) => (
    <a href="/pura" {...(rest as object)}>
      {children as React.ReactNode}
    </a>
  ),
}));
const store = vi.hoisted(() => ({
  lang: "en" as "ar" | "en",
  settings: { logo_url: null as string | null, logo_size: 40 },
}));
const storefront = {
  useStorefront: () => ({
    brand: { slug: "pura", name_en: "Pura Line", name_ar: "بيورا لاين" },
    settings: store.settings,
    lang: store.lang,
    t: (ar: string, en: string) => (store.lang === "ar" ? ar : en),
  }),
};
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);

const { CheckoutHeader } =
  await import("../src/features/storefront-shell/components/CheckoutHeader");

describe("the checkout header", () => {
  it("has the store's name and a way back, and nothing to wander off through", () => {
    store.lang = "en";
    render(<CheckoutHeader />);
    expect(screen.getByRole("link", { name: "Pura Line" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continue shopping/ })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the logo when the store has one, and speaks Arabic", () => {
    store.lang = "ar";
    store.settings = { logo_url: "https://media.boutq.store/logo.png", logo_size: 40 };
    render(<CheckoutHeader />);
    expect(screen.getByRole("img", { name: "بيورا لاين" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /متابعة التسوق/ })).toBeInTheDocument();
  });
});
