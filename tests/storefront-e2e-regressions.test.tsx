import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveFooterVariant } from "../src/lib/storefront-engine";

/**
 * Regressions found by driving the real storefront and admin in a browser.
 * Each test pins a specific defect that was measured, not inferred. The rule
 * that route guards never redirect from inside a queryFn lives with the other
 * query rules in tests/query-keys-integrity.test.ts.
 */

const storefront = vi.hoisted(() => ({
  brand: { id: "b1", slug: "pura", name_en: "Pura", name_ar: "بورا" },
  settings: {} as Record<string, unknown>,
  lang: "en",
  t: (_ar: string, en: string) => en,
  cart: [] as unknown[],
  clearCart: () => undefined,
}));
const settingsForm = vi.hoisted(() => ({
  form: { bs: {} as Record<string, unknown> },
  setBs: vi.fn(),
  brandId: "b1",
}));
vi.mock("../src/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
  useStoreModules: () => ({}),
}));
vi.mock("@/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
  useStoreModules: () => ({}),
}));
vi.mock("@/features/settings/use-brand-settings-form", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBrandSettingsFormContext: () => settingsForm,
}));
vi.mock("../src/features/settings/use-brand-settings-form", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBrandSettingsFormContext: () => settingsForm,
}));
vi.mock("@tanstack/react-router", () => ({
  Outlet: () => null,
  useRouter: () => ({}),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/pura", searchStr: "" }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({}),
}));
// The shell's other children are stubbed; the analytics banner is a marker so
// the test can see where the shell mounts it.
const stubs = {
  analytics: { StorefrontAnalytics: () => <div data-testid="consent-banner" /> },
  header: { AnnouncementBar: () => null, StoreHeader: () => null },
  nav: { DesktopStoreNavigation: () => null },
  fab: { WhatsAppFab: () => null },
  footer: { StorefrontFooter: () => null },
  footerV2: { FooterV2: () => <footer data-testid="footer-columns" /> },
};
vi.mock("../src/components/storefront/StorefrontHeader", () => stubs.header);
vi.mock("@/components/storefront/StorefrontHeader", () => stubs.header);
vi.mock("../src/components/storefront/StorefrontNavigation", () => stubs.nav);
vi.mock("@/components/storefront/StorefrontNavigation", () => stubs.nav);
vi.mock("../src/features/storefront-shell/components/WhatsAppFab", () => stubs.fab);
vi.mock("@/features/storefront-shell/components/WhatsAppFab", () => stubs.fab);
vi.mock("../src/components/storefront/FooterV2", () => stubs.footerV2);
vi.mock("@/components/storefront/FooterV2", () => stubs.footerV2);

const { StoreShell } = await import("../src/features/storefront-shell/components/StoreShell");
const { useStickyCtaOffset } = await import("../src/hooks/use-sticky-cta-offset");
const { DesignV2Group } = await import("../src/features/settings/tabs/storefront/DesignV2Group");
const { I18nProvider } = await import("../src/lib/i18n");
const { defaultStorefrontTypography } = await import("../src/lib/typography");
// The real banner and footer, imported past the shell's stubs.
const { StorefrontAnalytics } = (await vi.importActual(
  "../src/components/storefront-analytics",
)) as typeof import("../src/components/storefront-analytics");
const { StorefrontFooter } = (await vi.importActual(
  "../src/features/storefront-shell/components/StorefrontFooter",
)) as typeof import("../src/features/storefront-shell/components/StorefrontFooter");

vi.mock("../src/components/storefront-analytics", () => stubs.analytics);
vi.mock("@/components/storefront-analytics", () => stubs.analytics);
vi.mock("../src/features/storefront-shell/components/StorefrontFooter", () => stubs.footer);
vi.mock("@/features/storefront-shell/components/StorefrontFooter", () => stubs.footer);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("lang", "en");
  storefront.settings = { storefront_typography: defaultStorefrontTypography() };
});

describe("consent banner does not cover the mobile purchase bar", () => {
  it("renders inside the storefront shell", () => {
    // Mounted outside the shell it inherited the admin font stack and pulled
    // ~229 KB of fonts (Readex Pro + Zarid Display) nothing else uses.
    const { container } = render(<StoreShell />);
    const shell = container.querySelector(".storefront-shell");
    expect(shell).not.toBeNull();
    expect(shell?.contains(screen.getByTestId("consent-banner"))).toBe(true);
  });

  it("offsets itself above a bottom-fixed CTA bar", () => {
    storefront.settings = { analytics_consent_required: true };
    render(<StorefrontAnalytics />);
    const banner = screen.getByRole("heading", { name: "Privacy choices" }).parentElement!;
    // The fixed bottom-3 utility would sit on top of the bar.
    expect(banner.className).not.toContain("bottom-3");
    expect(banner.getAttribute("style")).toContain("var(--sf-sticky-cta-h");
  });

  it("publishes the purchase bar height for overlays to clear, and cleans it up", () => {
    function PurchaseBar() {
      const ref = useStickyCtaOffset<HTMLDivElement>();
      return <div ref={ref} />;
    }
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ height: 63.6 } as DOMRect);
    try {
      const view = render(<PurchaseBar />);
      const root = document.documentElement.style;
      expect(root.getPropertyValue("--sf-sticky-cta-h")).toBe("64px");
      // Cleaned up so other routes are not offset by a stale value.
      view.unmount();
      expect(root.getPropertyValue("--sf-sticky-cta-h")).toBe("");
    } finally {
      rect.mockRestore();
    }
  });
});

describe("footer layout value mismatch", () => {
  it("treats the legacy 'minimal' value as the simple footer", () => {
    // The settings dropdown wrote "minimal" while the storefront checked for
    // "simple", so choosing the simple footer silently did nothing. Two live
    // brands had "minimal" stored.
    expect(resolveFooterVariant({ storefront_design_version: 2, footer_layout: "minimal" })).toBe(
      "simple",
    );
    expect(resolveFooterVariant({ storefront_design_version: 1, footer_layout: "minimal" })).toBe(
      "simple",
    );
  });

  it("shows the footer the storefront renders and writes the canonical value", () => {
    const footerSelect = () =>
      screen
        .getAllByRole("combobox")
        .find((box) => /Minimal \(current\)|Columns \(premium\)/.test(box.textContent ?? ""))!;
    const open = () =>
      fireEvent.pointerDown(footerSelect(), { button: 0, ctrlKey: false, pointerType: "mouse" });

    settingsForm.form.bs = { storefront_design_version: 2, footer_layout: "minimal" };
    const legacy = render(
      <I18nProvider>
        <DesignV2Group />
      </I18nProvider>,
    );
    expect(footerSelect()).toHaveTextContent("Minimal (current)");
    open();
    fireEvent.click(screen.getByRole("option", { name: "Columns (premium)" }));
    expect(settingsForm.setBs).toHaveBeenCalledWith({ footer_layout: "columns" });
    legacy.unmount();

    settingsForm.form.bs = { storefront_design_version: 2, footer_layout: "columns" };
    render(
      <I18nProvider>
        <DesignV2Group />
      </I18nProvider>,
    );
    open();
    fireEvent.click(screen.getByRole("option", { name: "Minimal (current)" }));
    expect(settingsForm.setBs).toHaveBeenLastCalledWith({ footer_layout: "simple" });
  });

  it("routes the storefront footer through the shared resolver", () => {
    storefront.settings = { storefront_design_version: 2, footer_layout: "minimal" };
    const simple = render(<StorefrontFooter />);
    expect(screen.queryByTestId("footer-columns")).not.toBeInTheDocument();
    simple.unmount();

    storefront.settings = { storefront_design_version: 2, footer_layout: "columns" };
    render(<StorefrontFooter />);
    expect(screen.getByTestId("footer-columns")).toBeInTheDocument();
  });
});
