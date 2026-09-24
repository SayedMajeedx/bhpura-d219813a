import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hasAvailableStock, type ProductRow } from "../src/lib/data/storefront/types";
import {
  PRODUCT_CARD_SELECT,
  PRODUCT_DETAIL_BASE_SELECT,
  PRODUCT_DETAIL_SELECT,
} from "../src/lib/data/storefront/selects";

describe("Phase 3: Explicit is_made_to_order flag & inventory decoupling", () => {
  const migration = readFileSync(
    "supabase/migrations/20260917100000_products_made_to_order_flag.sql",
    "utf8",
  );

  describe("database migration & RPC integrity", () => {
    it("adds the is_made_to_order boolean column with default false", () => {
      expect(migration).toContain(
        "ADD COLUMN IF NOT EXISTS is_made_to_order boolean NOT NULL DEFAULT false",
      );
    });

    it("backfills existing products with custom_fields as is_made_to_order = true", () => {
      expect(migration).toContain("UPDATE public.products");
      expect(migration).toContain("SET is_made_to_order = true");
      expect(migration).toContain(
        "jsonb_typeof(custom_fields) = 'array' AND jsonb_array_length(custom_fields) > 0",
      );
    });

    it("includes is_made_to_order in get_storefront_page_data product payload", () => {
      expect(migration).toContain("'is_made_to_order', p.is_made_to_order");
    });

    it("updates place_storefront_order_internal_20260710 to read v_product.is_made_to_order", () => {
      expect(migration).toContain("v_is_tailoring := COALESCE(v_product.is_made_to_order, false);");
    });
  });

  describe("admin inventory management", () => {
    const inventory = readFileSync("src/routes/_authenticated/admin.b.$slug.inventory.tsx", "utf8");

    it("includes is_made_to_order in Product type", () => {
      // The inventory types moved to src/features/inventory/types.ts (Phase 5).
      const types = readFileSync("src/features/inventory/types.ts", "utf8");
      expect(types).toMatch(/is_made_to_order\?: boolean \| null;/);
    });

    it("initializes and resets is_made_to_order in form state", () => {
      expect(inventory).toContain("is_made_to_order: product?.is_made_to_order ?? false");
    });

    it("persists is_made_to_order in both patch and payload updates", () => {
      expect(inventory).toMatch(/is_made_to_order: Boolean\(form\.is_made_to_order\)/);
    });

    it("auto-enables is_made_to_order when selecting a customization preset", () => {
      expect(inventory).toContain(
        "is_made_to_order: isCustomPreset ? true : form.is_made_to_order",
      );
    });

    it("renders a Switch toggle for is_made_to_order in the Product Customization Engine", () => {
      expect(inventory).toContain("checked={Boolean(form.is_made_to_order)}");
      expect(inventory).toContain(
        "onCheckedChange={(checked) => setForm({ ...form, is_made_to_order: checked })}",
      );
      expect(inventory).toContain("منتج حسب الطلب (لا يُخصم من المخزون)");
    });
  });

  describe("storefront queries and Product Detail Page (PDP)", () => {
    const pdp = readFileSync("src/routes/$slug.product.$id.tsx", "utf8");

    it("fetches is_made_to_order for the product page, quick view and product grids", () => {
      expect(PRODUCT_DETAIL_SELECT).toContain("is_made_to_order");
      expect(PRODUCT_DETAIL_BASE_SELECT).toContain("is_made_to_order");
      expect(PRODUCT_CARD_SELECT).toContain("is_made_to_order");
    });

    it("decouples isTailoringActive and showSizeModeToggle to require is_made_to_order", () => {
      expect(pdp).toContain("const isMadeToOrder = Boolean(product?.is_made_to_order);");
      expect(pdp).toMatch(
        /showSizeModeToggle\s*=\s*modules\.made_to_order\s*&&\s*hasReadySizes\s*&&\s*hasCustomFields\s*&&\s*isMadeToOrder;/,
      );
      expect(pdp).toContain("const isTailoringActive =");
      expect(pdp).toContain(
        'isMadeToOrder && ((showSizeModeToggle && sizeMode === "custom") || !showSizeModeToggle);',
      );
    });

    it("does not tag ready-to-wear items with custom fields as custom tailoring", () => {
      expect(pdp).not.toContain('hasCustomFields ? t("تفصيل", "Custom Tailoring") : null');
      expect(pdp).toContain("isTailoringActive");
      expect(pdp).toContain('vocabulary.custom_sizing?.[lang] || t("قياس خاص", "Custom Sizing")');
    });
  });

  describe("product card & storefront catalog stock check", () => {
    const card = readFileSync("src/components/storefront/product-card.tsx", "utf8");

    it("calculates oos in product card using is_made_to_order instead of custom_fields length", () => {
      expect(card).toContain("const isMadeToOrder = Boolean(product.is_made_to_order);");
      expect(card).toContain("const oos = !isMadeToOrder && totalStock <= 0;");
    });

    it("treats made-to-order products as available even with no stock", () => {
      const product = (overrides: Partial<ProductRow>): ProductRow => ({
        id: "p",
        name: "Abaya",
        name_ar: null,
        name_en: null,
        description: null,
        description_ar: null,
        description_en: null,
        category: null,
        image_url: null,
        media: null,
        brand_id: "b",
        created_at: "2026-09-01T00:00:00Z",
        product_variants: [
          {
            id: "v",
            selling_price: 10,
            original_price: null,
            stock_main: 0,
            size: null,
            color: null,
          },
        ],
        ...overrides,
      });
      expect(hasAvailableStock(product({ is_made_to_order: true }))).toBe(true);
      expect(hasAvailableStock(product({ is_made_to_order: false }))).toBe(false);
      expect(
        hasAvailableStock(
          product({
            product_variants: [
              {
                id: "v",
                selling_price: 10,
                original_price: null,
                stock_main: 0,
                stock_incubator: 2,
                size: null,
                color: null,
              },
            ],
          }),
        ),
      ).toBe(true);
    });
  });

  describe("admin order details stock checking", () => {
    const orderDetails = readFileSync(
      "src/routes/_authenticated/admin.b.$slug.orders.$id.tsx",
      "utf8",
    );

    it("determines custom item by location === 'custom' or !variant_id rather than size string", () => {
      expect(orderDetails).toMatch(
        /const isCustom = it\.location === "custom" \|\| !it\.variant_id;/,
      );
      expect(orderDetails).not.toContain(
        'it.selected_variant?.size && String(it.selected_variant.size).includes("تفصيل")',
      );
    });

    it("shows custom tailoring banner when item location is custom or manual", () => {
      // Whitespace-insensitive: Prettier may wrap the condition across lines.
      const normalized = orderDetails.replace(/\s+/g, " ");
      expect(normalized).toContain('it.location === "custom" ||');
      expect(normalized).toContain(
        '(!it.product_id || it.location === "custom" || it.variant_id === "custom") && (',
      );
    });
  });
});
