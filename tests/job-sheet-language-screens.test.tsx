import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// The job sheet and the supplier's message open on the supplier's own language (Arabic, English
// or both side by side) and print or write the one chosen.

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

const VENDOR = "00000000-0000-4000-8000-0000000000v1";

const profile = vi.hoisted(() => ({
  useProfileOptional: () => ({
    canViewFinancials: true,
    isAdmin: true,
    hasPermission: () => true,
  }),
}));
vi.mock("../src/lib/profile-context", () => profile);
vi.mock("@/lib/profile-context", () => profile);

const vendorLanguage = vi.hoisted(() => ({ value: "both" as string | null }));
const accounting = vi.hoisted(() => ({
  setVendorLanguage: vi.fn(async () => {}),
  invalidateVendors: vi.fn(async () => {}),
  accountingQueries: {
    vendorOptions: () => ({
      queryKey: ["job-sheet-lang", "vendors", vendorLanguage.value],
      queryFn: async () => [
        {
          id: "00000000-0000-4000-8000-0000000000v1",
          name: "Umm Ali",
          preferred_language: vendorLanguage.value,
        },
      ],
    }),
  },
}));
vi.mock("../src/lib/data/accounting", () => accounting);
vi.mock("@/lib/data/accounting", () => accounting);

const supplierOrders = vi.hoisted(() => ({
  supplierOrderQueries: {
    orderPieces: () => ({
      queryKey: ["job-sheet-lang", "pieces"],
      queryFn: async () => [
        {
          id: "pol-1",
          order_item_id: "item-1",
          quantity: 1,
          received_quantity: 0,
          unit_cost: 12,
          purpose: "make",
          work_note: null,
          po_id: "po-1",
          po_number: "PO-0007",
          po_status: "ordered",
          expected_at: "2026-11-12",
          vendor_id: "00000000-0000-4000-8000-0000000000v1",
          vendor_name: "Umm Ali",
        },
      ],
    }),
    pieceDetails: () => ({ queryKey: ["job-sheet-lang", "details"], queryFn: async () => [] }),
  },
}));
vi.mock("../src/lib/data/supplier-orders", () => supplierOrders);
vi.mock("@/lib/data/supplier-orders", () => supplierOrders);

const returnsData = vi.hoisted(() => ({
  returnsQueries: {
    forOrder: () => ({ queryKey: ["job-sheet-lang", "returns"], queryFn: async () => [] }),
  },
}));
vi.mock("../src/lib/data/returns", () => returnsData);
vi.mock("@/lib/data/returns", () => returnsData);

const storeProfile = vi.hoisted(() => ({
  useAdminStoreProfile: () => ({
    profile: { addons: [], vertical: "fashion", modules: { made_to_order: true } },
  }),
}));
vi.mock("../src/hooks/use-store-profile", () => storeProfile);
vi.mock("@/hooks/use-store-profile", () => storeProfile);

const vocabulary = vi.hoisted(() => ({
  useVocabulary: () => ({ vocabulary: { workshop: { ar: "الخيّاط", en: "Tailor" } } }),
}));
vi.mock("../src/hooks/use-vocabulary", () => vocabulary);
vi.mock("@/hooks/use-vocabulary", () => vocabulary);

import { OrderSalesDocumentsCard } from "../src/components/orders/OrderSalesDocumentsCard";
import { SupplierMessageDialog } from "../src/features/supplier-orders/components/SupplierMessageDialog";
import { VendorLanguageSelect } from "../src/features/supplier-orders/components/VendorLanguageSelect";
import type { SupplierCatalog } from "../src/features/supplier-orders/hooks/use-supplier-catalog";

const wrap = (node: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};

const order = {
  id: "11111111-1111-4111-8111-111111111111",
  brand_id: "b1",
  invoice_number: 1042,
  created_at: "2026-11-03T08:00:00Z",
  total: 30,
  status: "processing",
  payment_status: "unpaid",
};

describe("printing a job sheet", () => {
  it("opens on the language of the supplier holding the piece", async () => {
    vendorLanguage.value = "both";
    const print = vi.fn();
    wrap(
      <OrderSalesDocumentsCard
        order={order}
        items={[{ id: "item-1", description: "Abaya", quantity: 1, location: "custom" }]}
        brand={{ id: "b1", name_en: "Pura" }}
        currency="BHD"
        lang="ar"
        slug="pura"
        workshop={{ printJobSheet: print }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "طباعة أمر التشغيل" }));
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "الاثنتان معاً" }).getAttribute("aria-checked"),
      ).toBe("true"),
    );
    fireEvent.click(screen.getByRole("button", { name: "طباعة" }));
    expect(print).toHaveBeenCalledWith("both");
  });
});

describe("the supplier's message", () => {
  const catalog = {
    products: [],
    productName: () => "Abaya",
    sizeName: () => "54",
  } as unknown as SupplierCatalog;
  const supplierOrder = {
    id: "po-1",
    po_number: "PO-0007",
    status: "ordered" as const,
    vendor_id: VENDOR,
    vendor_name: "Umm Ali",
    vendor_phone: "+97333334444",
    total_amount: 12,
    paid_amount: 0,
    expected_at: "2026-11-12",
    received_at: null,
    created_at: "2026-11-03T08:00:00Z",
    notes: null,
    items: [
      {
        id: "pol-2",
        variant_id: "var-54",
        product_id: "prod-1",
        description: "Abaya",
        quantity: 2,
        received_quantity: 0,
        unit_cost: 6,
        line_total: 12,
        sort_order: 0,
      },
    ],
  };
  const open = () =>
    wrap(
      <SupplierMessageDialog
        open
        onOpenChange={() => {}}
        brandId="b1"
        order={supplierOrder}
        catalog={catalog}
        storeName="Pura"
        currency="BHD"
        lang="ar"
      />,
    );

  it("is written in the supplier's language on an Arabic screen", async () => {
    vendorLanguage.value = "en";
    open();
    await waitFor(() => expect(screen.getByText(/Hello Umm Ali/)).toBeTruthy());
    expect(screen.queryByText(/السلام عليكم/)).toBeNull();
  });

  it("can be written in both, the Arabic first", async () => {
    vendorLanguage.value = null;
    open();
    await waitFor(() => expect(screen.getByText(/السلام عليكم Umm Ali/)).toBeTruthy());
    fireEvent.click(screen.getByRole("radio", { name: "الاثنتان معاً" }));
    const text = (await screen.findByText(/Hello Umm Ali/)).textContent ?? "";
    expect(text.indexOf("السلام عليكم")).toBeLessThan(text.indexOf("Hello Umm Ali"));
  });
});

describe("a supplier's language on the suppliers list", () => {
  it("is saved at once, and 'the screen's language' clears it", async () => {
    wrap(<VendorLanguageSelect brandId="b1" vendorId={VENDOR} value="ar" lang="en" />);
    const select = screen.getByLabelText("Job sheets and messages in") as HTMLSelectElement;
    expect(select.value).toBe("ar");
    fireEvent.change(select, { target: { value: "both" } });
    await waitFor(() =>
      expect(accounting.setVendorLanguage).toHaveBeenCalledWith("b1", VENDOR, "both"),
    );
    fireEvent.change(select, { target: { value: "" } });
    await waitFor(() =>
      expect(accounting.setVendorLanguage).toHaveBeenLastCalledWith("b1", VENDOR, null),
    );
    expect(accounting.invalidateVendors).toHaveBeenCalled();
  });
});
