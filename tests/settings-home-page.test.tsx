import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The home page's settings were in four groups (found 2026-10-15): the trust bar's switch and place
// with the "new look" options and its badges with the footer, the brand story's switch and picture
// with the new look and its words with the hero, and the best sellers' switch twice. The Home page
// group now lists the sections in the order a shopper scrolls them, each holding all of itself.

const form = vi.hoisted(() => ({
  bs: {} as Record<string, unknown>,
  brand: { slug: "pura", name_en: "Pura", about_ar: "", about_en: "" } as Record<string, unknown>,
  setBs: vi.fn(),
  setBrand: vi.fn(),
}));
const formModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useBrandSettingsFormContext: () => ({
    form: { bs: form.bs, brand: form.brand },
    bs: form.bs,
    setBs: form.setBs,
    setBrand: form.setBrand,
    brandId: "b1",
  }),
});
vi.mock("../src/features/settings/use-brand-settings-form", (io) => formModule(io));
vi.mock("@/features/settings/use-brand-settings-form", (io) => formModule(io));
const addons = { useAddons: () => ({ addons: [] }) };
const addonsModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  ...addons,
});
vi.mock("../src/components/addons/AddonsProvider", (io) => addonsModule(io));
vi.mock("@/components/addons/AddonsProvider", (io) => addonsModule(io));
const r2 = { uploadPublicMedia: vi.fn() };
vi.mock("../src/lib/r2-upload", () => r2);
vi.mock("@/lib/r2-upload", () => r2);
const storefront = vi.hoisted(() => ({
  brand: {} as Record<string, unknown>,
  settings: {} as Record<string, unknown>,
  lang: "en",
  t: (_ar: string, en: string) => en,
}));
const storefrontModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => storefront,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const { filledPromoCards, homePageSections, homeSectionOn } =
  await import("../src/features/settings/tabs/storefront/home-page-sections");
const { HomeSectionsGroup } =
  await import("../src/features/settings/tabs/storefront/HomeSectionsGroup");
const { SettingsNavContext } = await import("../src/features/settings/GroupNavigator");
const { BrandStorySection } = await import("../src/components/storefront/BrandStorySection");
const { I18nProvider } = await import("../src/lib/i18n");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  form.bs = { storefront_design_version: 2, store_vertical: "abayas" };
  form.brand = { slug: "pura", name_en: "Pura", about_ar: "", about_en: "" };
});

const showGroup = (setActiveGroup = vi.fn()) => {
  render(
    <I18nProvider>
      <SettingsNavContext.Provider value={{ activeGroup: "home_sections", setActiveGroup }}>
        <HomeSectionsGroup />
      </SettingsNavContext.Provider>
    </I18nProvider>,
  );
  return setActiveGroup;
};

describe("the home page's sections", () => {
  it("are in the order a shopper scrolls them; the brand story is the new look's", () => {
    expect(homePageSections(true)).toEqual([
      "hero",
      "trust_bar",
      "promo_cards",
      "new",
      "best",
      "sale",
      "trending",
      "brand_story",
      "recently_viewed",
      "category_pages",
    ]);
    expect(homePageSections(false)).not.toContain("brand_story");
  });

  it("are on unless switched off, as the storefront reads them", () => {
    expect(homeSectionOn("trust_bar", {})).toBe(true);
    expect(homeSectionOn("trust_bar", { trust_bar_enabled: false })).toBe(false);
    expect(homeSectionOn("best", { show_best_sellers: false })).toBe(false);
    // The banner editor's own switch wins, as in publicSettingsFromPageData.
    expect(
      homeSectionOn("best", {
        show_best_sellers: false,
        homepage_editorial_sections: { best: { enabled: true } },
      }),
    ).toBe(true);
    expect(
      homeSectionOn("sale", { homepage_editorial_sections: { sale: { enabled: false } } }),
    ).toBe(false);
    expect(homeSectionOn("hero", {})).toBeNull();
  });

  it("count the promo cards the storefront shows: a picture or a title", () => {
    expect(
      filledPromoCards({
        home_promo_cards: [{ image_url: "a.jpg" }, { title_ar: "عرض" }, { href: "/x" }, null],
      }),
    ).toBe(2);
    expect(filledPromoCards({})).toBe(0);
  });
});

describe("the Home page group", () => {
  it("lists each section as one row, in order", () => {
    showGroup();
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Hero");
    expect(rows[1]).toHaveTextContent("Trust bar");
    expect(rows[7]).toHaveTextContent("Brand story");
    expect(screen.getByText("No cards yet: the section does not show")).toBeInTheDocument();
  });

  it("has one switch for the trust bar, which also clears the badges' older flag", () => {
    form.bs = { ...form.bs, trust_badges: { enabled: false, items: [] } };
    expect(homeSectionOn("trust_bar", form.bs)).toBe(false);
    showGroup();
    fireEvent.click(screen.getByRole("button", { name: /Trust bar/ }));
    expect(screen.queryByText(/Show Badges Bar/)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Show: Trust bar" }));
    expect(form.setBs).toHaveBeenCalledWith({
      trust_bar_enabled: true,
      trust_badges: { items: [], enabled: true },
    });
  });

  it("sends the hero to its own group", () => {
    const setActiveGroup = showGroup();
    fireEvent.click(screen.getByRole("button", { name: "Hero settings" }));
    expect(setActiveGroup).toHaveBeenCalledWith("home_hero");
  });

  it("switches best sellers once, keeping the older column in step", () => {
    showGroup();
    fireEvent.click(screen.getByRole("switch", { name: "Show: Best sellers" }));
    expect(form.setBs).toHaveBeenCalledWith(
      expect.objectContaining({
        show_best_sellers: false,
        homepage_editorial_sections: expect.objectContaining({
          best: expect.objectContaining({ enabled: false }),
        }),
      }),
    );
    expect(screen.getAllByRole("switch", { name: /Best sellers/ })).toHaveLength(1);
  });

  it("holds the trust bar's place and its badges together", () => {
    showGroup();
    fireEvent.click(screen.getByRole("button", { name: /Trust bar/ }));
    expect(screen.getByLabelText("Where it shows")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Show: Trust bar" }));
    expect(form.setBs).toHaveBeenCalledWith({ trust_bar_enabled: false });
  });

  it("shows the story the section will read until the store writes its own", () => {
    showGroup();
    fireEvent.click(screen.getByRole("button", { name: /Brand story/ }));
    const story = screen.getByLabelText("Story — English") as HTMLTextAreaElement;
    expect(story.placeholder.length).toBeGreaterThan(20);
    expect(screen.getByText(/You have not written your story yet/)).toBeInTheDocument();
    fireEvent.change(story, { target: { value: "Made in Manama" } });
    expect(form.setBrand).toHaveBeenCalledWith({ about_en: "Made in Manama" });
  });

  it("titles a section in grey with its default until the store names it", () => {
    showGroup();
    fireEvent.click(screen.getByRole("button", { name: /New arrivals/ }));
    expect(screen.getByLabelText("Title — English")).toHaveAttribute("placeholder", "New arrivals");
  });
});

describe("the brand story's picture", () => {
  it("is never a video file: a video slide gives its poster", () => {
    storefront.settings = { store_vertical: "abayas" };
    storefront.brand = {
      slug: "pura",
      name_en: "Pura",
      hero_media: {
        slides: [
          {
            type: "video",
            media_url: "https://media.boutq.store/hero/a.mp4",
            media_poster_url: "https://media.boutq.store/hero/a.webp",
          },
        ],
      },
    };
    const { container } = render(<BrandStorySection />);
    const sources = [...container.querySelectorAll("img, source")].map(
      (el) => el.getAttribute("src") ?? el.getAttribute("srcset") ?? "",
    );
    expect(sources.join(" ")).toContain("a.webp");
    expect(sources.join(" ")).not.toContain(".mp4");
  });
});
