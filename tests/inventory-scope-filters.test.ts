import { describe, it, expect } from "vitest";

describe("Inventory Scope Filters Logic", () => {
  interface Product {
    id: string;
    name: string;
    is_active: boolean;
    image_url: string | null;
    media: any[];
    featured_trending?: boolean;
  }

  const sampleProducts: Product[] = [
    {
      id: "prod-1",
      name: "Abaya Classic",
      is_active: true,
      image_url: "https://example.com/img1.jpg",
      media: [{ url: "https://example.com/img1.jpg" }],
      featured_trending: true,
    },
    {
      id: "prod-2",
      name: "Silk Scarf",
      is_active: true,
      image_url: null,
      media: [],
    },
    {
      id: "prod-3",
      name: "Linen Dress",
      is_active: false,
      image_url: "https://example.com/img3.jpg",
      media: [{ url: "https://example.com/img3.jpg" }],
    },
    {
      id: "prod-4",
      name: "Velvet Caftan",
      is_active: true,
      image_url: "https://example.com/img4.jpg",
      media: [{ url: "https://example.com/img4.jpg" }],
    },
  ];

  const stocks: Record<string, number> = {
    "prod-1": 15,
    "prod-2": 20,
    "prod-3": 0,
    "prod-4": 2,
  };

  const isLowStock = (stock: number) => stock > 0 && stock <= 3;
  const isOutOfStock = (stock: number) => stock <= 0;

  const filterProducts = (scope: string) => {
    return sampleProducts.filter((product) => {
      const stock = stocks[product.id] ?? 0;
      const isCriticalStock = isLowStock(stock) || isOutOfStock(stock);
      const media = Array.isArray(product.media) ? product.media : [];
      const hasMedia =
        product.image_url ||
        media.some((m: any) =>
          typeof m === "string" ? Boolean(m.trim()) : Boolean(m?.url || m?.src),
        );

      if (scope === "attention") {
        return isCriticalStock || !hasMedia;
      }
      if (scope === "active") {
        return Boolean(product.is_active);
      }
      if (scope === "inactive") {
        return !product.is_active;
      }
      if (scope === "low") {
        return isLowStock(stock);
      }
      if (scope === "out") {
        return isOutOfStock(stock);
      }
      return true;
    });
  };

  it("filters 'attention' to products with missing media OR critical stock", () => {
    const attention = filterProducts("attention");
    const ids = attention.map((p) => p.id);
    expect(ids).toContain("prod-2");
    expect(ids).toContain("prod-3");
    expect(ids).toContain("prod-4");
    expect(ids).not.toContain("prod-1");
  });

  it("filters 'active' only to published store products", () => {
    const active = filterProducts("active");
    expect(active.every((p) => p.is_active)).toBe(true);
    expect(active.map((p) => p.id)).toEqual(["prod-1", "prod-2", "prod-4"]);
  });

  it("filters 'inactive' to hidden/draft products", () => {
    const inactive = filterProducts("inactive");
    expect(inactive.map((p) => p.id)).toEqual(["prod-3"]);
  });

  it("filters 'low' and 'out' accurately based on stock levels", () => {
    const low = filterProducts("low");
    expect(low.map((p) => p.id)).toEqual(["prod-4"]);

    const out = filterProducts("out");
    expect(out.map((p) => p.id)).toEqual(["prod-3"]);
  });
});
