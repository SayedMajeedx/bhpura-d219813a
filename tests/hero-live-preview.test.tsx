import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The hero settings showed only how the media would be cropped: the headline, its entrance,
// position, size and shade were seen only after saving and opening the store (found 2026-10-15).
// The settings now draw the storefront's own hero in a frame at the device's real width.

const {
  HERO_PREVIEW_DRAFT,
  HERO_PREVIEW_HEIGHT,
  HERO_PREVIEW_READY,
  fromParent,
  heroPreviewDraft,
  heroPreviewScale,
  phraseCountNote,
  readHeroPreviewDraft,
} = await import("../src/lib/hero-preview");
const { HeroLivePreview } =
  await import("../src/features/settings/tabs/storefront/HeroLivePreview");
const { HeroHeadlineFields } =
  await import("../src/features/settings/tabs/storefront/HeroHeadlineFields");

const brand = { id: "b1", slug: "pura", name_en: "Pura", name_ar: "بيورا", primary_color: null };

describe("what the preview frame draws", () => {
  it("is a draft of the store, its settings and the slide, and nothing else", () => {
    const draft = heroPreviewDraft({
      brand,
      settings: { hero_height_desktop: "compact" },
      slides: [{ id: "s1", phrases_ar: ["قصة الفخامة"] }],
      background: null,
      lang: "ar",
      replay: 2,
    });
    expect(readHeroPreviewDraft(draft)).toEqual(draft);
    expect(readHeroPreviewDraft({ ...draft, type: "other" })).toBeNull();
    expect(readHeroPreviewDraft({ ...draft, brand: { slug: "pura" } })).toBeNull();
    expect(readHeroPreviewDraft({ ...draft, slides: ["x"] })).toBeNull();
    expect(readHeroPreviewDraft("hello")).toBeNull();
    expect(readHeroPreviewDraft({ ...draft, lang: "fr" })?.lang).toBe("ar");
  });

  it("comes only from the page that holds the frame", () => {
    const parent = {};
    const own = { origin: "https://www.boutq.store", parent };
    expect(fromParent({ origin: own.origin, source: parent as never }, own)).toBe(true);
    expect(fromParent({ origin: "https://evil.example", source: parent as never }, own)).toBe(
      false,
    );
    expect(fromParent({ origin: own.origin, source: {} as never }, own)).toBe(false);
  });

  it("is scaled down to the width the settings page has, never up", () => {
    expect(heroPreviewScale("desktop", 720)).toBe(0.5);
    expect(heroPreviewScale("mobile", 780)).toBe(1);
    expect(heroPreviewScale("desktop", 0)).toBe(1);
  });

  it("notes when the Arabic and English headlines differ in length", () => {
    expect(phraseCountNote({ phrases_ar: ["أ", "ب"], phrases_en: ["a", " "] }, "en")).toBe(
      "2 Arabic phrases and 1 English: an English visitor sees a different story.",
    );
    expect(phraseCountNote({ phrases_ar: ["أ"], phrases_en: ["a"] }, "ar")).toBeNull();
    expect(phraseCountNote({ phrases_ar: ["أ", "ب"] }, "ar")).toBeNull();
  });
});

describe("the live preview in the settings", () => {
  const show = () =>
    render(
      <HeroLivePreview
        brand={brand}
        settings={{ hero_height_desktop: "standard" }}
        slide={{ id: "s1", phrases_ar: ["قصة الفخامة"] }}
        background={null}
        isAr={false}
      />,
    );
  const frame = () => screen.getByTitle("Hero preview") as HTMLIFrameElement;
  const fromFrame = (data: unknown) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data,
          origin: window.location.origin,
          source: frame().contentWindow,
        }),
      );
    });

  it("draws the store's hero once the frame is ready, and plays it again on demand", () => {
    show();
    const post = vi.spyOn(frame().contentWindow!, "postMessage");
    expect(post).not.toHaveBeenCalled();
    fromFrame({ type: HERO_PREVIEW_READY });
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: HERO_PREVIEW_DRAFT,
        brand,
        slides: [{ id: "s1", phrases_ar: ["قصة الفخامة"] }],
        lang: "en",
        replay: 0,
      }),
      window.location.origin,
    );
    fireEvent.click(screen.getByRole("button", { name: /Replay/ }));
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ replay: 1 }),
      window.location.origin,
    );
    fireEvent.click(screen.getByRole("button", { name: "ع" }));
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ lang: "ar" }),
      window.location.origin,
    );
  });

  it("is drawn at a laptop's width or a phone's, and takes the hero's height", () => {
    show();
    expect(frame().style.width).toBe("1440px");
    fromFrame({ type: HERO_PREVIEW_HEIGHT, height: 520 });
    expect(frame().style.height).toBe("520px");
    fireEvent.click(screen.getByRole("button", { name: /Phone/ }));
    expect(frame().style.width).toBe("390px");
  });

  it("ignores messages that are not from its frame", () => {
    show();
    const post = vi.spyOn(frame().contentWindow!, "postMessage");
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: HERO_PREVIEW_READY },
          origin: "https://evil.example",
        }),
      );
    });
    expect(post).not.toHaveBeenCalled();
  });
});

describe("a slide's text on the V2 hero", () => {
  it("opens an old slide's title as its first phrase, and its phrases then replace the title", () => {
    const onChange = vi.fn();
    render(
      <HeroHeadlineFields
        idPrefix="s1"
        slide={{ title_ar: "بيورا لاين", title_en: "Pura Line" }}
        isAr={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Phrases — English")).toHaveValue("Pura Line");
    fireEvent.change(screen.getByLabelText("Phrases — English"), { target: { value: "" } });
    // Emptied here, empty in the store too: the title does not come back.
    expect(onChange).toHaveBeenCalledWith({ phrases_en: [""], title_en: "" });
  });

  it("has a line under the headline and a button on every kind of slide", () => {
    const onChange = vi.fn();
    render(
      <HeroHeadlineFields
        idPrefix="s1"
        slide={{ button_ar: "تسوّق الآن", phrases_ar: ["أ", "ب"], phrases_en: ["a"] }}
        isAr={false}
        onChange={onChange}
        withText
      />,
    );
    expect(screen.getByLabelText("Button — Arabic")).toHaveValue("تسوّق الآن");
    fireEvent.change(screen.getByLabelText("Line under the headline — English"), {
      target: { value: "Crafted with care" },
    });
    expect(onChange).toHaveBeenCalledWith({ body_en: "Crafted with care" });
    fireEvent.change(screen.getByLabelText("Button link"), { target: { value: "/pura/new" } });
    expect(onChange).toHaveBeenCalledWith({ button_href: "/pura/new" });
    expect(screen.getByText(/2 Arabic phrases and 1 English/)).toBeInTheDocument();
  });
});
