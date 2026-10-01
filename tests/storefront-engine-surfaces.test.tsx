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
vi.mock("../src/features/settings/GroupNavigator", () => navigator);
vi.mock("@/features/settings/GroupNavigator", () => navigator);
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

const v1 = { storefront_design_version: 1 };
const v2 = { storefront_design_version: 2 };
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

describe("settings UI honours the scopes", () => {
  it("hides the Storefront 2.0 group on a classic storefront", () => {
    form.state.bs = v1;
    const classic = withI18n(<StorefrontTab />);
    expect(screen.queryByText("design_v2")).not.toBeInTheDocument();
    classic.unmount();
    form.state.bs = v2;
    withI18n(<StorefrontTab />);
    expect(screen.getByText("design_v2")).toBeInTheDocument();
  });

  it("gates the classic footer controls on the resolved footer, not the engine", () => {
    const showsName = (bs: Record<string, unknown>) => {
      form.state.bs = { ...bs, trust_badges: { items: [] } };
      const view = withI18n(<HeaderFooterGroup />);
      const shown = Boolean(screen.queryByText("Show store name in footer"));
      view.unmount();
      return shown;
    };
    expect(showsName(v1)).toBe(true);
    expect(showsName(v2)).toBe(false);
    // An explicit simple footer on Storefront 2.0 still reads the classic controls.
    expect(showsName({ ...v2, footer_layout: "simple" })).toBe(true);
  });

  it("hides the classic hero typography and footer colours when their surface is not used", () => {
    localStorage.setItem("boutq_settings_level", "advanced");
    const shows = (group: React.ReactNode, bs: Record<string, unknown>, text: string) => {
      form.state.bs = bs;
      const view = withI18n(group);
      const shown = Boolean(screen.queryByText(text));
      view.unmount();
      return shown;
    };
    try {
      expect(shows(<HomeHeroGroup />, v1, "Show brand name in hero")).toBe(true);
      expect(shows(<HomeHeroGroup />, v2, "Show brand name in hero")).toBe(false);
      expect(shows(<PaletteGroup />, v1, "Footer BG")).toBe(true);
      expect(shows(<PaletteGroup />, v2, "Footer BG")).toBe(false);
    } finally {
      localStorage.removeItem("boutq_settings_level");
    }
  });

  it("keeps inapplicable settings out of search results", () => {
    const search = (bs: Record<string, unknown>) => {
      form.state.bs = bs;
      const view = withI18n(<SettingsHeader activeTab="general" onTabChange={vi.fn()} />);
      const box = screen.getAllByRole("textbox")[0];
      fireEvent.focus(box);
      fireEvent.change(box, { target: { value: "hero title size" } });
      const found = Boolean(screen.queryByText("Hero Title Size (px)"));
      view.unmount();
      return found;
    };
    // hero_title_size is read by the classic hero only.
    expect(search(v1)).toBe(true);
    expect(search(v2)).toBe(false);
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
