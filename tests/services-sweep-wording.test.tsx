import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { arNoun, arNounOblique, countOf } from "../src/lib/arabic-count";
import { ListPagination } from "../src/components/list-pagination";
import { BulkSelectionToolbar } from "../src/components/bulk-selection-toolbar";
import { inventoryScopeTabs } from "../src/features/inventory/lib/inventory-scope-tabs";
import { ServiceDetailsFields } from "../src/features/inventory/components/ServiceDetailsFields";

// The services sweep's wording bugs (2026-10-25, #46 and #49): counts glued to one form of a
// noun, and a services store's list and editor speaking of products.

const counts = { all: 6, attention: 0, active: 4, inactive: 2, low: 0, out: 0, featured: 0 };

describe("counts in Arabic", () => {
  it("count a service's lengths and appointments in every form", () => {
    expect(arNoun(1, "length")).toBe("مدة واحدة");
    expect(arNoun(2, "length")).toBe("مدتان");
    expect(arNoun(4, "length")).toBe("4 مدد");
    // After "حان وقت": the dual takes "ين" ("حان وقت موعدين"), never "2 موعد".
    expect(arNounOblique(2, "appointment")).toBe("موعدين");
    expect(arNounOblique(12, "appointment")).toBe("12 موعدًا");
    expect(countOf(3, "appointment", "en")).toBe("3 appointments");
  });

  it("read whole in a list's paging: never '6 منتج'", () => {
    render(
      <ListPagination
        lang="ar"
        noun="service"
        totalItems={6}
        page={1}
        pageSize={10}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("خدمات لكل صفحة:")).toBeInTheDocument();
    expect(screen.getByText("عرض 1-6 من 6 خدمات")).toBeInTheDocument();
  });

  it("read whole in English too", () => {
    render(
      <ListPagination
        lang="en"
        noun="customer"
        totalItems={1}
        page={1}
        pageSize={10}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Customers per page:")).toBeInTheDocument();
    expect(screen.getByText("Showing 1-1 of 1 customer")).toBeInTheDocument();
  });

  it("say what is selected after a colon", () => {
    const props = {
      allFilteredSelected: false,
      onSelectAll: vi.fn(),
      onDeselectAll: vi.fn(),
      onDeleteSelected: vi.fn(),
    };
    const { rerender } = render(
      <BulkSelectionToolbar lang="ar" noun="product" selectedCount={2} {...props} />,
    );
    expect(screen.getByText("المحدد: منتجان")).toBeInTheDocument();
    rerender(<BulkSelectionToolbar lang="en" noun="product" selectedCount={2} {...props} />);
    expect(screen.getByText("2 products selected")).toBeInTheDocument();
  });
});

describe("a services store's list and editor", () => {
  it("names its tabs for services", () => {
    const tabs = inventoryScopeTabs(counts, { tracksStock: false, services: true });
    expect(tabs.map((tab) => tab.label_ar)).toEqual([
      "جميع الخدمات",
      "نشط بالمتجر",
      "مخفي ومسودات",
      "الخدمات المميزة",
    ]);
    expect(inventoryScopeTabs(counts)[0].label_ar).toBe("جميع المنتجات");
  });

  it("offers 'both' as كلاهما, never الاثنين (which reads as Monday)", () => {
    render(
      <ServiceDetailsFields
        location="both"
        includes={[]}
        onLocation={vi.fn()}
        onIncludes={vi.fn()}
        isAr
      />,
    );
    expect(screen.getByText("كلاهما")).toBeInTheDocument();
    expect(screen.queryByText("الاثنين")).toBeNull();
  });
});
