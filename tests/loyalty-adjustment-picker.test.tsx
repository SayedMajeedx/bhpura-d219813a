import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The loyalty adjustment dialog finds any customer by searching the database,
// not only the first 100 names (bug #18).

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const state = vi.hoisted(() => ({
  searched: [] as string[],
  adjustLoyaltyPoints: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast }));
const customers = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { customersQueries: object };
  return {
    ...actual,
    customersQueries: {
      ...actual.customersQueries,
      directory: (brandId: string, limit: number) => ({
        queryKey: ["directory", brandId, limit],
        queryFn: async () => [{ id: "c1", name: "Aisha", phone: "39000001", email: null }],
      }),
      search: (brandId: string, query: string, limit: number) => ({
        queryKey: ["search", brandId, query, limit],
        queryFn: async () => {
          state.searched.push(query);
          return [{ id: "c250", name: "Zainab", phone: null, email: "z@example.com" }];
        },
      }),
    },
  };
};
vi.mock("../src/lib/data/customers", (io) => customers(io));
vi.mock("@/lib/data/customers", (io) => customers(io));
const loyalty = {
  adjustLoyaltyPoints: state.adjustLoyaltyPoints,
  invalidateLoyalty: vi.fn(async () => undefined),
};
vi.mock("../src/lib/data/loyalty", () => loyalty);
vi.mock("@/lib/data/loyalty", () => loyalty);
const i18n = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useI18n: () => ({ lang: "en" }),
});
vi.mock("../src/lib/i18n", (io) => i18n(io));
vi.mock("@/lib/i18n", (io) => i18n(io));

const { LoyaltyManualAdjustmentDialog } =
  await import("../src/components/loyalty/LoyaltyManualAdjustmentDialog");

beforeEach(() => {
  vi.clearAllMocks();
  state.searched = [];
});

describe("the loyalty adjustment dialog's customer picker", () => {
  it("finds a customer by search and adjusts their points", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LoyaltyManualAdjustmentDialog open onOpenChange={vi.fn()} brandId="b1" />
      </QueryClientProvider>,
    );
    const apply = screen.getByRole("button", { name: "Apply Adjustment" });
    expect(apply).toBeDisabled();

    fireEvent.click(screen.getByRole("combobox", { name: "Select Customer" }));
    expect(await screen.findByText("Aisha (39000001)")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Name, phone or email..."), {
      target: { value: "zain" },
    });
    fireEvent.click(await screen.findByText("Zainab (z@example.com)"));
    expect(state.searched).toEqual(["zain"]);
    expect(screen.getByRole("combobox")).toHaveTextContent("Zainab (z@example.com)");

    fireEvent.change(screen.getByPlaceholderText("e.g. Compensation for order delay"), {
      target: { value: "Birthday gift" },
    });
    fireEvent.click(apply);
    await waitFor(() =>
      expect(state.adjustLoyaltyPoints).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: "b1", customerId: "c250", pointsDelta: 50 }),
      ),
    );
  });
});
