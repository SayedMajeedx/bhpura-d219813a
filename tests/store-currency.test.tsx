import React from "react";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currencyLabel } from "../src/lib/currency-label";
import { promoFailureMessage } from "../src/features/orders/lib/order-editor";

// Money on the admin's screens is written in the store's own currency. The accounting tabs, the
// returns dialogs, a customer's page and some twenty field labels once said "BHD" (and "د.ب")
// whatever the store's settings said.

const store = vi.hoisted(() => ({
  currency: "SAR" as string | null,
  movements: [] as unknown[],
}));
const settings = {
  businessSettingsQueries: {
    detail: (brandId: string) => ({
      queryKey: ["settings", brandId],
      queryFn: async () => ({ currency: store.currency }),
    }),
  },
};
vi.mock("../src/lib/data/business-settings", () => settings);
vi.mock("@/lib/data/business-settings", () => settings);
const brand = {
  useBrandOptional: () => ({ id: "b1", slug: "zh" }),
  useBrand: () => ({ id: "b1", slug: "zh" }),
};
vi.mock("../src/lib/brand-context", () => brand);
vi.mock("@/lib/brand-context", () => brand);
const accounting = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { accountingQueries: object };
  return {
    ...actual,
    accountingQueries: {
      ...actual.accountingQueries,
      cashMovements: () => ({ queryKey: ["movements"], queryFn: async () => store.movements }),
    },
  };
};
vi.mock("../src/lib/data/accounting", (io) => accounting(io));
vi.mock("@/lib/data/accounting", (io) => accounting(io));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { useMoneyLabel, useStoreCurrency } = await import("../src/hooks/use-store-currency");
const { CashEntryDialog } = await import("../src/components/accounting/CashEntryDialog");
const { CashMovementsList } = await import("../src/components/accounting/CashMovementsList");
const { PremiumCurrencyInput } =
  await import("../src/features/inventory/components/PremiumCurrencyInput");

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  store.currency = "SAR";
  store.movements = [];
});

describe("how a currency is named", () => {
  it("writes the code in English and the short form Arabic readers know", () => {
    expect(currencyLabel("BHD", "en")).toBe("BHD");
    expect(currencyLabel("BHD", "ar")).toBe("د.ب");
    expect(currencyLabel("sar", "ar")).toBe("ر.س");
    expect(currencyLabel("KWD", "ar")).toBe("د.ك");
    // A currency the list does not have is its code, in both languages.
    expect(currencyLabel("USD", "ar")).toBe("USD");
  });

  it("falls back to the default when a store set none", () => {
    expect(currencyLabel(null, "en")).toBe("BHD");
    expect(currencyLabel("  ", "ar")).toBe("د.ب");
  });
});

describe("the store's own currency", () => {
  it("is read from the store's settings", async () => {
    const { result } = renderHook(() => useStoreCurrency("b1"), { wrapper });
    await waitFor(() => expect(result.current).toBe("SAR"));
    const label = renderHook(() => useMoneyLabel("ar"), { wrapper });
    await waitFor(() => expect(label.result.current).toBe("ر.س"));
  });

  it("is the default until the settings are known, and for a store that set none", async () => {
    expect(renderHook(() => useStoreCurrency(null), { wrapper }).result.current).toBe("BHD");
    store.currency = null;
    const { result } = renderHook(() => useStoreCurrency("b1"), { wrapper });
    await waitFor(() => expect(result.current).toBe("BHD"));
  });
});

describe("the screens of a store that sells in riyals", () => {
  it("asks for a cash amount in riyals", async () => {
    render(<CashEntryDialog brandId="b1" isAr={false} open onOpenChange={vi.fn()} />, { wrapper });
    expect(await screen.findByLabelText("Amount (SAR)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount (BHD)")).toBeNull();
  });

  it("lists cash movements in riyals", async () => {
    store.movements = [
      {
        id: "m1",
        amount: 150,
        transaction_type: "manual_in",
        notes: "Opening balance",
        created_at: "2026-10-01T10:00:00Z",
        source_account_id: null,
        destination_account_id: "a1",
      },
    ];
    render(<CashMovementsList brandId="b1" isAr={false} accountNames={new Map()} />, { wrapper });
    expect(await screen.findByText(/SAR/)).toBeInTheDocument();
    expect(screen.queryByText(/BHD/)).toBeNull();
  });

  it("tags a price field with the store's currency", async () => {
    render(<PremiumCurrencyInput value="12" onChange={vi.fn()} />, { wrapper });
    expect(await screen.findByText("SAR")).toBeInTheDocument();
  });

  it("says a promo code's minimum in the order's currency", () => {
    const refusal = { reason: "MINIMUM_NOT_MET", minimum_order_amount: 10 };
    expect(promoFailureMessage(refusal, "en", "KWD")).toContain("KWD");
    expect(promoFailureMessage(refusal, "en", "KWD")).not.toContain("BHD");
    // An order with no currency of its own is in the default.
    expect(promoFailureMessage(refusal, "en")).toContain("BHD");
  });
});
