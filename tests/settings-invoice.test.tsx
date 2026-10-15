import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The invoice's thirty-one settings had a small logo preview and sat in one fold behind two
// "inherit the store's colour / fonts" switches that the invoice never read (found 2026-10-15):
// on by default, they hid the invoice's own colour and font fields. The settings now draw the
// real invoice from a sample order, keep what every store sets in view, and fold the rest by kind.

const form = vi.hoisted(() => ({
  bs: {} as Record<string, unknown>,
  setBs: vi.fn(),
}));
const formModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useBrandSettingsFormContext: () => ({
    form: { bs: form.bs, brand: { id: "b1", slug: "pura", name_en: "Pura", primary_color: null } },
    bs: form.bs,
    setBs: form.setBs,
    brandId: "b1",
  }),
});
vi.mock("../src/features/settings/use-brand-settings-form", (io) => formModule(io));
vi.mock("@/features/settings/use-brand-settings-form", (io) => formModule(io));
const addons = { useAddons: () => ({ addons: [] }) };
const addonsModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  ...addons,
});
vi.mock("../src/components/addons/AddonsProvider", (io) => addonsModule(io));
vi.mock("@/components/addons/AddonsProvider", (io) => addonsModule(io));
const r2 = { uploadPublicMedia: vi.fn() };
vi.mock("../src/lib/r2-upload", () => r2);
vi.mock("@/lib/r2-upload", () => r2);

const { sampleInvoice } = await import("../src/features/settings/tabs/orders/invoice-sample");
const { InvoiceGroup } = await import("../src/features/settings/tabs/orders/InvoiceGroup");
const { setStoredSettingsLevel } = await import("../src/features/settings/settings-level");
const { I18nProvider } = await import("../src/lib/i18n");

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <InvoiceGroup />
      </I18nProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  setStoredSettingsLevel("advanced");
  form.bs = {
    currency: "KWD",
    default_tax_rate: 10,
    delivery_fee: 3,
    storefront_accent_color: "#330a0a",
    storefront_font_ar: "Readex Pro",
    storefront_font_en: "Plus Jakarta Sans",
  };
});

describe("the sample order", () => {
  it("is in the store's currency, with its delivery fee and tax", () => {
    const { order, items } = sampleInvoice(form.bs, "b1");
    expect(order.currency).toBe("KWD");
    expect(order.shipping).toBe(3);
    expect(order.subtotal).toBe(37);
    expect(order.tax_amount).toBe(4);
    expect(order.total).toBe(44);
    expect(items).toHaveLength(2);
    // It asks the database for nothing.
    expect(order.brand_id).toBeUndefined();
  });
});

describe("the invoice settings", () => {
  it("draw the real invoice from the sample order", () => {
    show();
    expect(screen.getByText("Invoice preview")).toBeInTheDocument();
    expect(screen.getByText("Linen abaya")).toBeInTheDocument();
  });

  it("show the template the invoice uses, and the terms while their switch is on", () => {
    show();
    expect(screen.getByLabelText("Invoice template")).toHaveTextContent("Modern");
    expect(screen.getByRole("switch", { name: "Terms & conditions" })).toBeChecked();
    expect(screen.getByLabelText("Terms (English)")).toBeInTheDocument();
  });

  it("copy the store's colour and fonts by a tap, with no switch that does nothing", () => {
    show();
    expect(screen.queryByText(/Inherit/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use the store's colour" }));
    expect(form.setBs).toHaveBeenCalledWith({ primary_color: "#330a0a" });
    fireEvent.click(screen.getByRole("button", { name: "Use the store's fonts" }));
    expect(form.setBs).toHaveBeenCalledWith({
      invoice_arabic_font_family: "Readex Pro",
      font_family: "Plus Jakarta Sans",
    });
  });

  it("fold colours, fonts and the logo apart on the basic level", () => {
    setStoredSettingsLevel("basic");
    show();
    expect(screen.getByText("Invoice colours and status badges")).toBeInTheDocument();
    expect(screen.getByText("Invoice fonts")).toBeInTheDocument();
    expect(screen.getByText("The logo's place and size")).toBeInTheDocument();
  });
});
