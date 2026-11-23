import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The store's first second (the animation review of 2026-11-22): product cards came from the
// server fully clear and faded in only once the scripts ran; the hero's heading played a large
// blur while the video started; and every button's colour snapped, its transition naming
// `colors`, which is not a CSS property.

const { startsOnScreen, useReveal } = await import("../src/lib/motion/use-reveal");
const { HeroHeadline } = await import("../src/components/storefront/HeroHeadline");
const { buttonVariants } = await import("../src/components/ui/button");

afterEach(() => vi.useRealTimers());

const at = (top: number, height = 400) =>
  ({ getBoundingClientRect: () => ({ top, bottom: top + height }) }) as unknown as Element;

function Card({ top }: { top: number }) {
  const { ref } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={(node) => {
        if (node) node.getBoundingClientRect = () => ({ top, bottom: top + 400 }) as DOMRect;
        ref.current = node;
      }}
      className="sf-reveal"
      data-testid="card"
    />
  );
}

describe("a product card", () => {
  it("on the first screen is shown as the page arrived", () => {
    expect(startsOnScreen(at(100), 800)).toBe(true);
    expect(startsOnScreen(at(900), 800)).toBe(false);
    expect(startsOnScreen(at(-500), 800)).toBe(false);
    const { getByTestId } = render(<Card top={100} />);
    expect(getByTestId("card").getAttribute("data-revealed")).toBe("true");
    expect(getByTestId("card").hasAttribute("data-reveal")).toBe(false);
  });

  it("further down waits, hidden, until it comes in", () => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const { getByTestId } = render(<Card top={5_000} />);
    expect(getByTestId("card").getAttribute("data-reveal")).toBe("pending");
    expect(getByTestId("card").hasAttribute("data-revealed")).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("the hero's heading", () => {
  const phraseClass = (container: HTMLElement) =>
    container.querySelector("[data-hero-phrase='shown'] span")?.className ?? "";

  it("is there at once when the page opens, and the next phrase has its entrance", () => {
    vi.useFakeTimers();
    const { container } = render(
      <HeroHeadline
        phrases={["قصة الفخامة", "PURA LINE"]}
        animation="blur_in"
        seconds={3}
        loops={1}
        active
        dir="rtl"
      />,
    );
    expect(phraseClass(container)).not.toContain("hero-phrase-blur");
    act(() => void vi.advanceTimersByTime(3_000));
    expect(phraseClass(container)).toContain("hero-phrase-blur");
  });

  it("enters when its slide comes round later", () => {
    const { container } = render(
      <HeroHeadline
        phrases={["One", "Two"]}
        animation="blur_in"
        seconds={3}
        loops={1}
        active={false}
        dir="ltr"
      />,
    );
    expect(phraseClass(container)).toContain("hero-phrase-blur");
  });
});

describe("a button", () => {
  it("eases its colours, naming real properties", () => {
    const classes = buttonVariants();
    expect(classes).toContain(
      "transition-[transform,color,background-color,border-color,box-shadow]",
    );
    expect(classes).not.toMatch(/transition-\[[^\]]*\bcolors\b/);
  });
});
