import React from "react";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductGallery } from "../src/features/product-page/components/ProductGallery";
import type { PdpMediaItem } from "../src/features/product-page/types";

// The strip of thumbnails under the product picture: every one the same size, the chosen one
// marked by its border (not an outer ring that the scroll area clips and that makes it look
// larger), a real frame for a video that has no poster, and nothing that can move the page.

const t = (ar: string, en: string) => (/[؀-ۿ]/.test("") ? ar : en);
const MEDIA = [
  { type: "video", url: "https://cdn.test/clip.mp4" },
  { type: "image", url: "https://cdn.test/photo.jpg" },
  { type: "video", url: "https://cdn.test/other.mp4", poster_url: "https://cdn.test/poster.jpg" },
] as unknown as PdpMediaItem[];

const gallery = (mediaIdx: number, setMediaIdx = vi.fn()) =>
  render(
    <ProductGallery
      displayName="Inner Dress"
      galleryRatioClass="aspect-[3/4]"
      galleryTouchStartX={{ current: null }}
      media={MEDIA}
      mediaIdx={mediaIdx}
      primary="rgb(51, 10, 10)"
      product={{ id: "p1" } as never}
      setMediaIdx={setMediaIdx}
      settings={{} as never}
      t={t as never}
    />,
  );

const thumbs = () =>
  screen
    .queryAllByRole("button")
    .filter((b) => /^Show (video|image) \d+$/.test(b.getAttribute("aria-label") ?? ""));

describe("the product gallery's thumbnails", () => {
  it("has one thumbnail per picture or video, each named", () => {
    gallery(0);
    expect(thumbs().map((b) => b.getAttribute("aria-label"))).toEqual([
      "Show video 1",
      "Show image 2",
      "Show video 3",
    ]);
  });

  it("marks the chosen one, and gives every thumbnail the same size and no outer ring", () => {
    gallery(0);
    const [video, image, withPoster] = thumbs();
    expect(video).toHaveAttribute("aria-current", "true");
    expect(image).not.toHaveAttribute("aria-current");
    expect(withPoster).not.toHaveAttribute("aria-current");
    for (const thumb of [video, image, withPoster]) {
      expect(thumb.className).toContain("size-18");
      expect(thumb.className).toContain("border-2");
      // The selection is the border; a ring would be clipped and look bigger than its neighbours.
      expect(thumb.className).not.toMatch(/(^|\s)ring-2(\s|$)/);
    }
    expect(video.className).toContain("border-primary");
    expect(video.style.borderColor).toBe("rgb(51, 10, 10)");
    expect(image.className).toContain("border-border-subtle");
    expect(image.style.borderColor).toBe("");
  });

  it("follows the chosen index", () => {
    gallery(1);
    expect(thumbs().map((b) => b.getAttribute("aria-current"))).toEqual([null, "true", null]);
  });

  it("shows a video's own first frame when it has no poster, and the poster when it has one", () => {
    gallery(1);
    const [video, , withPoster] = thumbs();
    const frame = video.querySelector("video");
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("src")).toBe("https://cdn.test/clip.mp4#t=0.1");
    expect(frame).toHaveAttribute("aria-hidden", "true");
    expect(frame?.tabIndex).toBe(-1);
    expect(withPoster.querySelector("video")).toBeNull();
    expect(withPoster.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.test/poster.jpg",
    );
  });

  it("picks a thumbnail on click without taking focus from the page", () => {
    const setMediaIdx = vi.fn();
    gallery(0, setMediaIdx);
    const image = thumbs()[1];
    const press = createEvent.mouseDown(image);
    fireEvent(image, press);
    // The press is cancelled, so the browser never focuses the button (and never scrolls to it).
    expect(press.defaultPrevented).toBe(true);
    fireEvent.click(image);
    expect(setMediaIdx).toHaveBeenCalledWith(1);
  });

  it("keeps the browser from re-anchoring the scroll when the picture swaps", () => {
    const { container } = gallery(0);
    expect((container.firstChild as HTMLElement).className).toContain("[overflow-anchor:none]");
  });

  it("shows no strip for a single picture", () => {
    render(
      <ProductGallery
        displayName="x"
        galleryRatioClass="aspect-[3/4]"
        galleryTouchStartX={{ current: null }}
        media={[MEDIA[1]]}
        mediaIdx={0}
        primary="red"
        product={{ id: "p1" } as never}
        setMediaIdx={vi.fn()}
        settings={{} as never}
        t={t as never}
      />,
    );
    expect(thumbs()).toEqual([]);
  });
});
