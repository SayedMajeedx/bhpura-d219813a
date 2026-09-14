import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

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
      expect(inventory).toMatch(/is_made_to_order\?: boolean \| null;/);
    });

    it("initializes and resets is_made_to_order in form state", () => {
      expect(inventory).toContain("is_made_to_order: product?.is_made_to_order ?? false");
    });

    it("persists is_made_to_order in both patch and payload updates", () => {
      expect(inventory).toMatch(/is_made_to_order: Boolean\(form\.is_made_to_order\)/);
    });

    it("auto-enables is_made_to_order when selecting a Passport preset", () => {
      expect(inventory).toContain(
        "is_made_to_order: isPassportPreset ? true : form.is_made_to_order",
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
    const queries = readFileSync("src/lib/storefront-queries.ts", "utf8");
    const pdp = readFileSync("src/routes/$slug.product.$id.tsx", "utf8");

    it("queries is_made_to_order in storefront-queries", () => {
      expect(queries).toContain("is_made_to_order, base_price");
    });

    it("includes is_made_to_order in PDP primary fields", () => {
      expect(pdp).toContain("custom_fields, is_made_to_order, base_price");
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
      expect(pdp).toContain('isTailoringActive ? t("تفصيل", "Custom Tailoring") : null');
    });
  });

  describe("product card & storefront catalog stock check", () => {
    const card = readFileSync("src/components/storefront/product-card.tsx", "utf8");
    const catalog = readFileSync("src/routes/$slug.index.tsx", "utf8");

    it("calculates oos in product card using is_made_to_order instead of custom_fields length", () => {
      expect(card).toContain("const isMadeToOrder = Boolean(product.is_made_to_order);");
      expect(card).toContain("const oos = !isMadeToOrder && totalStock <= 0;");
    });

    it("uses product.is_made_to_order in hasAvailableStock in catalog index", () => {
      expect(catalog).toContain("if (product.is_made_to_order) {");
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
      expect(orderDetails).toContain('it.location === "custom" ||');
      expect(orderDetails).toContain('(!it.variant_id || it.location === "custom") && (');
    });
  });
});
