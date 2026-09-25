import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { IMAGE_CROP_PRESETS } from "../src/lib/image-crop-presets";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// The home page is split across its route and src/features/storefront-home (Phase 5).
const homeSource = () =>
  [
    "src/routes/$slug.index.tsx",
    ...["components", "lib"].flatMap((dir) =>
      readdirSync(`src/features/storefront-home/${dir}`)
        .sort()
        .map((file) => `src/features/storefront-home/${dir}/${file}`),
    ),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

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
      // The product editor's crop moved out of the inventory route (Phase 5).
      "src/features/inventory/components/ProductDialog.tsx",
      "src/routes/_authenticated/admin.b.$slug.pages.tsx",
      "src/features/settings/tabs/identity/BasicsGroup.tsx",
      "src/features/settings/tabs/storefront/HomeHeroGroup.tsx",
      "src/features/settings/tabs/storefront/HeroSlidesEditor.tsx",
      "src/features/settings/tabs/storefront/HomeSectionsGroup.tsx",
    ].map(read);

    const productionMarkup = files.join("\n");
    for (const preset of [
      "categoryCover",
      "productPortrait",
      "pageBanner",
      "pageInline",
      "hero",
      "promotionBanner",
    ]) {
      expect(productionMarkup).toContain(`"${preset}"`);
    }
    expect(productionMarkup).not.toMatch(/<CropUploadButton[\s\S]{0,180}?\baspect=/);
  });

  it("renders promotional cards in the exact same ratio as their final crop", () => {
    const storefront = homeSource();
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
