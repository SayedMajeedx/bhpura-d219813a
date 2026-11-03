import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// A product with a history of sales or stock is archived rather than deleted (migration
// 20261112100000): the words staff read, and the inventory's line that lists and restores them.

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const catalog = vi.hoisted(() => ({
  restoreProduct: vi.fn(async (): Promise<void> => undefined),
  catalogQueries: {
    productsWithArchived: () => ({
      queryKey: ["products"],
      queryFn: async () => [
        {
          id: "p1",
          name: "Abaya",
          name_en: "Abaya",
          name_ar: "عباية العيد",
          archived_at: "2026-11-02T10:00:00Z",
        },
        { id: "p2", name: "Dress", name_en: "Dress", name_ar: "فستان", archived_at: null },
        {
          id: "p3",
          name: "Shayla",
          name_en: "Shayla",
          name_ar: "شيلة",
          archived_at: "2026-11-03T10:00:00Z",
        },
      ],
    }),
  },
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/data/catalog", () => catalog);
vi.mock("../src/lib/data/catalog", () => catalog);

const { ArchivedProductsLine, archivedProducts } =
  await import("../src/features/inventory/components/ArchivedProductsLine");
const { productDeleteError, removedProductsMessage, removeProductsWarning } =
  await import("../src/features/inventory/lib/product-delete");

beforeEach(() => vi.clearAllMocks());

describe("what staff read", () => {
  it("names each of the database's refusals, and never a bare failure", () => {
    expect(productDeleteError({ message: "PRODUCT_HAS_STOCK" }, false)).toMatch(
      /still has pieces in stock/,
    );
    expect(productDeleteError({ message: "PRODUCT_HAS_HISTORY" }, true)).toMatch(/يُؤرشف/);
    expect(productDeleteError({ message: "NOT_AUTHORIZED" }, false)).toMatch(
      /inventory permission/,
    );
    // A database error is an object, not an Error: its words were once thrown away.
    expect(productDeleteError({ message: "permission denied for table products" }, false)).toBe(
      "permission denied for table products",
    );
    expect(productDeleteError(null, true)).toBe("تعذر حذف المنتجات.");
  });

  it("says what was deleted and what was archived, the count last in Arabic", () => {
    expect(removedProductsMessage({ deleted: 2, archived: 0 }, false)).toBe("2 products deleted.");
    expect(removedProductsMessage({ deleted: 0, archived: 1 }, false)).toMatch(
      /^1 product archived: .*Restore it from archived products\.$/,
    );
    expect(removedProductsMessage({ deleted: 1, archived: 2 }, true)).toMatch(
      /^تم حذف منتج واحد\. .*\(منتجان\)\.$/,
    );
  });

  it("warns before removing that a product with history is archived", () => {
    expect(removeProductsWarning(1, false)).toMatch(/archived instead/);
    expect(removeProductsWarning(3, true)).toMatch(/يُؤرشف بدلاً من حذفه/);
  });
});

const renderLine = (onRestored = vi.fn()) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ArchivedProductsLine brandId="b1" isAr={false} onRestored={onRestored} />
    </QueryClientProvider>,
  );

describe("the archived products", () => {
  it("are the archived ones only, the latest first", () => {
    expect(
      archivedProducts([
        { id: "a", archived_at: "2026-11-01T00:00:00Z" },
        { id: "b", archived_at: null },
        { id: "c", archived_at: "2026-11-03T00:00:00Z" },
      ]).map((p) => p.id),
    ).toEqual(["c", "a"]);
  });

  it("are listed from one line and each can be restored", async () => {
    const onRestored = vi.fn();
    renderLine(onRestored);
    fireEvent.click(await screen.findByRole("button", { name: /Archived products: 2 products/ }));
    expect(screen.getByText("Shayla")).toBeInTheDocument();
    expect(screen.queryByText("Dress")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore Abaya" }));
    await waitFor(() => expect(catalog.restoreProduct).toHaveBeenCalledWith("p1"));
    expect(onRestored).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/still hidden/));
  });
});
