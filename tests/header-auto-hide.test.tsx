import React, { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HEADER_REVEAL_MS,
  HEADER_SCROLL_STEP,
  focusHoldsHeader,
  headerMove,
} from "../src/features/storefront-shell/lib/header-reveal";
import { useAutoHideHeader } from "../src/features/storefront-shell/hooks/use-auto-hide-header";

// The store's header leaves on a scroll down, comes back on a scroll up for a moment, and stays
// at the top of the page: fixed on screen it took about a fifth of a laptop's screen.

describe("when the header moves", () => {
  it("always shows at the top of the page", () => {
    expect(headerMove({ y: 0, from: 600, zone: 200 })).toBe("show");
    expect(headerMove({ y: 180, from: 900, zone: 200 })).toBe("show");
  });

  it("leaves on a scroll down and comes back on a scroll up, past a jitter", () => {
    expect(headerMove({ y: 600, from: 400, zone: 200 })).toBe("hide");
    expect(headerMove({ y: 400, from: 600, zone: 200 })).toBe("reveal");
    expect(headerMove({ y: 400 + HEADER_SCROLL_STEP, from: 400, zone: 200 })).toBe("keep");
  });
});

describe("the header on the page", () => {
  let y = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    y = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => y });
    // A frame drawn at once, its handle 0 (as if already spent).
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function Header() {
    const ref = useRef<HTMLDivElement>(null);
    const hidden = useAutoHideHeader(ref);
    return (
      <div ref={ref} data-testid="header" data-hidden={hidden ? "true" : "false"}>
        <a href="/x">Abayas</a>
      </div>
    );
  }
  const scrollTo = (to: number) =>
    act(() => {
      y = to;
      window.dispatchEvent(new Event("scroll"));
    });
  const hidden = () => screen.getByTestId("header").dataset.hidden === "true";

  it("leaves on a scroll down, comes back for a moment on a scroll up, and stays at the top", () => {
    render(<Header />);
    scrollTo(800);
    expect(hidden()).toBe(true);
    scrollTo(700);
    expect(hidden()).toBe(false);
    act(() => vi.advanceTimersByTime(HEADER_REVEAL_MS));
    expect(hidden()).toBe(true);
    scrollTo(0);
    expect(hidden()).toBe(false);
    act(() => vi.advanceTimersByTime(HEADER_REVEAL_MS * 2));
    expect(hidden()).toBe(false);
  });

  it("stays while it is being used: the keyboard brought focus to a link in it", () => {
    render(<Header />);
    scrollTo(800);
    scrollTo(700);
    // A browser draws the focus ring (:focus-visible) for focus the keyboard moved; jsdom never does.
    const link = screen.getByRole("link", { name: "Abayas" });
    vi.spyOn(link, "matches").mockImplementation((selector) => selector === ":focus-visible");
    fireEvent.focusIn(link);
    act(() => vi.advanceTimersByTime(HEADER_REVEAL_MS * 2));
    expect(hidden()).toBe(false);
    scrollTo(900);
    expect(hidden()).toBe(false);
  });

  it("is not pinned by focus a script puts in it, such as a closing dialog's trigger", () => {
    render(<Header />);
    scrollTo(800);
    expect(hidden()).toBe(true);
    const link = screen.getByRole("link", { name: "Abayas" });
    // A browser draws no focus ring for focus it was given by a script after a click.
    vi.spyOn(link, "matches").mockImplementation((selector) => selector !== ":focus-visible");
    fireEvent.focusIn(link);
    expect(hidden()).toBe(true);
  });
});

describe("what focus pins the header", () => {
  it("is focus the keyboard moved there", () => {
    const link = document.createElement("a");
    link.matches = (selector: string) => selector === ":focus-visible";
    expect(focusHoldsHeader(link)).toBe(true);
    link.matches = () => false;
    expect(focusHoldsHeader(link)).toBe(false);
    expect(focusHoldsHeader(null)).toBe(false);
  });

  it("keeps the old rule where a browser cannot answer", () => {
    const link = document.createElement("a");
    link.matches = () => {
      throw new SyntaxError("unknown pseudo-class");
    };
    expect(focusHoldsHeader(link)).toBe(true);
  });
});
