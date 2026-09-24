import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customers = readFileSync("src/routes/_authenticated/admin.b.$slug.customers.tsx", "utf8");
const inventory = readFileSync("src/routes/_authenticated/admin.b.$slug.inventory.tsx", "utf8");
const settings = readFileSync("src/routes/_authenticated/admin.b.$slug.settings.tsx", "utf8");
const settingsHeader = readFileSync("src/features/settings/SettingsHeader.tsx", "utf8");

describe("admin feedback states", () => {
  it("offers safe retry states without presenting failed queries as empty data", () => {
    expect(customers).toContain("customersError || addressesQ.isError || ordersQ.isError");
    expect(customers).toContain("Customers could not be loaded");
    expect(inventory).toContain("Inventory could not be loaded");
    expect(inventory).toContain("products.refetch()");
  });

  it("gives mobile and desktop users a useful empty-state action", () => {
    expect(customers).toContain("No matching customers");
    expect(customers).toContain("Clear Filters");
    // The inventory empty state moved to its own component (Phase 5).
    const inventoryEmpty = readFileSync(
      "src/features/inventory/components/InventoryEmptyState.tsx",
      "utf8",
    );
    expect(inventoryEmpty).toContain("No matching products");
    expect(inventoryEmpty).toContain("Add Product");
  });

  it("shows the shared save action only when the unified settings form is dirty", () => {
    // The settings route is a thin shell; the save/discard controls live in the
    // unified header and render only when there are unsaved changes.
    expect(settings).toContain("SettingsPage");
    expect(settings).not.toContain("{saveButton}");
    expect(settingsHeader).toContain("{isDirty && (");
    expect(settingsHeader).not.toContain("Save All Changes");
  });
});
