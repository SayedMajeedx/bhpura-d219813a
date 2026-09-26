import React from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const data = vi.hoisted(() => ({
  deleteCustomers: vi.fn(async () => undefined),
  invalidateCustomers: vi.fn(async () => undefined),
  deleteProducts: vi.fn(async () => undefined),
  updateProducts: vi.fn(async () => undefined),
  deletePublicMediaUrl: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast }));
const customers = {
  deleteCustomers: data.deleteCustomers,
  invalidateCustomers: data.invalidateCustomers,
};
const catalog = { deleteProducts: data.deleteProducts, updateProducts: data.updateProducts };
const r2 = { deletePublicMediaUrl: data.deletePublicMediaUrl };
vi.mock("../src/lib/data/customers", () => customers);
vi.mock("@/lib/data/customers", () => customers);
vi.mock("../src/lib/data/catalog", () => catalog);
vi.mock("@/lib/data/catalog", () => catalog);
vi.mock("../src/lib/r2-upload", () => r2);
vi.mock("@/lib/r2-upload", () => r2);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));

const { useCustomerDeletion } =
  await import("../src/features/customers/hooks/use-customer-deletion");
const { useProductBulkActions } =
  await import("../src/features/inventory/hooks/use-product-bulk-actions");
const { ListPagination } = await import("../src/components/list-pagination");
const { CustomersWorkQueue } = await import("../src/components/customers/CustomersWorkQueue");
const { InventoryWorkQueue } = await import("../src/components/inventory/InventoryWorkQueue");
const { I18nProvider } = await import("../src/lib/i18n");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <I18nProvider>{children}</I18nProvider>
  </QueryClientProvider>
);

describe("customers and inventory bulk selection", () => {
  it("paginates with fixed page sizes and an empty-safe range", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const { rerender } = render(
      <ListPagination
        lang="en"
        entityAr="عميل"
        entityEn="Customers"
        totalItems={45}
        page={1}
        pageSize={20}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    expect(screen.getByText("Showing 1-20 of 45 customers")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    const sizes = screen.getByRole("combobox", { name: "Items per page" });
    fireEvent.pointerDown(sizes, { button: 0, ctrlKey: false, pointerType: "mouse" });
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["10", "20", "50", "100"]);
    fireEvent.click(screen.getByRole("option", { name: "50" }));
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
    rerender(
      <ListPagination
        lang="en"
        entityAr="عميل"
        entityEn="Customers"
        totalItems={0}
        page={1}
        pageSize={20}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    expect(screen.getByText("Showing 0-0 of 0 customers")).toBeInTheDocument();
  });

  it("renders accessible select-all and row checkboxes", () => {
    const onToggleCustomer = vi.fn();
    const onToggleAll = vi.fn();
    render(
      <CustomersWorkQueue
        lang="en"
        customers={[{ id: "c1", name: "Fatima", phone: "97339001122" }]}
        defaultByCustomer={new Map()}
        customerCrmStats={new Map()}
        currency="BHD"
        isLoading={false}
        isError={false}
        onSelectCustomer={vi.fn()}
        onDeleteCustomer={vi.fn()}
        selectedCustomerIds={new Set()}
        onToggleCustomer={onToggleCustomer}
        onToggleAll={onToggleAll}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all customers on this page" }));
    expect(onToggleAll).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select customer Fatima" }));
    expect(onToggleCustomer).toHaveBeenCalledWith("c1");
  });

  it("renders the inventory list's select-all and row checkboxes", () => {
    const onToggleProduct = vi.fn();
    const onToggleAll = vi.fn();
    render(
      <InventoryWorkQueue
        lang="en"
        products={[{ id: "p1", name: "Silk Abaya", name_en: "Silk Abaya", is_active: true }]}
        variantsByProduct={{ p1: [] }}
        isLoading={false}
        isError={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onPrintLabel={vi.fn()}
        selectedProductIds={new Set(["p1"])}
        onToggleProduct={onToggleProduct}
        onToggleAll={onToggleAll}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all products on this page" }));
    expect(onToggleAll).toHaveBeenCalledTimes(1);
    const row = screen.getByRole("checkbox", { name: "Select product Silk Abaya" });
    expect(row).toBeChecked();
    fireEvent.click(row);
    expect(onToggleProduct).toHaveBeenCalledWith("p1");
  });

  it("brand-scopes both individual and bulk customer deletion", async () => {
    const { result } = renderHook(() => useCustomerDeletion({ brandId: "b1", isAr: false }), {
      wrapper,
    });
    act(() => result.current.toggleCustomers(["c1", "c2"]));
    expect([...result.current.selectedCustomerIds]).toEqual(["c1", "c2"]);
    // Toggling a fully selected page clears it; select-all adds; clear empties.
    act(() => result.current.toggleCustomers(["c1", "c2"]));
    expect(result.current.selectedCustomerIds.size).toBe(0);
    act(() => result.current.selectCustomers(["c1", "c3"]));
    act(() => result.current.toggleCustomer("c3"));
    expect([...result.current.selectedCustomerIds]).toEqual(["c1"]);

    await act(() => result.current.deleteSelectedCustomers());
    expect(data.deleteCustomers).toHaveBeenCalledWith("b1", ["c1"]);
    expect(result.current.selectedCustomerIds.size).toBe(0);
    expect(toast.success).toHaveBeenCalledWith("1 customers deleted");

    await act(() => result.current.deleteCustomer("c9"));
    expect(data.deleteCustomers).toHaveBeenLastCalledWith("b1", ["c9"]);
  });

  it("keeps the selection and explains when a bulk customer delete fails", async () => {
    data.deleteCustomers.mockRejectedValueOnce(new Error("permission denied"));
    const { result } = renderHook(() => useCustomerDeletion({ brandId: "b1", isAr: false }), {
      wrapper,
    });
    act(() => result.current.selectCustomers(["c1"]));
    await act(() => result.current.deleteSelectedCustomers());
    expect(toast.error).toHaveBeenCalledWith("permission denied");
    expect(result.current.selectedCustomerIds.size).toBe(1);
    expect(result.current.bulkDeleting).toBe(false);
  });

  it("brand-scopes bulk product deletion and cleans up each image once", async () => {
    const onChanged = vi.fn();
    const products = [
      { id: "p1", image_url: "https://cdn/a.jpg", media: [{ url: "https://cdn/a.jpg" }] },
      { id: "p2", image_url: null, media: [{ url: "https://cdn/b.jpg" }] },
      { id: "p3", image_url: "https://cdn/c.jpg", media: [] },
    ];
    const { result } = renderHook(() =>
      useProductBulkActions({
        brandId: "b1",
        products: products as never[],
        isAr: false,
        onChanged,
      }),
    );
    act(() => result.current.toggleSelectedProduct("p1"));
    act(() => result.current.toggleSelectedProduct("p2"));
    await act(() => result.current.deleteSelectedProducts());
    expect(data.deleteProducts).toHaveBeenCalledWith("b1", ["p1", "p2"]);
    await waitFor(() => expect(data.deletePublicMediaUrl).toHaveBeenCalledTimes(2));
    expect(data.deletePublicMediaUrl).toHaveBeenCalledWith("b1", "https://cdn/a.jpg");
    expect(data.deletePublicMediaUrl).toHaveBeenCalledWith("b1", "https://cdn/b.jpg");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
