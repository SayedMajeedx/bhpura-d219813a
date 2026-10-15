import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The hero's last settings refinement (2026-10-15): the speed of the phrases in a merchant's
// words, a different place and size for the text on a phone, and a check, on the slide's own
// picture, that the headline can be read where it sits.

const picture = vi.hoisted(() => ({
  pixels: null as null | { data: Uint8ClampedArray; width: number; height: number; aspect: number },
}));
const pixelsModule = { useImagePixels: () => picture.pixels };
vi.mock("../src/features/settings/tabs/storefront/use-image-pixels", () => pixelsModule);

const { HERO_PACES, headlineSettings, paceOf } = await import("../src/lib/hero-headline");
const {
  bandPixels,
  contrastAdvice,
  contrastRatio,
  heroTextContrast,
  parseCssColor,
  scrimAlphaAt,
  shadeInBand,
  visibleMediaRows,
  worstBackground,
} = await import("../src/lib/hero-contrast");
const { slideContrast } =
  await import("../src/features/settings/tabs/storefront/hero-contrast-check");
const { HeroContrastNote, adviceLookPatch } =
  await import("../src/features/settings/tabs/storefront/HeroContrastNote");
const { HeroHeadlineFields } =
  await import("../src/features/settings/tabs/storefront/HeroHeadlineFields");
const { HeroV2View } = await import("../src/components/storefront/HeroV2");

/** A picture of one colour, as the sampler gives it. */
const flat = (rgb: [number, number, number], width = 4, height = 4, aspect = 16 / 9) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([...rgb, 255], i * 4);
  return { data, width, height, aspect };
};

describe("the pace of the phrases", () => {
  it("is calm, medium or lively, or the number the store typed", () => {
    expect(HERO_PACES).toEqual({ calm: 5, medium: 3.5, lively: 2.5 });
    expect(paceOf({})).toBe("medium");
    expect(paceOf({ text_seconds: 5 })).toBe("calm");
    expect(paceOf({ text_seconds: 4 })).toBeNull();
  });

  it("is set in one tap", () => {
    const onChange = vi.fn();
    render(
      <HeroHeadlineFields
        idPrefix="s1"
        slide={{ text_seconds: 4 }}
        isAr={false}
        onChange={onChange}
      />,
    );
    const pace = screen.getByRole("group", { name: "Pace" });
    for (const button of Array.from(pace.querySelectorAll("button"))) {
      expect(button).toHaveAttribute("aria-pressed", "false");
    }
    fireEvent.click(screen.getByRole("button", { name: /Lively/ }));
    expect(onChange).toHaveBeenCalledWith({ text_seconds: 2.5 });
  });
});

describe("the text on a phone", () => {
  it("sits and sizes as on a laptop until the store chooses", () => {
    expect(headlineSettings({ text_position: "middle", text_size: "l" })).toMatchObject({
      positionMobile: "middle",
      sizeMobile: "l",
    });
    expect(
      headlineSettings({
        text_position: "middle",
        text_position_mobile: "top",
        text_size_mobile: "s",
      }),
    ).toMatchObject({ position: "middle", positionMobile: "top", size: "m", sizeMobile: "s" });
  });

  it("is chosen beside the laptop's, and goes back to it", () => {
    const onChange = vi.fn();
    render(
      <HeroHeadlineFields
        idPrefix="s1"
        slide={{ text_position_mobile: "top" }}
        isAr={false}
        onChange={onChange}
      />,
    );
    const phone = screen.getByRole("group", { name: "Position on a phone" });
    expect(phone.querySelector('[aria-pressed="true"]')).toHaveTextContent("Top");
    fireEvent.click(screen.getAllByRole("button", { name: "As on a laptop" })[0]);
    expect(onChange).toHaveBeenCalledWith({ text_position_mobile: undefined });
    fireEvent.click(
      screen.getByRole("group", { name: "Headline size on a phone" }).querySelectorAll("button")[1],
    );
    expect(onChange).toHaveBeenCalledWith({ text_size_mobile: "s" });
  });

  it("is where the storefront's hero puts it below 640px, with its own shade", () => {
    const { container } = render(
      <HeroV2View
        slides={[
          {
            id: "s1",
            type: "text",
            title_en: "Summer edit",
            title_ar: "",
            body_en: "",
            body_ar: "",
            media_url: "",
            text_position: "bottom",
            text_position_mobile: "top",
            text_size: "xl",
            text_size_mobile: "s",
          },
        ]}
        settings={{} as never}
        lang="en"
        brand={{ id: "b1", slug: "pura", name_en: "Pura", primary_color: null } as never}
      />,
    );
    const block = container.querySelector(".justify-start.sm\\:justify-end");
    expect(block).not.toBeNull();
    const scrims = container.querySelectorAll(".sm\\:hidden, .hidden.sm\\:block");
    expect(scrims).toHaveLength(2);
    // The phone's shade runs from the top (the default direction, which the browser leaves out).
    expect((scrims[0] as HTMLElement).style.backgroundImage).not.toMatch(/to top/);
    expect((scrims[1] as HTMLElement).style.backgroundImage).toMatch(/to top/);
    const heading = screen.getByRole("heading", { name: "Summer edit", hidden: true });
    expect(heading.style.getPropertyValue("--hero-scale-phone")).toBe("0.8");
    expect(heading.style.getPropertyValue("--hero-scale-wide")).toBe("1.45");
  });
});

describe("the contrast rules", () => {
  it("read colours and measure contrast as WCAG does", () => {
    expect(parseCssColor("#fff")).toEqual([255, 255, 255]);
    expect(parseCssColor("#C9A96E")).toEqual([201, 169, 110]);
    expect(parseCssColor("rgb(20, 20, 20)")).toEqual([20, 20, 20]);
    expect(parseCssColor("gold")).toBeNull();
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBe(1);
  });

  it("know how strong the shade is where the text sits", () => {
    expect(scrimAlphaAt("bottom", 0.95, 0.45, 1)).toBeCloseTo(0.95);
    expect(scrimAlphaAt("bottom", 0.95, 0.45, 0)).toBeCloseTo(0);
    expect(scrimAlphaAt("top", 0.95, 0.45, 0)).toBeCloseTo(0.95);
    // At its weakest row: 35% from the bottom edge.
    expect(shadeInBand("bottom", 0.95, 0.45)).toBeCloseTo(0.95 + (0.45 - 0.95) * (0.35 / 0.45));
  });

  it("know which rows of a picture a frame shows", () => {
    expect(visibleMediaRows(16 / 9, 1440 / 520, 50)[0]).toBeCloseTo(0.179, 2);
    expect(visibleMediaRows(16 / 9, 1440 / 520, 0)[0]).toBe(0);
    expect(visibleMediaRows(16 / 9, 4 / 3)).toEqual([0, 1]);
  });

  it("measure against the lightest part for light text and the darkest for dark text", () => {
    const pixels = bandPixels(flat([200, 200, 200], 2, 2).data, 2, 2, [0, 1]);
    expect(pixels).toHaveLength(4);
    const mixed: [number, number, number][] = [...Array(9).fill([0, 0, 0]), [255, 255, 255]];
    expect(worstBackground(mixed, "light")).toEqual([255, 255, 255]);
    expect(worstBackground(mixed, "dark")).toEqual([0, 0, 0]);
  });

  it("find white text unreadable on a white floor without a shade, and say what fixes it", () => {
    const input = {
      pixels: Array(10).fill([245, 240, 232]),
      tone: "light" as const,
      position: "bottom" as const,
      shade: 0,
    };
    expect(heroTextContrast(input)).toBeLessThan(1.2);
    expect(contrastAdvice({ ...input, shade: 30 })).toEqual({ kind: "shade", shade: 70 });
    expect(contrastAdvice({ ...input, shade: 80 })).toEqual({ kind: "tone", tone: "dark" });
    expect(adviceLookPatch({ kind: "tone", tone: "dark" })).toEqual({
      text_tone: "dark",
      shade: 35,
      text_color: "",
    });
    expect(adviceLookPatch({ kind: "shade", shade: 60 })).toEqual({ shade: 60 });
  });
});

describe("the check in the slide's settings", () => {
  const framing = { fit: "cover", desktopHeight: "standard", mobileRatio: "landscape_4_3" };

  it("reads the weaker of the laptop and the phone", () => {
    const reading = slideContrast({
      slide: { text_position: "bottom" },
      store: { hero_overlay_strength: 45 },
      framing,
      pixels: { desktop: flat([10, 10, 10]), mobile: flat([250, 250, 250]) },
    });
    expect(reading?.device).toBe("mobile");
    expect(reading?.verdict).toBe("low");
    expect(
      slideContrast({ slide: {}, store: {}, framing, pixels: { desktop: null, mobile: null } }),
    ).toBeNull();
  });

  it("tells the store, and fixes it in one tap", () => {
    picture.pixels = flat([250, 248, 244]);
    const onChange = vi.fn();
    render(
      <HeroContrastNote
        slide={{ shade: 20 }}
        store={{}}
        framing={framing}
        imageUrl="https://media.boutq.store/a.webp"
        mobileImageUrl={null}
        isAr={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/Hard to read \(\d\.\d:1\)/);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalled();
  });

  it("says nothing without a picture to measure", () => {
    picture.pixels = null;
    const { container } = render(
      <HeroContrastNote
        slide={{}}
        store={{}}
        framing={framing}
        imageUrl={null}
        mobileImageUrl={null}
        isAr={false}
        onChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
