import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import heroDefault from "../supabase/migrations/20261014100000_hero_mobile_default_landscape.sql?raw";
import { DEFAULT_HERO_MOBILE, heroFrameSizingClass, heroPhoneShare } from "../src/lib/hero-media";
import { railPhoneAlign } from "../src/lib/rail-layout";
import { isCheckoutPath } from "../src/features/storefront-shell/lib/checkout-path";
import type { CartItem } from "../src/lib/storefront-context";

// A store on a phone, from the review of the live storefronts at iPhone size (2026-10-14):
// the 4:5 hero default took 73% of the first screen, the trust strip 166px more, so no
// product showed before scrolling; checkout kept its order summary four screens down and
// the WhatsApp button over its fields; a single product sat at the edge of an empty row.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const location = vi.hoisted(() => ({ pathname: "/pura" }));
vi.mock("@tanstack/react-router", () => ({ useLocation: () => location }));
const storefront = {
  useStorefront: () => ({
    settings: { whatsapp_enabled: true, whatsapp_number: "39990016" },
    lang: "en",
    brand: { name_en: "Pura", name_ar: "بورا" },
  }),
  formatPrice: (amount: number, currency: string) => `${amount.toFixed(3)} ${currency}`,
};
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);

const { WhatsAppFab } = await import("../src/features/storefront-shell/components/WhatsAppFab");
const { MobileCartPeek } = await import("../src/features/checkout/components/MobileCartPeek");

describe("the hero on a phone", () => {
  it("starts in landscape 4:3, which leaves room for products", () => {
    expect(DEFAULT_HERO_MOBILE).toBe("landscape_4_3");
    expect(heroFrameSizingClass({ smartFit: false })).toContain("aspect-[4/3]");
  });

  it("tells the merchant how much of the first screen each shape takes", () => {
    expect(heroPhoneShare("landscape_4_3")).toBe(44);
    expect(heroPhoneShare("square_1_1")).toBe(59);
    expect(heroPhoneShare("portrait_4_5")).toBe(73);
    // Taller than the screen: the settings say so in words.
    expect(heroPhoneShare("story_9_16")).toBeGreaterThan(100);
    expect(heroPhoneShare(null)).toBe(44);
  });

  describe("in the database", () => {
    let db: PGlite;
    beforeAll(async () => {
      db = new PGlite();
      // The column as migration 20260928120000 made it (4:5 by default), with a store already on it.
      await db.exec(`CREATE TABLE public.business_settings (
          id serial PRIMARY KEY,
          brand_id text,
          hero_aspect_mobile text NOT NULL DEFAULT 'portrait_4_5'
            CHECK (hero_aspect_mobile IN ('portrait_4_5', 'story_9_16', 'square_1_1', 'landscape_4_3'))
        );
        INSERT INTO public.business_settings (brand_id) VALUES ('before');`);
      await db.exec(heroDefault);
    });

    it("gives a new store 4:3 and leaves every existing store's shape alone", async () => {
      await db.exec(`INSERT INTO public.business_settings (brand_id) VALUES ('new')`);
      const rows = (
        await db.query<{ brand_id: string; hero_aspect_mobile: string }>(
          "SELECT brand_id, hero_aspect_mobile FROM public.business_settings ORDER BY id",
        )
      ).rows;
      expect(rows).toEqual([
        { brand_id: "before", hero_aspect_mobile: "portrait_4_5" },
        { brand_id: "new", hero_aspect_mobile: "landscape_4_3" },
      ]);
    });
  });
});

describe("a section with one product on a phone", () => {
  it("sits in the middle; more than one scroll sideways", () => {
    expect(railPhoneAlign(1)).toBe("justify-center");
    expect(railPhoneAlign(2)).toBe("");
    expect(railPhoneAlign(0)).toBe("");
  });
});

describe("checkout on a phone", () => {
  it("is known by its address", () => {
    expect(isCheckoutPath("/pura/checkout")).toBe(true);
    expect(isCheckoutPath("/pura/checkout/")).toBe(true);
    expect(isCheckoutPath("/pura/product/x")).toBe(false);
    expect(isCheckoutPath("/pura/checkout-help")).toBe(false);
  });

  it("has no WhatsApp button; a product page raises it above the buy bar", () => {
    location.pathname = "/pura/checkout";
    const checkout = render(<WhatsAppFab />);
    expect(checkout.container.querySelector("a")).toBeNull();
    checkout.unmount();

    location.pathname = "/pura/product/p1";
    const product = render(<WhatsAppFab />);
    expect(product.container.querySelector("a")?.className).toContain("bottom-[calc(88px");
    product.unmount();
    location.pathname = "/pura";
  });

  const line = (id: string, name: string, price: number, qty: number, size: string | null) =>
    ({
      cart_line_id: id,
      variant_id: id,
      product_id: id,
      name,
      image: null,
      price,
      original_price: null,
      size,
      size_unit: null,
      color: null,
      fabric: null,
      qty,
      max_stock: 5,
      custom_fields: [],
    }) as unknown as CartItem;
  const cart = [line("a", "Taif dress", 8, 1, "54"), line("b", "Lujain dress", 12, 1, "54")];
  const ar = (arText: string) => arText;
  const en = (_ar: string, enText: string) => enText;

  it("shows what is being bought first: how many and the total, each piece on a tap", () => {
    render(<MobileCartPeek cart={cart} grandTotal={22} currency="BHD" lang="en" t={en} />);
    const toggle = screen.getByRole("button", { name: /Your order/ });
    expect(toggle).toHaveTextContent("2 items");
    expect(toggle).toHaveTextContent("22.000 BHD");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Taif dress/)).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Taif dress × 1")).toBeInTheDocument();
    expect(screen.getByText("12.000 BHD")).toBeInTheDocument();
  });

  it("counts the pieces the way Arabic says them", () => {
    const { rerender } = render(
      <MobileCartPeek cart={cart} grandTotal={22} currency="BHD" lang="ar" t={ar} />,
    );
    expect(screen.getByRole("button")).toHaveTextContent("قطعتان");
    rerender(<MobileCartPeek cart={[cart[0]]} grandTotal={8} currency="BHD" lang="ar" t={ar} />);
    expect(screen.getByRole("button")).toHaveTextContent("قطعة واحدة");
    rerender(
      <MobileCartPeek
        cart={[{ ...cart[0], qty: 3 }]}
        grandTotal={24}
        currency="BHD"
        lang="ar"
        t={ar}
      />,
    );
    expect(screen.getByRole("button")).toHaveTextContent("3 قطع");
  });

  it("is not there with an empty cart", () => {
    const { container } = render(
      <MobileCartPeek cart={[]} grandTotal={0} currency="BHD" lang="en" t={en} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
