import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The header's and footer's settings were spread out (found 2026-10-15): their colours in the
// palette twice (its quick step and its advanced colours) with the header's frosted look twice
// as well, the footer's layout, newsletter and payment icons with the new look's options. The
// Header & footer group now holds the header, the side menu and the footer, each whole, and the
// new look's group is what is left: the product card and page.

const form = vi.hoisted(() => ({
  bs: {} as Record<string, unknown>,
  setBs: vi.fn(),
  patchBs: vi.fn(),
}));
const formModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useBrandSettingsFormContext: () => ({
    form: { bs: form.bs, brand: { slug: "pura", name_en: "Pura", primary_color: "#4a1020" } },
    bs: form.bs,
    setBs: form.setBs,
    patchBs: form.patchBs,
    setBrand: vi.fn(),
    brandId: "b1",
  }),
});
vi.mock("../src/features/settings/use-brand-settings-form", (io) => formModule(io));
vi.mock("@/features/settings/use-brand-settings-form", (io) => formModule(io));

const { BarColorsField } = await import("../src/features/settings/tabs/storefront/BarColorsField");
const { HeaderFooterGroup } =
  await import("../src/features/settings/tabs/storefront/HeaderFooterGroup");
const { DesignV2Group } = await import("../src/features/settings/tabs/storefront/DesignV2Group");
const { PaletteGroup } = await import("../src/features/settings/tabs/identity/PaletteGroup");
const { SettingsNavContext } = await import("../src/features/settings/GroupNavigator");
const { setStoredSettingsLevel } = await import("../src/features/settings/settings-level");
const { I18nProvider } = await import("../src/lib/i18n");

const v1 = { storefront_design_version: 1, trust_badges: { items: [] } };
const v2 = { storefront_design_version: 2, trust_badges: { items: [] } };

const show = (node: React.ReactNode, openGroup = vi.fn()) => {
  render(
    <I18nProvider>
      <SettingsNavContext.Provider
        value={{ activeGroup: null, setActiveGroup: vi.fn(), openGroup }}
      >
        {node}
      </SettingsNavContext.Provider>
    </I18nProvider>,
  );
  return openGroup;
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  setStoredSettingsLevel("advanced");
  form.bs = { ...v2 };
});

describe("a bar's colours", () => {
  it("are white, the store's colour or dark in one tap, then each on its own", () => {
    const onChange = vi.fn();
    render(
      <I18nProvider>
        <BarColorsField
          label="Header colours"
          bg="#111111"
          fg="#ffffff"
          brandColor="#4a1020"
          isAr={false}
          onChange={onChange}
        />
      </I18nProvider>,
    );
    const presets = screen.getByRole("group", { name: "Header colours" });
    expect(within(presets).getByRole("button", { name: /Dark/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(presets).getByRole("button", { name: /Brand colour/ }));
    expect(onChange).toHaveBeenCalledWith({ bg: "#4a1020", fg: "#ffffff" });
  });
});

describe("the Header & footer group", () => {
  it("holds the header's colours and its frosted look", () => {
    show(<HeaderFooterGroup />);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Header colours" })).getByRole("button", {
        name: /White/,
      }),
    );
    expect(form.setBs).toHaveBeenCalledWith({ header_bg: "#ffffff", header_fg: "#111111" });
    fireEvent.click(screen.getByLabelText("Frosted header while scrolling"));
    expect(form.setBs).toHaveBeenCalledWith({ header_glass: false });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Menu colours" })).getByRole("button", {
        name: /Dark/,
      }),
    );
    expect(form.setBs).toHaveBeenCalledWith({ menu_bg: "#111111", menu_fg: "#ffffff" });
  });

  it("offers the columns footer its newsletter and payment icons", () => {
    show(<HeaderFooterGroup />);
    expect(screen.getByLabelText("Footer layout")).toBeInTheDocument();
    expect(screen.getByLabelText("Newsletter title (English)")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Payment icons"));
    expect(form.setBs).toHaveBeenCalledWith({ footer_show_payment_methods: false });
    // The columns footer reads the footer colours too (--sf-footer-bg / --sf-footer-fg).
    fireEvent.click(
      within(screen.getByRole("group", { name: "Footer colours" })).getByRole("button", {
        name: /Dark/,
      }),
    );
    expect(form.setBs).toHaveBeenCalledWith({ footer_bg: "#111111", footer_fg: "#ffffff" });
  });

  it("offers the classic footer its colours and store name, and no layout to choose", () => {
    form.bs = { ...v1 };
    show(<HeaderFooterGroup />);
    expect(screen.getByRole("group", { name: "Footer colours" })).toBeInTheDocument();
    expect(screen.getByText("Show store name in footer")).toBeInTheDocument();
    expect(screen.queryByLabelText("Footer layout")).toBeNull();
    expect(screen.queryByLabelText("Newsletter title (English)")).toBeNull();
  });
});

describe("what moved out", () => {
  it("leaves the new look's group with the product card and page", () => {
    show(<DesignV2Group />);
    expect(screen.getByText("Product card & page")).toBeInTheDocument();
    expect(screen.getByLabelText("Quick add")).toBeInTheDocument();
    for (const gone of [/newsletter/i, /payment icons/i, /footer layout/i, /trust bar/i]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it("leaves the palette without the header and footer, and points to them", () => {
    const openGroup = show(<PaletteGroup />);
    expect(screen.queryByText("Header BG")).toBeNull();
    expect(screen.queryByText(/Glassmorphism/)).toBeNull();
    expect(screen.queryByText(/Header & Footer Colors/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Header & footer" }));
    expect(openGroup).toHaveBeenCalledWith("storefront", "header_footer");
  });
});
