import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicSettingsFromPageData } from "../src/features/storefront-shell/lib/public-settings";
import type { Brand } from "../src/lib/storefront-context";

// Where each engine-scoped setting is honoured: the settings screens hide what
// the active engine cannot read, and the Storefront 2.0 components use theirs.
// The rules themselves are unit-tested in tests/storefront-engine-scoping.test.ts.

const form = vi.hoisted(() => {
  const state = {
    bs: {} as Record<string, unknown>,
    brand: { slug: "pura", name_en: "Pura" } as Record<string, unknown>,
  };
  return {
    state,
    context: () => ({
      form: { bs: state.bs, brand: state.brand },
      bs: state.bs,
      setBs: vi.fn(),
      patchBs: vi.fn(),
      setBrand: vi.fn(),
      brandId: "b1",
      isDirty: false,
      dirtyCount: 0,
      isSaving: false,
      save: vi.fn(),
      reset: vi.fn(),
    }),
  };
});
const storefront = vi.hoisted(() => ({
  brand: { id: "b1", slug: "pura", name_en: "Pura", primary_color: null, hero_media: null },
  settings: {} as Record<string, unknown>,
  lang: "en",
  t: (_ar: string, en: string) => en,
  currency: "BHD",
  wishlist: [] as string[],
  toggleWishlist: () => undefined,
  addToCart: () => undefined,
}));
const settingsFormModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useBrandSettingsFormContext: form.context,
});
vi.mock("../src/features/settings/use-brand-settings-form", (io) => settingsFormModule(io));
vi.mock("@/features/settings/use-brand-settings-form", (io) => settingsFormModule(io));
const storefrontModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => storefront,
  useStoreModules: () => ({}),
});
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));
// The storefront tab's groups are listed, not rendered.
const navigator = {
  GroupNavigator: ({ groups }: { groups: Array<{ id: string }> }) => (
    <ul>
      {groups.map((group) => (
        <li key={group.id}>{group.id}</li>
      ))}
    </ul>
  ),
};
const navigatorModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  ...navigator,
});
vi.mock("../src/features/settings/GroupNavigator", (io) => navigatorModule(io));
vi.mock("@/features/settings/GroupNavigator", (io) => navigatorModule(io));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));

const { StorefrontTab } = await import("../src/features/settings/tabs/storefront/StorefrontTab");
const { HeaderFooterGroup } =
  await import("../src/features/settings/tabs/storefront/HeaderFooterGroup");
const { SettingsHeader } = await import("../src/features/settings/SettingsHeader");
const { PaletteGroup } = await import("../src/features/settings/tabs/identity/PaletteGroup");
const { HomeHeroGroup } = await import("../src/features/settings/tabs/storefront/HomeHeroGroup");
const { HeroV2 } = await import("../src/components/storefront/HeroV2");
const { ProductCardV2 } = await import("../src/components/storefront/ProductCardV2");
const { I18nProvider } = await import("../src/lib/i18n");

const withI18n = (node: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>{node}</I18nProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  localStorage.setItem("lang", "en");
  storefront.settings = {};
});

describe("settings for the one storefront", () => {
  it("shows every store the product card & page group, and no upgrade to offer", () => {
    form.state.bs = {};
    withI18n(<StorefrontTab />);
    expect(screen.getByText("design_v2")).toBeInTheDocument();
    expect(screen.queryByText("upgrade")).not.toBeInTheDocument();
  });

  it("shows the simple footer's controls by the footer chosen", () => {
    const showsName = (bs: Record<string, unknown>) => {
      form.state.bs = { ...bs, trust_badges: { items: [] } };
      const view = withI18n(<HeaderFooterGroup />);
      const shown = Boolean(screen.queryByText("Show store name in footer"));
      view.unmount();
      return shown;
    };
    expect(showsName({})).toBe(false);
    expect(showsName({ footer_layout: "simple" })).toBe(true);
  });

  it("no longer offers the classic hero's typography; the footer's colours stay", () => {
    localStorage.setItem("boutq_settings_level", "advanced");
    const shows = (group: React.ReactNode, bs: Record<string, unknown>, text: string) => {
      form.state.bs = bs;
      const view = withI18n(group);
      const shown = Boolean(screen.queryByText(text));
      view.unmount();
      return shown;
    };
    try {
      expect(shows(<HomeHeroGroup />, {}, "Show brand name in hero")).toBe(false);
      expect(shows(<HomeHeroGroup />, {}, "Advanced Hero Title Styling")).toBe(false);
      const footer = { trust_badges: { items: [] } };
      expect(shows(<HeaderFooterGroup />, footer, "Footer colours")).toBe(true);
      expect(shows(<PaletteGroup />, {}, "Footer BG")).toBe(false);
    } finally {
      localStorage.removeItem("boutq_settings_level");
    }
  });

  it("keeps retired settings out of search results", () => {
    form.state.bs = {};
    withI18n(<SettingsHeader activeTab="general" onTabChange={vi.fn()} />);
    const box = screen.getAllByRole("textbox")[0];
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "hero title size" } });
    // hero_title_size was read by the classic hero only.
    expect(screen.queryByText("Hero Title Size (px)")).toBeNull();
  });
});

describe("Storefront 2.0 hero controls are consumed", () => {
  const slide = {
    id: "s1",
    type: "image" as const,
    title_en: "Eid edit",
    title_ar: "",
    body_en: "",
    body_ar: "",
    media_url: "https://media.boutq.store/brands/x/hero/a.jpg",
    media_url_en: "https://media.boutq.store/brands/x/hero/a.jpg",
  };

  it("drives the hero scrim from hero_overlay_strength and colours the title when set", () => {
    storefront.settings = { hero_overlay_strength: 100, hero_title_color_v2: "#f5e6c8" };
    const strong = render(<HeroV2 slides={[slide]} />);
    expect(strong.container.innerHTML).toMatch(/linear-gradient\(to top, rgba\(0, 0, 0, 0\.95\)/);
    expect(screen.getByRole("heading", { name: "Eid edit" }).style.color).toBe(
      "rgb(245, 230, 200)",
    );
    strong.unmount();

    storefront.settings = { hero_overlay_strength: 0 };
    render(<HeroV2 slides={[slide]} />);
    expect(screen.getByRole("heading", { name: "Eid edit" }).style.color).toBe("");
  });

  it("propagates both fields through the storefront loader", () => {
    const brand = { id: "b1", slug: "pura", name_en: "Pura" } as Brand;
    const load = (settings: Record<string, unknown>) =>
      publicSettingsFromPageData(brand, { brand, settings } as never);
    expect(load({})).toMatchObject({ hero_overlay_strength: 45, hero_title_color_v2: null });
    expect(load({ hero_overlay_strength: 70, hero_title_color_v2: "#fff" })).toMatchObject({
      hero_overlay_strength: 70,
      hero_title_color_v2: "#fff",
    });
  });
});

describe("Storefront 2.0 respects catalog (inquiry-only) mode", () => {
  const product = {
    id: "p1",
    name: "Silk Abaya",
    name_en: "Silk Abaya",
    base_price: 30,
    image_url: "https://media.boutq.store/p1.jpg",
    product_variants: [{ id: "v1", size: "52", selling_price: 30, stock_main: 3 }],
  };

  it("suppresses quick view and grid quick-add when there is no cart", () => {
    storefront.settings = { storefront_design_version: 2 };
    const shop = withI18n(<ProductCardV2 product={product} />);
    expect(screen.getAllByRole("button", { name: "Quick view" }).length).toBeGreaterThan(0);
    shop.unmount();

    storefront.settings = { storefront_design_version: 2, storefront_mode: "catalog" };
    withI18n(<ProductCardV2 product={product} />);
    expect(screen.queryByRole("button", { name: "Quick view" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add to (cart|bag)/i })).not.toBeInTheDocument();
  });
});

describe("a card on a mouse's rest does one thing", () => {
  const product = {
    id: "p2",
    name: "Linen Abaya",
    name_en: "Linen Abaya",
    base_price: 30,
    image_url: "https://media.boutq.store/front.jpg",
    media: [
      { type: "image", url: "https://media.boutq.store/front.jpg" },
      { type: "image", url: "https://media.boutq.store/back.jpg" },
    ],
    product_variants: [{ id: "v1", size: "52", selling_price: 30, stock_main: 3 }],
  };
  const photos = () => Array.from(document.querySelectorAll("img"));

  it("fades its second photo in over the first, and neither lifts nor recolours", () => {
    storefront.settings = { storefront_design_version: 2 };
    const { container } = withI18n(<ProductCardV2 product={product} />);
    expect(photos()).toHaveLength(1);
    const card = container.querySelector("[data-product-id='p2']") as HTMLElement;
    fireEvent.pointerEnter(card, { pointerType: "mouse" });
    const [front, back] = photos();
    expect(front.getAttribute("src")).toContain("front.jpg");
    expect(back.getAttribute("src")).toContain("back.jpg");
    expect(back.className).toContain("opacity-100");
    fireEvent.pointerLeave(card);
    expect(photos()[1].className).toContain("opacity-0");
    expect(container.innerHTML).not.toMatch(
      /hover:-translate-y|group-hover:shadow|group-hover:text-primary/,
    );
  });

  it("keeps its first photo under a finger: a tap opens the product, nothing else", () => {
    storefront.settings = { storefront_design_version: 2 };
    const { container } = withI18n(<ProductCardV2 product={product} />);
    const card = container.querySelector("[data-product-id='p2']") as HTMLElement;
    fireEvent.pointerEnter(card, { pointerType: "touch" });
    fireEvent.pointerEnter(card, { pointerType: "pen" });
    expect(photos()).toHaveLength(1);
    expect(photos()[0].getAttribute("src")).toContain("front.jpg");
  });

  it("with one photo, lets it grow a touch instead", () => {
    storefront.settings = { storefront_design_version: 2 };
    withI18n(<ProductCardV2 product={{ ...product, media: [] }} />);
    expect(photos()[0].className).toContain("group-hover:scale-[1.02]");
  });
});

describe("Storefront 2.0 cards for made-to-order items and services", () => {
  it("never shows a service or made-to-order item as sold out, and says how long a service lasts", () => {
    storefront.settings = { storefront_design_version: 2 };
    const service = {
      id: "s1",
      name: "Photo booth",
      name_en: "Photo booth",
      base_price: 40,
      image_url: null,
      is_made_to_order: true,
      item_kind: "service",
      product_variants: [
        { id: "v3", size: "3 hours", selling_price: 40, stock_main: 0, duration_minutes: 180 },
        { id: "v8", size: "8 hours", selling_price: 90, stock_main: 0, duration_minutes: 480 },
      ],
    };
    const card = withI18n(<ProductCardV2 product={service} />);
    expect(screen.queryByText(/sold out|out of stock/i)).not.toBeInTheDocument();
    expect(screen.getByText("3–8 hours")).toBeInTheDocument();
    card.unmount();

    // A stocked product with none left is still sold out.
    withI18n(
      <ProductCardV2
        product={{
          ...service,
          id: "p2",
          is_made_to_order: false,
          item_kind: "product",
          product_variants: [{ id: "v1", size: "52", selling_price: 30, stock_main: 0 }],
        }}
      />,
    );
    expect(screen.getByText(/sold out/i)).toBeInTheDocument();
    expect(screen.queryByText(/hours/)).not.toBeInTheDocument();
  });
});

describe("Storefront 2.0 cards show a sale", () => {
  // Pura's Sabika: two sizes at 23 (was 30) at a partner, one made to order at 30. The card read
  // a `products.original_price` that does not exist, so no new-look card ever showed a sale.
  const sabika = {
    id: "p3",
    name: "Sabika",
    name_en: "Sabika",
    base_price: 30,
    image_url: null,
    is_made_to_order: true,
    product_variants: [
      {
        id: "v54",
        size: "54",
        selling_price: 23,
        original_price: 30,
        stock_main: 0,
        stock_incubator: 1,
      },
      {
        id: "v55",
        size: "55",
        selling_price: 23,
        original_price: 30,
        stock_main: 0,
        stock_incubator: 1,
      },
      { id: "v56", size: "56", selling_price: 30, original_price: null, stock_main: 0 },
    ],
  };

  it("strikes the was price beside a price range and shows the discount", () => {
    storefront.settings = { storefront_design_version: 2 };
    withI18n(<ProductCardV2 product={sabika} />);
    expect(screen.getByText("-23%")).toBeInTheDocument();
    const was = screen.getByText(/30\.000/);
    expect(was).toHaveClass("line-through");
    expect(screen.getByText(/From/)).toHaveTextContent(/23\.000/);
  });

  it("follows the store's and the product's sale badge switches", () => {
    storefront.settings = { storefront_design_version: 2, global_sale_badges_enabled: false };
    const card = withI18n(<ProductCardV2 product={sabika} />);
    expect(screen.queryByText("-23%")).not.toBeInTheDocument();
    card.unmount();

    storefront.settings = { storefront_design_version: 2 };
    withI18n(<ProductCardV2 product={{ ...sabika, show_sale_badge: false }} />);
    expect(screen.queryByText("-23%")).not.toBeInTheDocument();
  });
});

describe("the cards' photo shape", () => {
  const product = {
    id: "p1",
    name: "Pecan baklava",
    name_en: "Pecan baklava",
    base_price: 7,
    image_url: "https://media.boutq.store/p1.jpg",
    product_variants: [{ id: "v1", size: "650", selling_price: 7, stock_main: 3 }],
  };
  const frame = () => screen.getByRole("img", { name: "Pecan baklava" }).closest("div.rounded-xl");

  it("follows the store's kind of goods until the store chooses a shape", () => {
    storefront.settings = { storefront_design_version: 2, store_vertical: "food" };
    const food = withI18n(<ProductCardV2 product={product} />);
    expect(frame()?.className).toContain("aspect-square");
    food.unmount();

    storefront.settings = { storefront_design_version: 2, store_vertical: "abayas" };
    const abayas = withI18n(<ProductCardV2 product={product} />);
    expect(frame()?.className).toContain("aspect-[3/4]");
    abayas.unmount();

    storefront.settings = {
      storefront_design_version: 2,
      store_vertical: "food",
      product_card_aspect_ratio: "4:5",
    };
    withI18n(<ProductCardV2 product={product} />);
    expect(frame()?.className).toContain("aspect-[4/5]");
  });

  it("is carried by the storefront loader, empty until the store chooses", () => {
    const brand = { id: "b1", slug: "habybee", name_en: "Habybee" } as Brand;
    const load = (settings: Record<string, unknown>) =>
      publicSettingsFromPageData(brand, { brand, settings } as never);
    expect(load({})).toMatchObject({ product_card_aspect_ratio: null });
    expect(load({ product_card_aspect_ratio: "1:1" })).toMatchObject({
      product_card_aspect_ratio: "1:1",
    });
  });
});
