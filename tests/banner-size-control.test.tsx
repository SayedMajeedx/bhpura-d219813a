import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Settings → Storefront → Home sections: the banner size picker, and the product grid's column
// count beside a filter sidebar.

const state = vi.hoisted(() => ({
  size: undefined as string | undefined,
  lang: "en" as "ar" | "en",
  setBs: vi.fn(),
}));
const i18n = vi.hoisted(() => () => ({
  useI18n: () => ({
    get lang() {
      return state.lang;
    },
  }),
}));
vi.mock("../src/lib/i18n", i18n);
vi.mock("@/lib/i18n", i18n);
const form = vi.hoisted(() => () => ({
  useBrandSettingsFormContext: () => ({
    form: {
      bs: {
        get storefront_banner_size() {
          return state.size;
        },
      },
    },
    setBs: state.setBs,
  }),
}));
vi.mock("../src/features/settings/use-brand-settings-form", form);
vi.mock("@/features/settings/use-brand-settings-form", form);

const storefront = vi.hoisted(() => () => ({
  useIsServicesStore: () => false,
  useStorefront: () => ({ t: (_ar: string, en: string) => en }),
}));
vi.mock("../src/lib/storefront-context", storefront);
vi.mock("@/lib/storefront-context", storefront);
const card = vi.hoisted(() => () => ({
  ProductCard: ({ product }: { product: { id: string } }) => <div data-testid={product.id} />,
}));
vi.mock("../src/components/storefront/product-card", card);
vi.mock("@/components/storefront/product-card", card);
vi.mock("../src/components/os/os-empty-state", () => ({ OsEmptyState: () => <div /> }));
vi.mock("@/components/os/os-empty-state", () => ({ OsEmptyState: () => <div /> }));

const { BannerSizeControl } =
  await import("../src/features/settings/tabs/storefront/BannerSizeControl");
const { ProductGrid } = await import("../src/components/storefront/product-grid");

beforeEach(() => {
  state.size = undefined;
  state.lang = "en";
  state.setBs.mockClear();
});

describe("the banner size picker", () => {
  it("shows compact chosen when the store has not chosen, and offers the three sizes", () => {
    render(<BannerSizeControl />);
    const group = screen.getByRole("radiogroup", { name: "Banner size" });
    expect(group).toBeInTheDocument();
    expect(
      screen.getAllByRole("radio").map((r) => r.textContent?.match(/Compact|Medium|Large/)?.[0]),
    ).toEqual(["Compact", "Medium", "Large"]);
    expect(screen.getByRole("radio", { name: /Compact/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Large/ })).toHaveAttribute("aria-checked", "false");
  });

  it("reads the stored size, and an unknown one as compact", () => {
    state.size = "medium";
    const { unmount } = render(<BannerSizeControl />);
    expect(screen.getByRole("radio", { name: /Medium/ })).toHaveAttribute("aria-checked", "true");
    unmount();
    state.size = "gigantic";
    render(<BannerSizeControl />);
    expect(screen.getByRole("radio", { name: /Compact/ })).toHaveAttribute("aria-checked", "true");
  });

  it("saves the size picked", () => {
    render(<BannerSizeControl />);
    fireEvent.click(screen.getByRole("radio", { name: /Large/ }));
    expect(state.setBs).toHaveBeenCalledWith({ storefront_banner_size: "large" });
  });

  it("says the pictures and titles stay, in Arabic too", () => {
    state.lang = "ar";
    render(<BannerSizeControl />);
    expect(screen.getByRole("radiogroup", { name: "حجم اللافتات" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /مضغوطة/ })).toBeInTheDocument();
    expect(screen.getByText(/الصور والعناوين كما وضعتها/)).toBeInTheDocument();
  });
});

describe("the product grid's columns", () => {
  const products = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] as never;
  const grid = (withSidebar?: boolean) =>
    render(
      <ProductGrid
        products={products}
        loading={false}
        categoryEmpty={false}
        onViewAll={() => undefined}
        withSidebar={withSidebar}
      />,
    );

  it("uses four columns on a wide screen, and three beside a filter sidebar", () => {
    const wide = grid();
    expect(wide.container.querySelector("#products")?.className).toContain("lg:grid-cols-4");
    wide.unmount();
    const beside = grid(true);
    const cls = beside.container.querySelector("#products")?.className ?? "";
    expect(cls).toContain("lg:grid-cols-3");
    expect(cls).not.toContain("lg:grid-cols-4");
  });
});
