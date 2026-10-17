import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The phone's store search (2026-10-17, Pura): it opens from the sticky header, whose backdrop
// blur and transform make it the box a `fixed` element is placed in, so the "full screen" search
// was the header's 79px with the hero showing under it. Its results showed the category's slug
// ("abayas") and wrote prices in Arabic on an English page.

const state = vi.hoisted(() => ({ lang: "en" as "ar" | "en" }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to: _to, params: _params, ...props }: Record<string, unknown>) => (
    <a {...(props as object)}>{children as React.ReactNode}</a>
  ),
  useNavigate: () => () => undefined,
}));

const storefrontModule = vi.hoisted(() => async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => ({
    brand: { id: "b1", slug: "pura" },
    settings: { currency: "BHD", background_color: "#faf6f2" },
    lang: state.lang,
    t: (ar: string, en: string) => (state.lang === "ar" ? ar : en),
  }),
}));
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));

const categoriesModule = vi.hoisted(() => () => ({
  useStorefrontCategories: () => ({
    data: [{ id: "c1", slug: "abayas", name_en: "Abayas", name_ar: "عبايات", parent_id: null }],
  }),
}));
vi.mock("../src/lib/use-storefront-categories", categoriesModule);
vi.mock("@/lib/use-storefront-categories", categoriesModule);

const dataModule = vi.hoisted(() => async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { storefrontQueries: object };
  return {
    ...actual,
    storefrontQueries: {
      ...actual.storefrontQueries,
      quickSearch: (_brand: unknown, term: string) => ({
        queryKey: ["quick-search", term],
        queryFn: async () => [
          {
            id: "p1",
            name: "Abaya | Sabeeka",
            name_en: "Abaya | Sabeeka",
            name_ar: "عباية | سبيكة",
            category: "abayas",
            image_url: null,
            media: null,
            product_variants: [
              { id: "v1", selling_price: 23, original_price: 30, stock: 1, stock_main: 1 },
            ],
          },
        ],
      }),
    },
  };
});
vi.mock("../src/lib/data/storefront", (io) => dataModule(io));
vi.mock("@/lib/data/storefront", (io) => dataModule(io));

const { SearchOverlay } = await import("../src/components/storefront/SearchOverlay");

function renderInHeader() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <div className="storefront-shell" data-testid="shell">
        <div data-testid="header" style={{ transform: "translateZ(0)" }}>
          <SearchOverlay isOpen onClose={() => undefined} />
        </div>
      </div>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.lang = "en";
  localStorage.clear();
});

describe("the store search on a phone", () => {
  it("is drawn in the store's shell, not inside the header that opens it", () => {
    renderInHeader();
    const dialog = screen.getByRole("dialog", { name: "Store Search" });
    expect(dialog.parentElement).toBe(screen.getByTestId("shell"));
    expect(within(screen.getByTestId("header")).queryByRole("dialog")).toBeNull();
    // Solid, in the store's own background (it was 98% with a blur, and the page ghosted through).
    expect(dialog.className).toContain("fixed inset-0");
    expect(dialog.style.backgroundColor).toBe("rgb(250, 246, 242)");
  });

  it("has one way out, and leaves room for the clear button only when there is text", () => {
    renderInHeader();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Cancel"]);
    const field = within(dialog).getByRole("searchbox");
    expect(field.className).toContain("pe-4");
    expect(field.getAttribute("enterkeyhint")).toBe("search");
    fireEvent.change(field, { target: { value: "ab" } });
    expect(field.className).toContain("pe-11");
    expect(within(dialog).getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("names a result's category and writes its price in the shopper's language", async () => {
    renderInHeader();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "abaya" } });
    const row = (await screen.findByText("Abaya | Sabeeka", undefined, { timeout: 2000 })).closest(
      "a",
    )!;
    expect(within(row).getByText("Abayas")).toBeInTheDocument();
    expect(within(row).queryByText("abayas")).toBeNull();
    expect(row.textContent).toContain("BHD");
    expect(row.textContent).not.toContain("د.ب");
  });

  it("does the same in Arabic", async () => {
    state.lang = "ar";
    renderInHeader();
    expect(screen.getByRole("dialog").getAttribute("dir")).toBe("rtl");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "عباية" } });
    const row = (await screen.findByText("عباية | سبيكة", undefined, { timeout: 2000 })).closest(
      "a",
    )!;
    expect(within(row).getByText("عبايات")).toBeInTheDocument();
    expect(row.textContent).toContain("د.ب");
  });
});
