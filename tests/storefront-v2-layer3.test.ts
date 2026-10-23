import { describe, it, expect } from "vitest";
import { BRAND_TEMPLATES, VERTICAL_DESIGN_PRESETS } from "../src/lib/brand-templates";
import { STORE_VERTICALS } from "../src/lib/store-profile";
import { buildCartItem } from "../src/lib/cart/add-to-cart";

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
          {
            key: "orderType",
            label_ar: "نوع الطلب",
            label_en: "Order Type",
            value: "made_to_order",
          },
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
