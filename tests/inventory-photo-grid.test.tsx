import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  InventoryLayoutSwitch,
  InventoryPhotoGrid,
} from "../src/components/inventory/InventoryPhotoGrid";
import {
  DEFAULT_INVENTORY_VIEW,
  activeFilterCount,
  inventoryViewFromSearch,
  inventoryViewToSearch,
} from "../src/features/inventory/lib/list-view";

// The inventory as photos: a boutique knows a piece by its picture before its name. The layout
// lives in the address like the rest of the list's view.

const vocabulary = vi.hoisted(() => ({ useVocabulary: () => ({ vocabulary: {} }) }));
vi.mock("../src/hooks/use-vocabulary", () => vocabulary);
vi.mock("@/hooks/use-vocabulary", () => vocabulary);
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const product = (over: Record<string, unknown>) =>
  ({
    id: "p1",
    name: "Chiffon abaya",
    name_ar: "عباية شيفون",
    name_en: "Chiffon abaya",
    image_url: null,
    media: [],
    is_active: true,
    featured_trending: false,
    show_sale_badge: false,
    category: null,
    ...over,
  }) as never;

const grid = (over: Partial<React.ComponentProps<typeof InventoryPhotoGrid>> = {}) => {
  const props = {
    lang: "en" as const,
    products: [
      product({ id: "p1", image_url: "https://cdn.test/abaya.jpg" }),
      product({
        id: "p2",
        name: "Crepe",
        name_en: "Crepe",
        name_ar: "كريب",
        is_active: false,
        media: [{ type: "image", url: "https://cdn.test/crepe.jpg" }],
      }),
    ],
    photoRatio: "1:1" as const,
    currency: "BHD",
    productStock: (id: string) => (id === "p1" ? 3 : 0),
    lowestPrice: () => 48,
    weeklySalesOf: () => 0,
    missingCostOf: () => false,
    lowStockUnits: 5,
    pricesMatter: true,
    selectedProductIds: new Set<string>(),
    onToggleSelected: vi.fn(),
    onEdit: vi.fn(),
    ...over,
  };
  render(<InventoryPhotoGrid {...props} />);
  return props;
};

describe("the inventory's layout in the address", () => {
  it("is the list unless the address asks for photos, and is not a filter", () => {
    expect(DEFAULT_INVENTORY_VIEW.layout).toBe("list");
    expect(inventoryViewFromSearch({}).layout).toBe("list");
    expect(inventoryViewFromSearch({ view: "photos" }).layout).toBe("photos");
    expect(inventoryViewFromSearch({ view: "nope" }).layout).toBe("list");
    const photos = { ...DEFAULT_INVENTORY_VIEW, layout: "photos" as const };
    expect(inventoryViewToSearch("?tab=x", photos)).toBe("tab=x&view=photos");
    expect(inventoryViewToSearch("?view=photos", DEFAULT_INVENTORY_VIEW)).toBe("");
    expect(activeFilterCount(photos)).toBe(0);
  });
});

describe("the photos view", () => {
  it("draws each product's photo in the store's card shape, with its price and stock", () => {
    grid();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    const [first, second] = cards;
    expect(first.querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/abaya.jpg");
    expect(first.querySelector("img")?.parentElement?.className).toContain("aspect-square");
    // A product with no main picture shows its gallery's first, as the storefront does.
    expect(second.querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/crepe.jpg");
    expect(within(first).getByText(/48\.000/)).toBeTruthy();
    expect(within(second).getByText("Hidden")).toBeTruthy();
    expect(within(first).queryByText("Hidden")).toBeNull();
  });

  it("opens a product on a tap and selects it from its own box", () => {
    const props = grid();
    fireEvent.click(screen.getByRole("button", { name: "Edit Chiffon abaya" }));
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select product Crepe" }));
    expect(props.onToggleSelected).toHaveBeenCalledWith("p2");
    expect(props.onEdit).toHaveBeenCalledTimes(1);
  });

  it("names products in the reader's language", () => {
    grid({ lang: "ar" });
    expect(screen.getByRole("button", { name: "تعديل عباية شيفون" })).toBeTruthy();
  });
});

describe("the layout switch", () => {
  it("says which layout is shown and changes it", () => {
    const onChange = vi.fn();
    render(<InventoryLayoutSwitch lang="ar" layout="list" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "عرض كقائمة" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "عرض بالصور" }));
    expect(onChange).toHaveBeenCalledWith("photos");
  });
});
