import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// The order's documents card offers the workshop's job sheet only when the order has a piece to
// make, and names the workshop in the store's own word.

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

const returnsData = vi.hoisted(() => ({
  returnsQueries: {
    forOrder: () => ({ queryKey: ["job-sheet-test", "returns"], queryFn: async () => [] }),
  },
}));
vi.mock("../src/lib/data/returns", () => returnsData);
vi.mock("@/lib/data/returns", () => returnsData);

const storeProfile = vi.hoisted(() => ({
  useAdminStoreProfile: () => ({ profile: { addons: [], vertical: "fashion", modules: {} } }),
}));
vi.mock("../src/hooks/use-store-profile", () => storeProfile);
vi.mock("@/hooks/use-store-profile", () => storeProfile);

const vocabulary = vi.hoisted(() => ({
  useVocabulary: () => ({ vocabulary: { workshop: { ar: "المشغل", en: "Atelier" } } }),
}));
vi.mock("../src/hooks/use-vocabulary", () => vocabulary);
vi.mock("@/hooks/use-vocabulary", () => vocabulary);

import { OrderSalesDocumentsCard } from "../src/components/orders/OrderSalesDocumentsCard";

const order = {
  id: "11111111-1111-4111-8111-111111111111",
  brand_id: "b1",
  invoice_number: 1042,
  created_at: "2026-10-11T08:00:00Z",
  total: 30,
  payment_status: "unpaid",
};

function show(props: { onPrintJobSheet?: () => void; lang?: "ar" | "en" }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrderSalesDocumentsCard
        order={order}
        items={[]}
        brand={{ id: "b1", name_en: "ZH" }}
        currency="BHD"
        lang={props.lang ?? "en"}
        slug="zh"
        onPrintJobSheet={props.onPrintJobSheet}
      />
    </QueryClientProvider>,
  );
}

describe("the job sheet in the order's documents", () => {
  it("is not offered for an order with nothing to make", () => {
    show({});
    expect(screen.queryByRole("button", { name: /job sheet/i })).toBeNull();
  });

  it("prints when the order has a piece to make", () => {
    const print = vi.fn();
    show({ onPrintJobSheet: print });
    expect(screen.getByText("Job sheet (Atelier)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Print job sheet" }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("speaks Arabic with the store's word for the workshop", () => {
    show({ onPrintJobSheet: vi.fn(), lang: "ar" });
    expect(screen.getByText("أمر التشغيل (المشغل)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "طباعة أمر التشغيل" })).toBeTruthy();
  });
});
