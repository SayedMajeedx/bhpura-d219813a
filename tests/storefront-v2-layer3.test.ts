import { describe, it, expect } from "vitest";
import { BRAND_TEMPLATES, VERTICAL_DESIGN_PRESETS } from "../src/lib/brand-templates";
import { STORE_VERTICALS } from "../src/lib/store-profile";

describe("Storefront 2.0 Layer 3 Tests", () => {
  describe("Vertical Design Presets (L3-17)", () => {
    // A preset holds what the platform applies: the wizard's corner radius and the cards' photo
    // shape. The style names, grids, spacings and card styles it once promised were read by
    // nothing and were removed (src/lib/brand-templates/design-presets.ts).
    it("gives every vertical a radius and a photo shape", () => {
      const verticals = Object.keys(BRAND_TEMPLATES);
      expect(verticals.sort()).toEqual([...STORE_VERTICALS].sort());

      for (const template of Object.values(BRAND_TEMPLATES)) {
        expect(template.design).toBeDefined();
        expect(template.design?.radius).toBeTruthy();
        expect(["3:4", "4:5", "1:1", "4:3"]).toContain(template.design?.productPhoto);
      }
    });

    it("photographs clothes standing and jewellery and beauty square", () => {
      expect(VERTICAL_DESIGN_PRESETS.abayas.productPhoto).toBe("3:4");
      expect(VERTICAL_DESIGN_PRESETS.fashion.productPhoto).toBe("3:4");
      expect(VERTICAL_DESIGN_PRESETS.jewelry.productPhoto).toBe("1:1");
      expect(VERTICAL_DESIGN_PRESETS.beauty.productPhoto).toBe("1:1");
    });
  });
});
