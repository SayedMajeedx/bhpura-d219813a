import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// A store photo with nothing drawn yet fades in once it has loaded (the animation review of
// 2026-11-22): photos painted in bands over a grey box. One already drawn, or the hero's, is
// never hidden.

const { ResponsiveImage, waitToFadeIn } = await import("../src/components/responsive-media");

const img = (complete: boolean, naturalWidth: number) => {
  const el = document.createElement("img");
  Object.defineProperty(el, "complete", { value: complete });
  Object.defineProperty(el, "naturalWidth", { value: naturalWidth });
  return el;
};

describe("a store photo", () => {
  it("waits, hidden, only while nothing of it is drawn", () => {
    const loading = img(false, 0);
    waitToFadeIn(loading);
    expect(loading.dataset.photo).toBe("loading");
    const drawn = img(true, 480);
    waitToFadeIn(drawn);
    expect(drawn.dataset.photo).toBeUndefined();
    const partly = img(false, 480);
    waitToFadeIn(partly);
    expect(partly.dataset.photo).toBeUndefined();
  });

  it("fades in once loaded, and the hero's is left alone", () => {
    const { container, rerender } = render(<ResponsiveImage src="/brands/b/p/a.jpg" alt="" />);
    const photo = container.querySelector("img")!;
    expect(photo.dataset.photo).toBe("loading");
    fireEvent.load(photo);
    expect(photo.dataset.photo).toBe("loaded");
    rerender(<ResponsiveImage src="/brands/b/p/h.jpg" alt="" fetchPriority="high" />);
    const { container: hero } = render(
      <ResponsiveImage src="/brands/b/p/h.jpg" alt="" fetchPriority="high" />,
    );
    expect(hero.querySelector("img")!.dataset.photo).toBeUndefined();
  });
});
