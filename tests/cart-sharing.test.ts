import { describe, it, expect } from "vitest";
import {
  encodeCartSharePayload,
  decodeCartSharePayload,
  buildCartShareUrl,
  buildWhatsAppShareUrl,
} from "../src/lib/cart-sharing";
import type { CartItem } from "../src/lib/storefront-context";

describe("Cart Sharing", () => {
  const sampleCart: CartItem[] = [
    {
      cart_line_id: "line-1",
      product_id: "prod-123",
      variant_id: "var-456",
      name: "عباية حريرية فاخرة",
      name_ar: "عباية حريرية فاخرة",
      name_en: "Luxury Silk Abaya",
      image: "https://media.boutq.store/products/abaya.jpg",
      price: 45.5,
      original_price: 55,
      size: "54",
      color: "أسود ملكي",
      fabric: "حرير ياباني",
      qty: 2,
      max_stock: 10,
      custom_fields: [
        { key: "length", value: "54 inch", label_ar: "الطول", label_en: "Length" },
        { key: "note", value: "تطريز ذهبي خفيف", label_ar: "ملاحظات", label_en: "Notes" },
      ],
    },
    {
      cart_line_id: "line-2",
      product_id: "prod-789",
      variant_id: null,
      name: "شيلة كريب",
      name_ar: "شيلة كريب",
      name_en: "Crepe Sheila",
      image: null,
      price: 8.0,
      original_price: null,
      size: null,
      color: null,
      fabric: null,
      qty: 1,
      max_stock: 5,
    },
  ];

  it("encodes and decodes cart items losslessly", () => {
    const payload = encodeCartSharePayload(sampleCart);
    expect(payload).toBeDefined();
    expect(typeof payload).toBe("string");
    expect(payload.length).toBeGreaterThan(0);

    const decoded = decodeCartSharePayload(payload);
    expect(decoded).toBeDefined();
    expect(decoded?.length).toBe(2);

    // Verify first item
    const first = decoded![0];
    expect(first.product_id).toBe("prod-123");
    expect(first.variant_id).toBe("var-456");
    expect(first.name).toBe("عباية حريرية فاخرة");
    expect(first.name_ar).toBe("عباية حريرية فاخرة");
    expect(first.name_en).toBe("Luxury Silk Abaya");
    expect(first.image).toBe("https://media.boutq.store/products/abaya.jpg");
    expect(first.price).toBe(45.5);
    expect(first.original_price).toBe(55);
    expect(first.size).toBe("54");
    expect(first.color).toBe("أسود ملكي");
    expect(first.fabric).toBe("حرير ياباني");
    expect(first.qty).toBe(2);
    expect(first.max_stock).toBe(10);
    expect(first.custom_fields?.length).toBe(2);
    expect(first.custom_fields?.[0].key).toBe("length");
    expect(first.custom_fields?.[0].value).toBe("54 inch");

    // Verify second item
    const second = decoded![1];
    expect(second.product_id).toBe("prod-789");
    expect(second.variant_id).toBeNull();
    expect(second.name).toBe("شيلة كريب");
    expect(second.price).toBe(8.0);
    expect(second.qty).toBe(1);
  });

  it("handles empty or invalid payloads gracefully", () => {
    expect(encodeCartSharePayload([])).toBe("");
    expect(decodeCartSharePayload("")).toBeNull();
    expect(decodeCartSharePayload("invalid-non-base64-garbage@@@")).toBeNull();
    expect(decodeCartSharePayload("e30=")).toBeNull(); // decoded as {} instead of array
  });

  it("builds correct share URLs", () => {
    const shareUrl = buildCartShareUrl("pura-line", sampleCart, "https://boutq.store");
    expect(shareUrl).toContain("https://boutq.store/pura-line?share_cart=");
  });

  it("builds correct WhatsApp share URL in Arabic and English", () => {
    const waArabic = buildWhatsAppShareUrl({
      shareUrl: "https://boutq.store/pura-line?share_cart=abc",
      brandName: "بورا لاين",
      itemCount: 2,
      totalFormatted: "99.000 د.ب",
      isAr: true,
    });
    expect(waArabic).toContain("https://wa.me/?text=");
    expect(decodeURIComponent(waArabic)).toContain("بورا لاين");
    expect(decodeURIComponent(waArabic)).toContain("99.000 د.ب");

    const waEnglish = buildWhatsAppShareUrl({
      shareUrl: "https://boutq.store/pura-line?share_cart=abc",
      brandName: "Pura Line",
      itemCount: 2,
      totalFormatted: "99.000 BHD",
      isAr: false,
    });
    expect(decodeURIComponent(waEnglish)).toContain("Pura Line");
    expect(decodeURIComponent(waEnglish)).toContain("99.000 BHD");
  });
});
