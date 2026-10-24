import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The product page's details section, and what else a shopper reads around it. It once printed
// "No additional description", told every fashion product to "hand wash cold or dry clean" when
// the store wrote nothing, titled one store-wide text "Fragrance Notes" as if it were each
// perfume's, and gave abaya stores the general store's words.

const store = vi.hoisted(() => ({
  lang: "en" as "ar" | "en",
  settings: {} as Record<string, unknown>,
}));
const storefront = vi.hoisted(() => () => ({
  useStorefront: () => ({
    brand: { id: "b1", slug: "store" },
    lang: store.lang,
    currency: "BHD",
    t: (ar: string, en: string) => (store.lang === "ar" ? ar : en),
    settings: store.settings,
  }),
  formatPrice: (amount: number) => `${amount.toFixed(3)} BHD`,
}));
vi.mock("../src/lib/storefront-context", storefront);
vi.mock("@/lib/storefront-context", storefront);
const returnsData = vi.hoisted(() => () => ({
  returnsQueries: { policy: () => ({ queryKey: ["details-policy"], queryFn: async () => null }) },
}));
vi.mock("../src/lib/data/returns", returnsData);
vi.mock("@/lib/data/returns", returnsData);
// The store's word for the fabric axis (a roastery's would be the process).
const axes = vi.hoisted(() => () => ({
  useStoreAxisDefaults: () => ({ fabric: { ar: "الخامة", en: "Fabric" } }),
}));
vi.mock("../src/lib/variant-axes", axes);
vi.mock("@/lib/variant-axes", axes);
vi.mock("../src/lib/storefront-tracking", () => ({ trackProductEngagement: vi.fn() }));
vi.mock("@/lib/storefront-tracking", () => ({ trackProductEngagement: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/store/book">{children}</a>,
}));

const { ProductAccordion } = await import("../src/components/storefront/ProductAccordion");
const { ServiceMobileBookBar } =
  await import("../src/features/product-page/components/ServiceMobileBookBar");
const { getVerticalVocabularyOverrides } = await import("../src/lib/store-vocabulary");
const { occasionLabel } = await import("../src/lib/product-occasion");
const { printStampsManifest } = await import("../src/addons/print-stamps/manifest");

type Product = React.ComponentProps<typeof ProductAccordion>["product"];
const abaya = (over: Record<string, unknown> = {}) =>
  ({ id: "p1", product_variants: [], ...over }) as unknown as Product;

const page = (props: Partial<React.ComponentProps<typeof ProductAccordion>> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductAccordion {...props} />
    </QueryClientProvider>,
  );
const sectionButtons = () => screen.getAllByRole("button");

beforeEach(() => {
  store.lang = "en";
  store.settings = { store_vertical: "abayas" };
});

describe("the product page's details", () => {
  it("shows the product's own fabric and occasion, in an abaya store's fashion words", () => {
    page({
      description: "A black abaya.",
      product: abaya({ fabric_type: "Royal crepe", occasion: "سهرة" }),
    });
    const titles = sectionButtons().map((b) => b.textContent);
    expect(titles).toContain("Fabric & Details");
    // The description starts open; the details open on a tap.
    fireEvent.click(screen.getByRole("button", { name: "Fabric & Details" }));
    expect(screen.getByText("Royal crepe")).toBeTruthy();
    expect(screen.getByText("Fabric")).toBeTruthy();
    expect(screen.getByText("Occasion")).toBeTruthy();
    expect(screen.getByText("Evening")).toBeTruthy();
  });

  it("never invents care instructions, and says none when the store wrote none", () => {
    page({ description: "A black abaya.", product: abaya() });
    expect(screen.queryByRole("button", { name: /Fabric|Care/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/hand wash|dry clean/i);
  });

  it("leaves out an empty description and opens what there is", () => {
    store.settings = { store_vertical: "abayas", fabric_care_en: "Dry clean only." };
    page({ description: "  ", product: abaya({ fabric_type: "Linen" }) });
    expect(screen.queryByText(/No additional description/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Description/ })).toBeNull();
    const details = screen.getByRole("button", {
      name: "Fabric & Details · Washing & Care Instructions",
    });
    expect(details.getAttribute("aria-expanded")).toBe("true");
    // A closed section still says it is closed.
    expect(
      screen.getByRole("button", { name: /Shipping|Returns/ }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.getByText("Linen")).toBeTruthy();
    expect(screen.getByText("Dry clean only.")).toBeTruthy();
  });

  it("titles the store's own text as what it is, never as the product's notes", () => {
    store.settings = { store_vertical: "fragrance", fabric_care_en: "Spray on pulse points." };
    page({ description: "Oud and rose.", product: abaya() });
    expect(screen.getByRole("button", { name: "Usage Guidelines" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Fragrance Notes/ })).toBeNull();
  });

  it("writes occasions in the reader's language", () => {
    store.lang = "ar";
    page({ description: "عباية.", product: abaya({ occasion: "إطلالة رسمية" }) });
    fireEvent.click(screen.getByRole("button", { name: "الخامة والتفاصيل" }));
    expect(screen.getByText("المناسبة")).toBeTruthy();
    expect(screen.getByText("إطلالة رسمية")).toBeTruthy();
    expect(occasionLabel("إطلالة رسمية", "en")).toBe("Formal");
    expect(occasionLabel("Beach", "en")).toBe("Beach");
    expect(occasionLabel("  ", "en")).toBeNull();
  });
});

describe("a vertical's words", () => {
  it("come from its family when it has none of its own", () => {
    expect(getVerticalVocabularyOverrides("abayas").specifications_label?.en).toBe(
      "Fabric & Details",
    );
    expect(getVerticalVocabularyOverrides("fragrance").specifications_label?.en).toBe(
      "Fragrance Notes",
    );
    expect(getVerticalVocabularyOverrides("jewelry").specifications_label?.en).toBe(
      "Materials & Details",
    );
    expect(getVerticalVocabularyOverrides("home").specifications_label?.en).toBe(
      "Dimensions & Materials",
    );
    expect(getVerticalVocabularyOverrides("general")).toEqual({});
    expect(getVerticalVocabularyOverrides(null)).toEqual({});
  });
});

describe("asking on WhatsApp from a phone's product page", () => {
  it("is a button in a service's bar, named for what it does", () => {
    render(
      <ServiceMobileBookBar productId="s1" fromPrice={20} askUrl="https://wa.me/973?text=hi" />,
    );
    const ask = screen.getByRole("link", { name: "Ask about this product on WhatsApp" });
    expect(ask.getAttribute("href")).toBe("https://wa.me/973?text=hi");
    expect(within(document.body).getByRole("link", { name: /Book now/ })).toBeTruthy();
  });

  it("is left out when the store takes no WhatsApp messages", () => {
    render(<ServiceMobileBookBar productId="s1" fromPrice={20} askUrl={null} />);
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull();
  });
});

describe("a print store's file", () => {
  it("is uploaded, not pasted as a link", () => {
    const fields = (printStampsManifest.contributions.customFieldPresets ?? []).flatMap(
      (preset) => preset.fields as Array<{ key: string; type: string }>,
    );
    expect(fields.find((field) => field.key === "logo_upload")?.type).toBe("file");
  });
});
