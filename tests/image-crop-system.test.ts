import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { IMAGE_CROP_PRESETS } from "../src/lib/image-crop-presets";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("image crop contracts", () => {
  it("keeps every output size mathematically aligned with its crop ratio", () => {
    for (const [name, preset] of Object.entries(IMAGE_CROP_PRESETS)) {
      expect(preset.outputWidth / preset.outputHeight, name).toBeCloseTo(preset.aspect, 6);
      expect(preset.outputWidth, name).toBeGreaterThanOrEqual(1200);
    }
  });

  it("uses named presets across every production crop upload surface", () => {
    const files = [
      "src/routes/_authenticated/admin.b.$slug.categories.tsx",
      "src/routes/_authenticated/admin.b.$slug.inventory.tsx",
      "src/routes/_authenticated/admin.b.$slug.pages.tsx",
      "src/routes/_authenticated/admin.b.$slug.settings.tsx",
    ].map(read);

    const productionMarkup = files.join("\n");
    for (const preset of [
      "categoryCover",
      "productPortrait",
      "pageBanner",
      "pageInline",
      "hero",
      "promotionBanner",
      "editorialBanner",
      "editorialBackground",
    ]) {
      expect(productionMarkup).toContain(`"${preset}"`);
    }
    expect(productionMarkup).not.toMatch(/<CropUploadButton[\s\S]{0,180}?\baspect=/);
  });

  it("renders promotional cards in the exact same ratio as their final crop", () => {
    const storefront = read("src/routes/$slug.index.tsx");
    expect(storefront).toContain(
      'className="group relative aspect-[2/1] overflow-hidden rounded-2xl border shadow-sm"',
    );
    expect(storefront).not.toContain("sm:aspect-auto sm:h-[216px]");
  });

  it("offers high-quality output and responsive cover previews", () => {
    const cropper = read("src/components/image-cropper-dialog.tsx");
    expect(cropper).toContain('ctx.imageSmoothingQuality = "high"');
    expect(cropper).toContain("previewAspects.map");
    expect(cropper).toContain('className="absolute inset-0 h-full w-full object-cover"');
  });
});
