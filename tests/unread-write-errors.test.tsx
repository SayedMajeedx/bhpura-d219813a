import React from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "../src/features/inventory/types";

// Writes that used to swallow their errors (bug backlog #16, #17): a product
// saved or duplicated without its variants says so, and the order editor's
// "new customer" keeps the dialog open when the address is refused.

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
const catalog = vi.hoisted(() => ({
  countAdminProducts: vi.fn(async () => 0),
  countProductVariants: vi.fn(async () => 0),
  createProduct: vi.fn(async () => "p-new"),
  createVariants: vi.fn(async () => undefined),
  deleteProducts: vi.fn(async () => undefined),
  fetchBarcodeLabelData: vi.fn(async () => []),
  syncVariantsWithProduct: vi.fn(async () => undefined),
  updateProduct: vi.fn(async () => undefined),
}));
const customers = vi.hoisted(() => ({
  createCustomer: vi.fn(async () => ({ id: "c1", name: "Sara" })),
  createCustomerAddress: vi.fn(async () => "a1"),
  invalidateCustomers: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("../src/lib/data/catalog", () => catalog);
vi.mock("@/lib/data/catalog", () => catalog);
vi.mock("../src/lib/data/customers", () => customers);
vi.mock("@/lib/data/customers", () => customers);
const session = { getCurrentUser: async () => ({ id: "u1" }) };
vi.mock("../src/lib/auth/session", () => session);
vi.mock("@/lib/auth/session", () => session);
const brandContext = { useBrand: () => ({ id: "b1", slug: "pura" }) };
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);
const entitlements = { useEntitlements: () => ({ entitlements: { limits: {} } }) };
vi.mock("../src/lib/saas-billing/use-entitlements", () => entitlements);
vi.mock("@/lib/saas-billing/use-entitlements", () => entitlements);
const i18n = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useT: () => (key: string) => key,
});
vi.mock("../src/lib/i18n", (io) => i18n(io));
vi.mock("@/lib/i18n", (io) => i18n(io));
const translations = { prefetchOptionTranslations: vi.fn() };
vi.mock("../src/features/inventory/lib/option-translations", () => translations);
vi.mock("@/features/inventory/lib/option-translations", () => translations);
const phoneInput = {
  PhoneInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Phone" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
};
vi.mock("../src/components/phone-input", () => phoneInput);
vi.mock("@/components/phone-input", () => phoneInput);

const { useSaveProduct } = await import("../src/features/inventory/hooks/use-save-product");
const { useProductActions } = await import("../src/features/inventory/hooks/use-product-actions");
const { productFormFrom } = await import("../src/features/inventory/lib/product-form");
const { NewCustomerDialog } = await import("../src/features/orders/components/NewCustomerDialog");

beforeEach(() => {
  vi.clearAllMocks();
});

const product = { id: "p1", name: "Abaya", base_price: 20, is_active: true } as Product;
const refused = { message: "permission denied for table product_variants" };

describe("saving a product whose default variant is refused", () => {
  const save = async (existing: Product | null) => {
    const onSaved = vi.fn();
    const form = { ...productFormFrom(existing ?? undefined), name_en: "Abaya", is_active: true };
    const { result } = renderHook(() =>
      useSaveProduct({
        product: existing,
        form,
        isAr: false,
        setErrors: vi.fn(),
        onInvalid: vi.fn(),
        commitMedia: vi.fn(),
        onSaved,
      }),
    );
    await act(() => result.current({ preventDefault: vi.fn() } as unknown as React.MouseEvent));
    return onSaved;
  };

  it.each([
    ["an update", product],
    ["a new product", null],
  ])("saves %s and says it cannot be bought yet", async (_, existing) => {
    catalog.createVariants.mockRejectedValueOnce(refused);
    const onSaved = await save(existing);
    expect(catalog.createVariants).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("its default variant could not be created"),
      expect.anything(),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("confirms an update whose default variant was created", async () => {
    await save(product);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("common.save");
  });
});

describe("duplicating a product whose variants are refused", () => {
  it("says the draft copy has no variants instead of reporting success", async () => {
    catalog.createVariants.mockRejectedValueOnce(refused);
    const onChanged = vi.fn();
    const variant = { id: "v1", product_id: "p1", size: "M", selling_price: 20, cost_price: 5 };
    const { result } = renderHook(() =>
      useProductActions({
        products: [product],
        variants: [variant] as never,
        variantsByProduct: {},
        businessName: null,
        isAr: false,
        onChanged,
      }),
    );
    await act(() => result.current.handleDuplicateProduct(product));
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("its variants could not be copied"),
      expect.anything(),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});

describe("the order editor's new customer dialog", () => {
  const renderDialog = () => {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewCustomerDialog
          open
          onOpenChange={onOpenChange}
          brandId="b1"
          lang="en"
          onCreated={onCreated}
        />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. Ali Mohamed"), {
      target: { value: "Sara" },
    });
    fireEvent.change(screen.getByPlaceholderText("Block (e.g. 321)"), {
      target: { value: "321" },
    });
    return { onCreated, onOpenChange };
  };

  it("keeps the dialog open when the address is refused, then retries only the address", async () => {
    customers.createCustomerAddress.mockRejectedValueOnce(refused);
    const { onCreated, onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Save & Assign Customer/ }));
    await screen.findByRole("button", { name: /Retry address/ });
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("the address could not be saved"),
      expect.anything(),
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Retry address/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("c1", "a1"));
    expect(customers.createCustomer).toHaveBeenCalledTimes(1);
    expect(customers.createCustomerAddress).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("can continue without the address once the customer exists", async () => {
    customers.createCustomerAddress.mockRejectedValueOnce(refused);
    const { onCreated } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Save & Assign Customer/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue without address" }));
    expect(onCreated).toHaveBeenCalledWith("c1", null);
  });
});
