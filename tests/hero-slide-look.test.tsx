import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The hero's shade and title colour were one store-wide setting in the design tab, far from the
// hero, so a light video and a dark one in the same hero could not both read well (found
// 2026-10-15). Each slide now chooses its look, starting from the store's default, and the
// slides fold to one row each so five of them are not several screens long.

const r2 = { uploadPublicMedia: vi.fn() };
vi.mock("../src/lib/r2-upload", () => r2);
vi.mock("@/lib/r2-upload", () => r2);
const optimizer = { VideoOptimizerDialog: () => null };
vi.mock("../src/components/admin/video/VideoOptimizerDialog", () => optimizer);
vi.mock("@/components/admin/video/VideoOptimizerDialog", () => optimizer);

const { HERO_DARK_TEXT, HERO_LOOK_PRESETS, heroScrim, slideLook } =
  await import("../src/lib/hero-headline");
const { moveSlide, openAfterDelete, openAfterMove, slideRowTitle } =
  await import("../src/features/settings/tabs/storefront/hero-slide-list");
const { HeroV2View } = await import("../src/components/storefront/HeroV2");
const { HeroSlidesEditor } =
  await import("../src/features/settings/tabs/storefront/HeroSlidesEditor");
const { HeroStoreLookFields } =
  await import("../src/features/settings/tabs/storefront/HeroLookFields");
const { I18nProvider } = await import("../src/lib/i18n");

describe("a slide's look", () => {
  it("follows the store's shade and title colour until the slide chooses its own", () => {
    const store = { hero_overlay_strength: 60, hero_title_color_v2: "#f5e6c8" };
    expect(slideLook({}, store)).toMatchObject({
      tone: "light",
      shade: 60,
      titleColor: "#f5e6c8",
    });
    expect(slideLook({}, {})).toMatchObject({ shade: 45, titleColor: undefined });
    expect(slideLook({ shade: 20, text_color: "#c9a96e" }, store)).toMatchObject({
      shade: 20,
      titleColor: "#c9a96e",
    });
    // A slide's shade of 0 is its choice, not "no choice".
    expect(slideLook({ shade: 0 }, store).shade).toBe(0);
  });

  it("over a light video is dark text on a light shade, never the store's light title colour", () => {
    const look = slideLook(HERO_LOOK_PRESETS.light_video, { hero_title_color_v2: "#ffffff" });
    expect(look).toMatchObject({ tone: "dark", shade: 35, titleColor: HERO_DARK_TEXT });
    expect(heroScrim("bottom", look.strong, look.soft, look.tone)).toMatch(
      /^linear-gradient\(to top, rgba\(255,255,255,0\.33\d\)/,
    );
    expect(heroScrim("bottom", 0.95, 0.45)).toMatch(/rgba\(0,0,0,0\.95\)/);
    // Going back to a dark video clears the slide's own colour too.
    expect(HERO_LOOK_PRESETS.dark_video).toEqual({ text_tone: "light", shade: 45, text_color: "" });
  });

  it("is what the storefront's hero draws, slide by slide", () => {
    const slide = (id: string, extra: object) => ({
      id,
      type: "text" as const,
      title_en: id,
      title_ar: "",
      body_en: "",
      body_ar: "",
      media_url: "",
      ...extra,
    });
    const { container } = render(
      <HeroV2View
        slides={[slide("Dark", {}), slide("Light", { text_tone: "dark", shade: 40 })]}
        settings={{ hero_overlay_strength: 100, hero_title_color_v2: "#f5e6c8" } as never}
        lang="en"
        brand={{ id: "b1", slug: "pura", name_en: "Pura", primary_color: null } as never}
      />,
    );
    expect(screen.getByRole("heading", { name: "Dark", hidden: true }).style.color).toBe(
      "rgb(245, 230, 200)",
    );
    expect(screen.getByRole("heading", { name: "Light", hidden: true }).style.color).toBe(
      "rgb(20, 20, 20)",
    );
    expect(container.innerHTML).toMatch(/linear-gradient\(to top, rgba\(0, 0, 0, 0\.95\)/);
    expect(container.innerHTML).toMatch(/linear-gradient\(to top, rgba\(255, 255, 255, 0\.38\)/);
  });
});

describe("the slides as a list", () => {
  it("moves a slide and keeps the open one open wherever it went", () => {
    expect(moveSlide(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveSlide(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveSlide(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(openAfterMove(0, 0, 2)).toBe(2);
    expect(openAfterMove(2, 0, 2)).toBe(1);
    expect(openAfterMove(0, 2, 0)).toBe(1);
    expect(openAfterMove(null, 0, 1)).toBeNull();
    expect(openAfterDelete(1, 1)).toBeNull();
    expect(openAfterDelete(2, 0)).toBe(1);
    expect(openAfterDelete(0, 1)).toBe(0);
  });

  it("names each row by its first phrase in the reader's language", () => {
    expect(slideRowTitle({ phrases_ar: ["قصة الفخامة"], phrases_en: ["Luxury"] }, "en")).toBe(
      "Luxury",
    );
    expect(slideRowTitle({ phrases_ar: ["قصة الفخامة"] }, "en")).toBe("قصة الفخامة");
    expect(slideRowTitle({ title_en: "Eid edit" }, "ar")).toBe("Eid edit");
    expect(slideRowTitle({}, "ar")).toBeNull();
  });
});

describe("the slides editor", () => {
  const slide = (id: string, phrase: string, extra: object = {}) => ({
    id,
    type: "text" as const,
    title_en: "",
    title_ar: "",
    body_en: "",
    body_ar: "",
    media_url: "",
    button_en: "",
    button_ar: "",
    button_href: "",
    phrases_en: [phrase],
    ...extra,
  });
  const livePreview = {
    version: 2,
    brand: { id: "b1", slug: "pura", name_en: "Pura", name_ar: null, primary_color: null },
    settings: { hero_overlay_strength: 50 },
  };
  const show = (slides = [slide("s1", "First story"), slide("s2", "Second story")]) => {
    const onChange = vi.fn();
    render(
      <I18nProvider>
        <HeroSlidesEditor
          brandId="b1"
          slides={slides}
          onChange={onChange}
          isAr={false}
          livePreview={livePreview}
        />
      </I18nProvider>,
    );
    return onChange;
  };

  it("folds every slide to a row that opens when tapped", () => {
    show();
    const first = screen.getByRole("button", { name: /First story/ });
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Phrases — English")).toBeNull();
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Phrases — English")).toHaveValue("First story");
  });

  it("moves a slide with its arrows", () => {
    const onChange = show();
    expect(screen.getByRole("button", { name: "Slide 1: move up" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Slide 1: move down" }));
    expect(onChange.mock.calls[0][0].map((s: { id: string }) => s.id)).toEqual(["s2", "s1"]);
  });

  it("sets a slide's look in one tap, from the store's default shade", () => {
    const onChange = show([slide("s1", "Only story")]);
    const look = screen.getByRole("group", { name: "The media behind the text" });
    expect(within(look).getByRole("button", { name: /Dark video/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/50% · From the store default/)).toBeInTheDocument();
    fireEvent.click(within(look).getByRole("button", { name: /Light video/ }));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "s1", text_tone: "dark", shade: 35, text_color: "" }),
    ]);
  });
});

describe("the store's default look", () => {
  it("sets the shade every slide starts from", () => {
    const onChange = vi.fn();
    render(
      <I18nProvider>
        <HeroStoreLookFields
          store={{ hero_overlay_strength: 45 }}
          isAr={false}
          onChange={onChange}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("group", { name: "Default for every slide" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Shade strength"), { target: { value: "60" } });
    expect(onChange).toHaveBeenCalledWith({ hero_overlay_strength: 60 });
  });
});
