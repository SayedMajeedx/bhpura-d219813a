import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("customers and inventory bulk selection", () => {
  it("paginates filtered customers and products with consistent page sizes", () => {
    const customersRoute = read("src/routes/_authenticated/admin.b.$slug.customers.tsx");
    const inventoryRoute = read("src/features/inventory/components/ProductsSection.tsx");
    const pagination = read("src/components/list-pagination.tsx");

    expect(customersRoute).toContain("paginatedCustomers");
    expect(customersRoute).toContain("customerTotalPages");
    expect(inventoryRoute).toContain("paginatedProducts");
    expect(inventoryRoute).toContain("inventoryTotalPages");
    expect(pagination).toContain("[10, 20, 50, 100]");
    expect(pagination).toContain("totalItems === 0 ? 0");
  });

  it("renders accessible row and select-all checkboxes on desktop and mobile", () => {
    const customersQueue = read("src/components/customers/CustomersWorkQueue.tsx");
    const customerCard = read("src/components/customers/CustomerMobileCard.tsx");
    const inventoryQueue = read("src/components/inventory/InventoryWorkQueue.tsx");
    const inventoryCard = read("src/components/inventory/InventoryMobileCard.tsx");

    expect(customersQueue).toContain("Select all customers on this page");
    expect(customersQueue).toContain("Select customer");
    expect(customerCard).toContain("onToggleSelected");
    expect(inventoryQueue).toContain("Select all products on this page");
    expect(inventoryQueue).toContain("Select product");
    expect(inventoryCard).toContain("onToggleSelected");
  });

  it("brand-scopes both individual and bulk customer deletion", () => {
    const route = read("src/routes/_authenticated/admin.b.$slug.customers.tsx");
    expect(route).toMatch(
      /rpc\("delete_brand_customers",\s*\{[\s\S]*?p_brand_id: brandId,[\s\S]*?p_customer_ids: \[id\]/,
    );
    expect(route).toMatch(
      /rpc\("delete_brand_customers",\s*\{[\s\S]*?p_brand_id: brandId,[\s\S]*?p_customer_ids: ids/,
    );
    expect(route).toContain("setBulkDeleteOpen(true)");
  });

  it("brand-scopes both individual and bulk product deletion", () => {
    // Product list code moved to src/features/inventory (Phase 5); the delete
    // itself lives in the catalog data layer (its brand filter is covered by
    // tests/catalog-mutations.test.ts).
    const productActions = read("src/features/inventory/hooks/use-product-actions.ts");
    const bulkActions = read("src/features/inventory/hooks/use-product-bulk-actions.ts");
    const section = read("src/features/inventory/components/ProductsSection.tsx");
    expect(productActions).toContain("deleteProducts(brandId, [id])");
    expect(bulkActions).toContain("deleteProducts(brandId, ids)");
    expect(section).toContain("setBulkDeleteOpen(true)");
  });
});
