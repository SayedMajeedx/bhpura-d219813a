import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Measured on a real store (2026-10-18): the admin's list searches were named by a placeholder
// only (gone once a word is typed), the size guide studio had 12 arrow and bin buttons and 48
// fields with no name, a category's delete, a discount's on switch, the content studio's
// sliders and an order line's quantity and description had none either. A screen reader read
// "button" or "edit text" and voice control had nothing to say.

vi.mock("@/components/addons/AddonsProvider", () => ({
  useAddons: () => ({ isInstalled: () => false }),
}));
vi.mock("../src/components/addons/AddonsProvider", () => ({
  useAddons: () => ({ isInstalled: () => false }),
}));

const { studioNames } = await import("../src/addons/size-guides/lib/studio-names");
const { DiscountMobileCard } = await import("../src/components/discounts/DiscountMobileCard");
const { CategoriesWorkQueue } = await import("../src/components/categories/CategoriesWorkQueue");
const { OrdersToolbar } = await import("../src/components/orders/OrdersToolbar");

const noop = () => {};

describe("the size guide studio's names", () => {
  it("count from one, as the page shows its columns, rows and steps", () => {
    const en = studioNames(false);
    expect(en.moveUp(0)).toBe("Move column 1 up");
    expect(en.deleteColumn(2)).toBe("Delete column 3");
    expect(en.rowSize(1)).toBe("Size in row 2");
    expect(en.stepTitleEn(0)).toBe("Step 1 title (English)");
    expect(en.cell("Bust", "M")).toBe("Bust · M");
  });

  it("are written in Arabic for an Arabic reader", () => {
    const ar = studioNames(true);
    expect(ar.moveDown(0)).toBe("نقل العمود 1 للأسفل");
    expect(ar.deleteStep(1)).toBe("حذف الخطوة 2");
    expect(ar.removePicture).toBe("إزالة الصورة");
  });
});

describe("controls that showed only an icon", () => {
  const promo = {
    id: "p1",
    brand_id: "b1",
    code: "EID10",
    discount_type: "percentage" as const,
    discount_value: 10,
    minimum_order_amount: null,
    maximum_discount_amount: null,
    first_time_customers_only: false,
    returning_customers_only: false,
    exclude_sale_items: false,
    usage_limit_per_customer: null,
    is_active: true,
    created_at: "2026-10-01T00:00:00Z",
    exclude_low_margin: false,
    margin_threshold: 0,
    start_date: null,
    end_date: null,
    max_redemptions: null,
  };

  it("a discount's switch names its code", () => {
    const props = { promo, currency: "BHD", onEdit: noop, onToggleActive: noop, onDelete: noop };
    const { unmount } = render(<DiscountMobileCard lang="en" {...props} />);
    expect(screen.getByRole("switch", { name: "EID10 active" })).toBeTruthy();
    unmount();
    render(<DiscountMobileCard lang="ar" {...props} />);
    expect(screen.getByRole("switch", { name: "تفعيل EID10" })).toBeTruthy();
  });

  it("a category's delete is named on a phone and on a wide screen", () => {
    const category = { id: "c1", name_en: "Abayas", name_ar: "عبايات", product_count: 3 };
    render(
      <CategoriesWorkQueue
        lang="en"
        categories={[category]}
        isLoading={false}
        onEdit={noop}
        onDelete={noop}
        onReorder={noop}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Delete category" })).toHaveLength(2);
  });
});

describe("a list's search", () => {
  it("keeps its name once something is typed in it", () => {
    render(
      <OrdersToolbar
        lang="en"
        search="Fatima"
        onSearchChange={noop}
        paymentFilter="all"
        onPaymentFilterChange={noop}
        fulfillmentStatusFilter="all"
        onFulfillmentStatusFilterChange={noop}
        fulfillmentMethodFilter="all"
        onFulfillmentMethodFilterChange={noop}
        gatewayFilter="all"
        onGatewayFilterChange={noop}
        includeHistorical={false}
        onIncludeHistoricalChange={noop}
        sortOrder="newest"
        onSortOrderChange={noop}
        activeFilterCount={0}
        onClearFilters={noop}
      />,
    );
    const search = screen.getByDisplayValue("Fatima");
    expect(search.getAttribute("aria-label")).toBe(search.getAttribute("placeholder"));
    expect(search.getAttribute("aria-label")).toBeTruthy();
  });
});
