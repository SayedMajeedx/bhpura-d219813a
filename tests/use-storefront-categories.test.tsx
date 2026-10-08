import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The menus' categories start from what the store's layout loaded, so every page has them in the
// first paint and no page asks the database for them again; a store with none still works.

const stubs = vi.hoisted(() => ({
  initialCategories: undefined as unknown,
  fetchCategories: vi.fn(),
}));
const storefront = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => ({
    brand: { id: "b1", slug: "pura" },
    initialCategories: stubs.initialCategories,
  }),
});
vi.mock("../src/lib/storefront-context", (io) => storefront(io));
vi.mock("@/lib/storefront-context", (io) => storefront(io));
const dataLayer = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { storefrontQueries: Record<string, unknown> };
  return {
    ...actual,
    storefrontQueries: {
      ...actual.storefrontQueries,
      categories: () => ({
        queryKey: ["categories-test"],
        queryFn: stubs.fetchCategories,
        staleTime: 5 * 60_000,
      }),
    },
  };
};
vi.mock("../src/lib/data/storefront", (io) => dataLayer(io));
vi.mock("@/lib/data/storefront", (io) => dataLayer(io));
const client = { supabase: {} };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const { useStorefrontCategories } = await import("../src/lib/use-storefront-categories");

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  stubs.fetchCategories.mockResolvedValue([{ id: "fetched" }]);
});

describe("useStorefrontCategories", () => {
  it("has the layout's categories on the first render and does not ask the database", async () => {
    stubs.initialCategories = [{ id: "c1", slug: "abayas" }];
    const { result } = renderHook(() => useStorefrontCategories(), { wrapper });
    expect(result.current.data).toEqual([{ id: "c1", slug: "abayas" }]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stubs.fetchCategories).not.toHaveBeenCalled();
  });

  it("keeps an empty list (a store with no categories) without asking either", async () => {
    stubs.initialCategories = [];
    const { result } = renderHook(() => useStorefrontCategories(), { wrapper });
    expect(result.current.data).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stubs.fetchCategories).not.toHaveBeenCalled();
  });

  it("asks the database when the layout gave nothing, and honours `enabled`", async () => {
    stubs.initialCategories = undefined;
    const { result } = renderHook(() => useStorefrontCategories(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: "fetched" }]));

    stubs.fetchCategories.mockClear();
    renderHook(() => useStorefrontCategories({ enabled: false }), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stubs.fetchCategories).not.toHaveBeenCalled();
  });
});
