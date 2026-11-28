import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { foldWord, matchesWords } from "../src/lib/fold-text";
import {
  searchSettings,
  settingHref,
  settingPlace,
} from "../src/features/settings/lib/settings-search";

// Settings by name from the command palette (the ease-of-use review of 2026-11-28): 199 settings
// in 5 tabs and 22 groups, and the search every page has found none of them. The Settings page's
// own search reads the same rule.

const keys = (query: string, store: { footer_layout?: string } | null = null) =>
  searchSettings(query, store).map((entry) => entry.key);

describe("finding a setting", () => {
  it("finds it by its name or a word for it, in either language, as people type Arabic", () => {
    expect(keys("logo")[0]).toBe("logo_url");
    expect(keys("الشعار")).toContain("logo_url");
    expect(keys("شعار المتجر")[0]).toBe("logo_url");
    // A closing ة typed as ه, and no hamza.
    expect(keys("الضريبه")).toContain("default_tax_rate");
    expect(keys("vat rate")).toContain("default_tax_rate");
    // Every word, in any order.
    expect(keys("rate vat")).toContain("default_tax_rate");
    expect(keys("logo zzzz")).toEqual([]);
  });

  it("offers only what the store's footer reads, and nothing for a single letter", () => {
    // A store on the columns footer (the default) has no "store name in the footer" switch.
    expect(keys("footer name")).not.toContain("show_footer_name");
    expect(keys("footer name", { footer_layout: "simple" })).toContain("show_footer_name");
    expect(keys("payment icons footer")).toContain("footer_show_payment_methods");
    expect(keys("payment icons footer", { footer_layout: "simple" })).not.toContain(
      "footer_show_payment_methods",
    );
    expect(keys("l")).toEqual([]);
  });

  it("says where it lives and opens there", () => {
    const [logo] = searchSettings("logo", null);
    expect(settingPlace(logo, "en")).toBe("Identity › Name & Logo");
    expect(settingPlace(logo, "ar")).toBe("الهوية والعلامة › الاسم والشعار");
    expect(settingHref(logo, "pura")).toBe("/admin/b/pura/settings?tab=identity&group=basics");
  });

  it("folds Arabic spellings to one", () => {
    expect(foldWord("إعدادات الضريبة")).toBe(foldWord("اعدادات الضريبه"));
    expect(matchesWords("Create Discount Code", "code disc")).toBe(true);
    expect(matchesWords("إنشاء كود خصم جديد", "خصم")).toBe(true);
    expect(matchesWords("Record Expense", "discount")).toBe(false);
  });
});

const state = vi.hoisted(() => ({ navigate: vi.fn() }));

const routerMock = vi.hoisted(() => () => ({
  useNavigate: () => state.navigate,
  useParams: () => ({ slug: "pura" }),
}));
vi.mock("@tanstack/react-router", routerMock);
const emptySearch = vi.hoisted(() => async () => []);
vi.mock("../src/lib/data/orders", () => ({ searchOrders: emptySearch }));
vi.mock("@/lib/data/orders", () => ({ searchOrders: emptySearch }));
vi.mock("../src/lib/data/customers", () => ({ searchCustomers: emptySearch }));
vi.mock("@/lib/data/customers", () => ({ searchCustomers: emptySearch }));
vi.mock("../src/lib/data/catalog", () => ({ searchProducts: emptySearch }));
vi.mock("@/lib/data/catalog", () => ({ searchProducts: emptySearch }));
vi.mock("../src/lib/data/brands", () => ({ fetchBrandIdBySlug: async () => "b1" }));
vi.mock("@/lib/data/brands", () => ({ fetchBrandIdBySlug: async () => "b1" }));
const settingsMock = vi.hoisted(() => () => ({
  businessSettingsQueries: {
    detail: (id: string) => ({
      queryKey: ["business-settings", id],
      queryFn: async () => ({ footer_layout: "columns" }),
    }),
  },
}));
vi.mock("../src/lib/data/business-settings", settingsMock);
vi.mock("@/lib/data/business-settings", settingsMock);
const brandMock = vi.hoisted(() => () => ({
  useBrandOptional: () => ({ id: "b1", slug: "pura" }),
}));
vi.mock("../src/lib/brand-context", brandMock);
vi.mock("@/lib/brand-context", brandMock);
const i18nMock = vi.hoisted(() => () => ({
  useI18n: () => ({ lang: "en", setLang: vi.fn() }),
}));
vi.mock("../src/lib/i18n", i18nMock);
vi.mock("@/lib/i18n", i18nMock);
const currencyMock = vi.hoisted(() => () => ({ useStoreCurrency: () => "BHD" }));
vi.mock("../src/hooks/use-store-currency", currencyMock);
vi.mock("@/hooks/use-store-currency", currencyMock);
const numberMock = vi.hoisted(() => () => ({
  useOrderNumber: () => (n: number) => `#${n}`,
  useOrderNumberFormat: () => null,
}));
vi.mock("../src/hooks/use-order-number", numberMock);
vi.mock("@/hooks/use-order-number", numberMock);

const { SpotlightCommandPalette } = await import("../src/components/spotlight-command-palette");
const { Settings, Package } = await import("lucide-react");

const PAGES = [
  {
    to: "/admin/b/$slug/inventory",
    labelEn: "Products",
    labelAr: "المنتجات",
    icon: Package,
  },
  {
    to: "/admin/b/$slug/settings",
    labelEn: "Settings",
    labelAr: "الإعدادات",
    icon: Settings,
  },
];

const renderPalette = (pages = PAGES) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SpotlightCommandPalette
        open
        onOpenChange={() => undefined}
        pages={pages as unknown as Parameters<typeof SpotlightCommandPalette>[0]["pages"]}
      />
    </QueryClientProvider>,
  );

const type = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText(/Search orders, products, settings/), {
    target: { value: text },
  });

describe("the command palette", () => {
  beforeEach(() => {
    state.navigate.mockReset();
    window.localStorage.removeItem("boutq_settings_level");
  });

  it("finds a setting by name and opens the Settings page at its group", async () => {
    renderPalette();
    type("logo");
    const logo = await screen.findByText("Store Logo");
    expect(screen.getAllByText("Identity › Name & Logo").length).toBeGreaterThan(0);
    fireEvent.click(logo);
    expect(state.navigate).toHaveBeenCalledWith({
      href: "/admin/b/pura/settings?tab=identity&group=basics",
    });
  });

  it("opens a setting kept for the advanced view with that view on", async () => {
    renderPalette();
    type("footer layout");
    fireEvent.click(await screen.findByText("Footer Layout Style"));
    expect(window.localStorage.getItem("boutq_settings_level")).toBe("advanced");
  });

  it("narrows its pages and actions to what was typed", async () => {
    renderPalette();
    expect(screen.getByText("Products")).toBeTruthy();
    expect(screen.getByText("Record Expense")).toBeTruthy();
    type("discount");
    await waitFor(() => expect(screen.queryByText("Products")).toBeNull());
    expect(screen.queryByText("Record Expense")).toBeNull();
    expect(screen.getByText("Create Discount Code")).toBeTruthy();
    fireEvent.click(screen.getByText("Create Discount Code"));
    expect(state.navigate).toHaveBeenCalledWith({ href: "/admin/b/pura/discounts?action=new" });
  });

  it("offers no setting to a person who may not open the settings", async () => {
    renderPalette([PAGES[0]]);
    type("logo");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Store Logo")).toBeNull();
  });
});
