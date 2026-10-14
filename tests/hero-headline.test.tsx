import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The hero's headline as live text (found 2026-10-15: Pura's hero video carried its title in the
// picture, and a compact hero showed 39% of the video's height on a wide screen, the title cut
// off). Phrases appear one after another, go round a few times and rest on the first.

const {
  headlinePhrases,
  headlineSettings,
  headlineStep,
  headlinePieces,
  heroScrim,
  HERO_TEXT_ALIGN_CLASS,
  HERO_TEXT_POSITION_CLASS,
} = await import("../src/lib/hero-headline");
const { HeroHeadline } = await import("../src/components/storefront/HeroHeadline");
const { HeroHeadlineFields } =
  await import("../src/features/settings/tabs/storefront/HeroHeadlineFields");

afterEach(() => vi.useRealTimers());

describe("a slide's phrases", () => {
  it("are its own in the reader's language, else the other language's, else its title", () => {
    const slide = { phrases_ar: ["قصة الفخامة تبدأ الآن", " ", "PURA LINE"], title_en: "Pura" };
    expect(headlinePhrases(slide, "ar")).toEqual(["قصة الفخامة تبدأ الآن", "PURA LINE"]);
    expect(headlinePhrases(slide, "en")).toEqual(["قصة الفخامة تبدأ الآن", "PURA LINE"]);
    expect(headlinePhrases({ title_en: "Pura Line", title_ar: "" }, "ar")).toEqual(["Pura Line"]);
    expect(headlinePhrases({}, "en")).toEqual([]);
  });

  it("are shown with blur-in for 3.5 seconds, three rounds, at the bottom, unless the store chose", () => {
    expect(headlineSettings({})).toEqual({
      animation: "blur_in",
      seconds: 3.5,
      loops: 3,
      position: "bottom",
      size: "m",
      align: "start",
    });
    expect(
      headlineSettings({
        text_animation: "rising_words",
        text_seconds: 30,
        text_loops: 0,
        text_position: "middle",
        text_size: "xl",
        align: "center",
      }),
    ).toEqual({
      animation: "rising_words",
      seconds: 8,
      loops: 1,
      position: "middle",
      size: "xl",
      align: "center",
    });
    expect(headlineSettings({ text_animation: "spin" as never }).animation).toBe("blur_in");
  });

  it("go round the given number of times, then rest on the first", () => {
    const shown = Array.from({ length: 8 }, (_, step) => headlineStep(step, 2, 3));
    expect(shown.map((s) => s.index)).toEqual([0, 1, 0, 1, 0, 1, 0, 0]);
    expect(shown.map((s) => s.done)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(headlineStep(0, 1, 3)).toEqual({ index: 0, done: true });
  });
});

describe("a phrase cut into rising words", () => {
  it("keeps Arabic words whole and a Latin run in one piece, so it reads in order", () => {
    expect(headlinePieces("لتكتمل حكايتكِ مع PURA LINE الراقية", "rtl")).toEqual([
      { text: "لتكتمل", dir: "rtl" },
      { text: "حكايتكِ", dir: "rtl" },
      { text: "مع", dir: "rtl" },
      { text: "PURA LINE", dir: "ltr" },
      { text: "الراقية", dir: "rtl" },
    ]);
    expect(headlinePieces("The story of بيورا لاين begins", "ltr")).toEqual([
      { text: "The", dir: "ltr" },
      { text: "story", dir: "ltr" },
      { text: "of", dir: "ltr" },
      { text: "بيورا لاين", dir: "rtl" },
      { text: "begins", dir: "ltr" },
    ]);
  });
});

describe("where the text sits", () => {
  it("is placed, aligned and shaded where the store chose", () => {
    expect(HERO_TEXT_POSITION_CLASS.middle).toBe("justify-center");
    expect(HERO_TEXT_ALIGN_CLASS.end).toContain("text-end");
    expect(heroScrim("bottom", 0.6, 0.2)).toMatch(/^linear-gradient\(to top, rgba\(0,0,0,0\.6\)/);
    expect(heroScrim("top", 0.6, 0.2)).toMatch(/^linear-gradient\(to bottom, rgba\(0,0,0,0\.6\)/);
    expect(heroScrim("middle", 0.6, 0.2)).toContain("rgba(0,0,0,0.51) 50%");
  });
});

describe("the headline on the page", () => {
  const phrases = ["قصة الفخامة تبدأ الآن", "تصاميم تُكمل يومك"];
  const shownText = () =>
    document.querySelector("[data-hero-phrase='shown']")?.textContent?.replace(/\s+/g, " ").trim();

  it("is one heading a screen reader reads once, with the phrases turning on time", () => {
    vi.useFakeTimers();
    render(
      <HeroHeadline phrases={phrases} animation="blur_in" seconds={3} loops={2} active dir="rtl" />,
    );
    expect(screen.getByRole("heading", { level: 1, name: phrases[0] })).toBeInTheDocument();
    expect(shownText()).toBe(phrases[0]);
    act(() => vi.advanceTimersByTime(3000));
    expect(shownText()).toBe(phrases[1]);
    // Two rounds (each phrase's timer is set once it shows), then it rests on the first and stays.
    const seen: (string | undefined)[] = [];
    for (let i = 0; i < 6; i += 1) {
      act(() => vi.advanceTimersByTime(3000));
      seen.push(shownText());
    }
    expect(seen).toEqual([phrases[0], phrases[1], phrases[0], phrases[0], phrases[0], phrases[0]]);
  });

  it("pauses while the pointer is on it", () => {
    vi.useFakeTimers();
    render(
      <HeroHeadline
        phrases={phrases}
        animation="rising_words"
        seconds={3}
        loops={3}
        active
        dir="rtl"
      />,
    );
    fireEvent.pointerEnter(screen.getByRole("heading"));
    for (let i = 0; i < 3; i += 1) act(() => vi.advanceTimersByTime(3000));
    expect(shownText()).toBe(phrases[0]);
    fireEvent.pointerLeave(screen.getByRole("heading"));
    act(() => vi.advanceTimersByTime(3000));
    expect(shownText()).toBe(phrases[1]);
  });

  it("stays still for a reader who asks for less motion", () => {
    vi.useFakeTimers();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as never;
    try {
      render(
        <HeroHeadline
          phrases={phrases}
          animation="blur_in"
          seconds={3}
          loops={3}
          active
          dir="rtl"
        />,
      );
      for (let i = 0; i < 3; i += 1) act(() => vi.advanceTimersByTime(3000));
      expect(shownText()).toBe(phrases[0]);
      expect(document.querySelector(".hero-phrase-blur")).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("the headline's settings", () => {
  it("take one phrase per line and the style the store picks", () => {
    const onChange = vi.fn();
    render(<HeroHeadlineFields idPrefix="s1" slide={{}} isAr={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Phrases — English"), {
      target: { value: "The story begins\nPURA LINE" },
    });
    expect(onChange).toHaveBeenCalledWith({ phrases_en: ["The story begins", "PURA LINE"] });
    expect(screen.getByRole("button", { name: "Blur-in" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Mask reveal" }));
    expect(onChange).toHaveBeenCalledWith({ text_animation: "mask_reveal" });
    fireEvent.click(screen.getByRole("button", { name: "Middle" }));
    expect(onChange).toHaveBeenCalledWith({ text_position: "middle" });
  });
});
