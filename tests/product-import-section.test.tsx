import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Import page's product section had its own copy of the importer, with the same bug as the
// inventory's (#51) and one more: a row with no name became "Product 3". It now builds its
// products with the inventory importer's rules and says what came in hidden or was left out.

const calls = vi.hoisted(() => ({
  importProductCatalog: vi.fn(async ({ data }: { data: { products: unknown[] } }) => ({
    successCount: data.products.length,
    skippedCount: 0,
    failedCount: 0,
    issues: [],
  })),
  settings: { storefront_mode: "shop", catalog_show_prices: true } as Record<string, unknown>,
}));

const importer = { importProductCatalog: calls.importProductCatalog };
vi.mock("../src/lib/universal-importer", () => importer);
vi.mock("@/lib/universal-importer", () => importer);
const profile = {
  useAdminStoreProfile: () => ({ profile: { modules: { stock: true } } }),
};
vi.mock("../src/hooks/use-store-profile", () => profile);
vi.mock("@/hooks/use-store-profile", () => profile);
const settingsModule = {
  businessSettingsQueries: {
    detail: (brandId: string) => ({
      queryKey: ["business-settings", brandId],
      queryFn: async () => calls.settings,
    }),
  },
};
vi.mock("../src/lib/data/business-settings", () => settingsModule);
vi.mock("@/lib/data/business-settings", () => settingsModule);
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast }));

const { ProductImportSection } =
  await import("../src/features/import-export/components/ProductImportSection");

const BRAND = "00000000-0000-4000-8000-0000000000b1";

async function importFile(csv: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <ProductImportSection brandId={BRAND} isAr={false} onComplete={() => undefined} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(client.getQueryData(["business-settings", BRAND])).toBeTruthy());
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File([csv], "products.csv", { type: "text/csv" })] },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Start Importing" }));
  await screen.findByText("Catalog Migration Completed!");
  return calls.importProductCatalog.mock.calls.flatMap(
    ([args]) => (args as { data: { products: any[] } }).data.products,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.settings = { storefront_mode: "shop", catalog_show_prices: true };
});

describe("the Import page's product section", () => {
  it("makes up no price, stock, description or name", async () => {
    const products = await importFile("Name,Image\nBlack Abaya,https://a.jpg\n,https://b.jpg\n");
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      name: "Black Abaya",
      description: null,
      is_active: false,
      image_url: "https://a.jpg",
    });
    expect(products[0].variants[0]).toMatchObject({ selling_price: 0, stock_main: 0 });
    expect(screen.getByRole("status")).toHaveTextContent("1 product came in hidden");
    expect(screen.getByText("Rows with no product name were left out: 1.")).toBeTruthy();
  });

  it("keeps a stock of 0 as written", async () => {
    const products = await importFile("Name,Price,Stock\nShawl,8.500,0\n");
    expect(products[0].variants[0]).toMatchObject({ selling_price: 8.5, stock_main: 0 });
    expect(products[0].is_active).toBe(true);
  });

  it("shows an unpriced product in a catalog that shows no prices", async () => {
    calls.settings = { storefront_mode: "catalog", catalog_show_prices: false };
    const products = await importFile("Name\nAbaya\n");
    expect(products[0].is_active).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
