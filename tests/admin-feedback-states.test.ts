import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customers = readFileSync("src/routes/_authenticated/admin.b.$slug.customers.tsx", "utf8");
const inventory = readFileSync("src/routes/_authenticated/admin.b.$slug.inventory.tsx", "utf8");
const settings = readFileSync("src/routes/_authenticated/admin.b.$slug.settings.tsx", "utf8");
const settingsHeader = readFileSync("src/components/settings/SettingsCommandHeader.tsx", "utf8");

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
    expect(inventory).toContain("No matching products");
    expect(inventory).toContain("Add Product");
  });

  it("shows the shared save action only for settings sections it actually owns", () => {
    expect(settings).toContain('showSave={activeTab === "business" || activeTab === "invoice"}');
    expect(settings).not.toContain("{saveButton}");
    expect(settingsHeader).toContain("Save This Section");
    expect(settingsHeader).not.toContain("Save All Changes");
  });
});
