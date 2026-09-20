import { describe, it, expect, vi } from "vitest";
import { getProductTransitionName, navigateWithViewTransition } from "../src/lib/motion/view-transitions";
import { BRAND_TEMPLATES, VERTICAL_DESIGN_PRESETS } from "../src/lib/brand-templates";
import { buildCartItem } from "../src/lib/cart/add-to-cart";

describe("Storefront 2.0 Layer 3 Tests", () => {
  describe("View Transitions API Utilities", () => {
    it("generates safe, sanitized view-transition-name for arbitrary product IDs", () => {
      expect(getProductTransitionName("prod_123")).toBe("product-img-prod_123");
      expect(getProductTransitionName("prod/abc:456#special")).toBe("product-img-prod_abc_456_special");
      expect(getProductTransitionName("")).toBe("product-img-item");
      expect(getProductTransitionName(null as any)).toBe("product-img-item");
    });

    it("falls back to standard navigation when document.startViewTransition is absent", () => {
      const originalDoc = global.document;
      // In jsdom document.startViewTransition is typically undefined
      const navigateFn = vi.fn();
      navigateWithViewTransition(navigateFn);
      expect(navigateFn).toHaveBeenCalledTimes(1);
    });

    it("uses document.startViewTransition when supported", () => {
      const mockStartViewTransition = vi.fn((cb: () => void) => {
        cb();
        return { finished: Promise.resolve() };
      });
      (global.document as any).startViewTransition = mockStartViewTransition;

      const navigateFn = vi.fn();
      navigateWithViewTransition(navigateFn);

      expect(mockStartViewTransition).toHaveBeenCalledTimes(1);
      expect(navigateFn).toHaveBeenCalledTimes(1);

      delete (global.document as any).startViewTransition;
    });
  });

  describe("Vertical Design Presets (L3-17)", () => {
    it("has exact mapping for all 12 verticals to editorial, fresh, or tech", () => {
      const verticals = Object.keys(BRAND_TEMPLATES);
      expect(verticals.length).toBe(12);

      for (const [v, template] of Object.entries(BRAND_TEMPLATES)) {
        expect(template.design).toBeDefined();
        const preset = template.design?.preset;
        expect(["editorial", "fresh", "tech"]).toContain(preset);

        if (preset === "editorial") {
          expect(template.design?.grid).toBe(4);
          expect(template.design?.sectionSpacing).toBe("airy");
          expect(template.design?.cardStyle).toBe("borderless");
        } else if (preset === "fresh") {
          expect(template.design?.grid).toBe(4);
          expect(template.design?.sectionSpacing).toBe("regular");
          expect(template.design?.cardStyle).toBe("bordered");
        } else if (preset === "tech") {
          expect(template.design?.grid).toBe(5);
          expect(template.design?.sectionSpacing).toBe("dense");
          expect(template.design?.cardStyle).toBe("bordered");
        }
      }
    });

    it("ensures luxury verticals receive editorial preset", () => {
      expect(VERTICAL_DESIGN_PRESETS.abayas.preset).toBe("editorial");
      expect(VERTICAL_DESIGN_PRESETS.fashion.preset).toBe("editorial");
      expect(VERTICAL_DESIGN_PRESETS.jewelry.preset).toBe("editorial");
      expect(VERTICAL_DESIGN_PRESETS.beauty.preset).toBe("editorial");
    });
  });

  describe("Custom Order & Bespoke Cart Item (L3-19)", () => {
    it("builds a valid cart item for made_to_order bespoke service", () => {
      const bespokeItem = buildCartItem({
        product: {
          id: "custom-order-req-001",
          name: "طلب تنفيذ مخصص",
          name_ar: "طلب تنفيذ مخصص",
          name_en: "Bespoke Custom Order",
          base_price: 45,
          image_url: "https://example.com/logo.png",
        },
        qty: 1,
        selectedColor: "كحلي داكن",
        selectedSize: "مخصص: طول 56 / صدر 23",
        customFields: [
          { key: "fabric", label_ar: "نوع القماش", label_en: "Fabric", value: "حرير ياباني" },
          { key: "orderType", label_ar: "نوع الطلب", label_en: "Order Type", value: "made_to_order" },
        ],
      });

      expect(bespokeItem.product_id).toBe("custom-order-req-001");
      expect(bespokeItem.qty).toBe(1);
      expect(bespokeItem.price).toBe(45);
      expect(bespokeItem.color).toBe("كحلي داكن");
      expect(bespokeItem.size).toBe("مخصص: طول 56 / صدر 23");
      const fabricField = bespokeItem.custom_fields?.find((f) => f.key === "fabric");
      const orderTypeField = bespokeItem.custom_fields?.find((f) => f.key === "orderType");
      expect(fabricField?.value).toBe("حرير ياباني");
      expect(orderTypeField?.value).toBe("made_to_order");
    });
  });
});
