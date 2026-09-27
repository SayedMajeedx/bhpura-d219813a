import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IMAGE_CROP_PRESETS } from "../src/lib/image-crop-presets";

// Every upload surface crops with a named preset: see the design-system
// guardrails (tests/design-system-guardrails.test.ts).

const storefront = vi.hoisted(() => ({
  lang: "en",
  settings: {
    home_promo_cards: [
      { image_url: "https://media.boutq.store/promo.jpg", title_en: "Eid sale", href: "#products" },
    ],
  },
}));
vi.mock("../src/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));
vi.mock("@/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));

const { PromoCards } = await import("../src/features/storefront-home/components/PromoCards");
const { getCroppedBlob } = await import("../src/components/image-cropper-dialog");

describe("image crop contracts", () => {
  it("keeps every output size mathematically aligned with its crop ratio", () => {
    for (const [name, preset] of Object.entries(IMAGE_CROP_PRESETS)) {
      expect(preset.outputWidth / preset.outputHeight, name).toBeCloseTo(preset.aspect, 6);
      expect(preset.outputWidth, name).toBeGreaterThanOrEqual(1200);
    }
  });

  it("renders promotional cards in the exact same ratio as their final crop", () => {
    expect(IMAGE_CROP_PRESETS.promotionBanner.aspect).toBe(2);
    render(<PromoCards />);
    const card = screen.getByText("Eid sale").closest("a")!;
    expect(card.className).toContain("aspect-[2/1]");
    // A fixed height would crop the 2:1 image differently on wide screens.
    expect(card.className).not.toMatch(/sm:aspect-auto|sm:h-\[/);
  });

  it("encodes the crop at the preset's output size with high-quality smoothing", async () => {
    const preset = IMAGE_CROP_PRESETS.promotionBanner;
    const ctx = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
    };
    let canvasSize = { width: 0, height: 0 };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(function (this: HTMLCanvasElement) {
        canvasSize = { width: this.width, height: this.height };
        return ctx as never;
      });
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((done) => done(new Blob(["jpeg"], { type: "image/jpeg" })));
    // Images load at once, as a 3200x1600 photo.
    const RealImage = globalThis.Image;
    globalThis.Image = class {
      naturalWidth = 3200;
      naturalHeight = 1600;
      onload: () => void = () => undefined;
      crossOrigin = "";
      set src(_value: string) {
        queueMicrotask(() => this.onload());
      }
    } as unknown as typeof Image;
    try {
      const blob = await getCroppedBlob(
        "https://media.boutq.store/photo.jpg",
        { x: 0, y: 0, width: 3200, height: 1600 },
        preset.outputWidth,
        preset.outputHeight,
      );
      expect(blob.type).toBe("image/jpeg");
      expect(canvasSize).toEqual({ width: 1600, height: 800 });
      expect(ctx.imageSmoothingEnabled).toBe(true);
      expect(ctx.imageSmoothingQuality).toBe("high");
      expect(ctx.drawImage).toHaveBeenCalled();
    } finally {
      globalThis.Image = RealImage;
      getContext.mockRestore();
      toBlob.mockRestore();
    }
  });
});
