import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hasAvailableStock, type ProductRow } from "../src/lib/data/storefront/types";
import {
  PRODUCT_CARD_SELECT,
  PRODUCT_DETAIL_BASE_SELECT,
  PRODUCT_DETAIL_SELECT,
} from "../src/lib/data/storefront/selects";
import {
  showsCustomSizing,
  tailoringState,
} from "../src/features/product-page/lib/variant-options";
import { productColumnsFrom, productFormFrom } from "../src/features/inventory/lib/product-form";
import { isCustomLine, isTailoredLine } from "../src/features/orders/lib/order-editor";

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
    it("initializes, resets and persists is_made_to_order in the product form", () => {
      expect(productFormFrom(null).is_made_to_order).toBe(false);
      const product = { is_made_to_order: true } as Parameters<typeof productFormFrom>[0];
      const form = productFormFrom(product);
      expect(form.is_made_to_order).toBe(true);
      expect(productColumnsFrom(form).is_made_to_order).toBe(true);
      expect(productColumnsFrom({ ...form, is_made_to_order: false }).is_made_to_order).toBe(false);
    });
  });

  describe("storefront queries and Product Detail Page (PDP)", () => {
    it("fetches is_made_to_order for the product page, quick view and product grids", () => {
      expect(PRODUCT_DETAIL_SELECT).toContain("is_made_to_order");
      expect(PRODUCT_DETAIL_BASE_SELECT).toContain("is_made_to_order");
      expect(PRODUCT_CARD_SELECT).toContain("is_made_to_order");
    });

    it("decouples isTailoringActive and showSizeModeToggle to require is_made_to_order", () => {
      // The rule itself lives in tailoringState (tests/storefront-tailoring-experience.test.tsx).
      const readyToWear = {
        hasCustomFields: true,
        madeToOrderModule: true,
        sizeMode: "custom" as const,
      };
      expect(
        tailoringState({ ...readyToWear, isMadeToOrder: false, offeredSizes: ["M"] }),
      ).toMatchObject({ showSizeModeToggle: false, isTailoringActive: false });
      expect(
        tailoringState({ ...readyToWear, isMadeToOrder: true, offeredSizes: ["M"] }),
      ).toMatchObject({ showSizeModeToggle: true, isTailoringActive: true });
    });

    it("does not tag ready-to-wear items with custom fields as custom tailoring", () => {
      const readyToWear = tailoringState({
        isMadeToOrder: false,
        offeredSizes: ["M"],
        hasCustomFields: true,
        madeToOrderModule: true,
        sizeMode: "ready",
      });
      expect(showsCustomSizing({ ...readyToWear, sizeMode: "ready" })).toBe(false);
      const tailoredOnly = tailoringState({
        isMadeToOrder: true,
        offeredSizes: [],
        hasCustomFields: true,
        madeToOrderModule: true,
        sizeMode: "custom",
      });
      expect(showsCustomSizing({ ...tailoredOnly, sizeMode: "custom" })).toBe(true);
      const toggle = { showSizeModeToggle: true, hasReadySizes: true, isTailoringActive: true };
      expect(showsCustomSizing({ ...toggle, sizeMode: "custom" })).toBe(true);
      expect(showsCustomSizing({ ...toggle, sizeMode: "ready", isTailoringActive: false })).toBe(
        false,
      );
    });
  });

  describe("product card & storefront catalog stock check", () => {
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
    const line = (overrides: Record<string, unknown>) => ({
      product_id: "p1",
      variant_id: "v1",
      location: null,
      selected_variant: { size: "تفصيل خاص", color: null, fabric: null },
      ...overrides,
    });

    it("determines custom item by location === 'custom' or !variant_id rather than size string", () => {
      // A catalog variant whose size text says "tailored" is still a catalog line.
      expect(isCustomLine(line({}) as never)).toBe(false);
      expect(isCustomLine(line({ location: "custom" }) as never)).toBe(true);
      expect(isCustomLine(line({ variant_id: null }) as never)).toBe(true);
    });

    it("shows custom tailoring banner when item location is custom or manual", () => {
      expect(isTailoredLine(line({}) as never)).toBe(false);
      expect(isTailoredLine(line({ location: "custom" }) as never)).toBe(true);
      expect(isTailoredLine(line({ product_id: null }) as never)).toBe(true);
      expect(isTailoredLine(line({ variant_id: "custom" }) as never)).toBe(true);
    });
  });
});
