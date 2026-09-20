import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sizeGuidesManifest } from "../src/addons/size-guides/manifest";

describe("Storefront Tailoring Experience & Sizing Consolidation", () => {
  const rootDir = path.resolve(__dirname, "..");
  const pdpPath = path.join(rootDir, "src/routes/$slug.product.$id.tsx");
  const fitPassportPath = path.join(
    rootDir,
    "src/addons/fit-passport/components/storefront/ProductFitPassportSection.tsx",
  );

  it("Item 1: Fit Passport section must hide when sizeMode is 'ready'", () => {
    const code = fs.readFileSync(fitPassportPath, "utf-8");
    // Verifies early return when sizeMode is ready
    expect(code).toMatch(
      /if\s*\(\s*!passportConfigured\s*\|\|\s*sizeMode\s*===\s*["']ready["']\s*\)\s*return\s*null;/,
    );
  });

  it("Item 1: Switching to ready size cleans up measurement values", () => {
    const code = fs.readFileSync(pdpPath, "utf-8");
    expect(code).toContain('setSizeMode("ready")');
    expect(code).toContain("isMeasurementField(k)");
    expect(code).toContain("setMeasurementsApplied(false)");
  });

  it("Item 2: Redundant inline size-guide accordion is removed in favor of top modal guide", () => {
    // Assert slots array in sizeGuidesManifest does not have size-guide-inline
    const slots = sizeGuidesManifest.contributions?.slots ?? [];
    const inlineSlot = slots.find(
      (s) => s.id === "size-guide-inline" || s.placement === "storefront.product.afterCta",
    );
    expect(inlineSlot).toBeUndefined();

    // Assert top modal guide is preserved
    const modalSlot = slots.find(
      (s) => s.id === "size-guide-modal" && s.placement === "storefront.product.optionsAside",
    );
    expect(modalSlot).toBeDefined();
  });

  it("Item 3: hasReadySizes requires real unique sizes, not just placeholder variants", () => {
    const code = fs.readFileSync(pdpPath, "utf-8");
    expect(code).toContain("const hasReadySizes = uniqueSizes.length > 0;");
    expect(code).not.toContain("const hasReadySizes = uniqueSizes.length > 0 || hasVariants;");
  });

  it("Item 3: Syncs sizeMode to custom when product is made-to-order without ready sizes", () => {
    const code = fs.readFileSync(pdpPath, "utf-8");
    expect(code).toContain("if (isMadeToOrder && !hasReadySizes)");
    expect(code).toContain('setSizeMode("custom")');
  });

  it("Item 3: Suppresses fallback placeholder variants (like قياسي) when tailoring is active", () => {
    const code = fs.readFileSync(pdpPath, "utf-8");
    expect(code).toContain("!isTailoringActive &&");
    expect(code).toContain("!variants.every(isPlaceholderVariant)");
  });

  it("Item 3: Made-to-order only products display bespoke hero callout and customized CTA", () => {
    const code = fs.readFileSync(pdpPath, "utf-8");
    expect(code).toContain("!showSizeModeToggle && isMadeToOrder && !hasReadySizes");
    expect(code).toContain("vocabulary.made_to_order?.[lang]");
    expect(code).toContain("vocabulary.custom_order?.[lang]");
  });
});
