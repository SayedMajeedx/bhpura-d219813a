import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The settings header reads the unified settings form from its provider.
const settingsForm = vi.hoisted(() => ({
  form: { brand: { slug: "pura", name_en: "Pura" }, bs: {} },
  isDirty: false,
  dirtyCount: 0,
  isSaving: false,
  save: vi.fn(async () => undefined),
  reset: vi.fn(),
}));
vi.mock("../src/features/settings/use-brand-settings-form", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBrandSettingsFormContext: () => settingsForm,
}));
vi.mock("@/features/settings/use-brand-settings-form", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBrandSettingsFormContext: () => settingsForm,
}));

const { OsLoadFailedState, combinedLoadState } =
  await import("../src/components/os/os-load-failed-state");
const { CustomersEmptyState } =
  await import("../src/features/customers/components/CustomersEmptyState");
const { InventoryEmptyState } =
  await import("../src/features/inventory/components/InventoryEmptyState");
const { SettingsHeader } = await import("../src/features/settings/SettingsHeader");
const { I18nProvider } = await import("../src/lib/i18n");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
});

const query = (state: { isLoading?: boolean; isError?: boolean } = {}) => ({
  isLoading: false,
  isError: false,
  refetch: vi.fn(async () => undefined),
  ...state,
});

describe("admin feedback states", () => {
  it("shows a skeleton while loading and a failure, never empty data, when a query fails", () => {
    expect(combinedLoadState([query(), query({ isLoading: true }), query()])).toBe("loading");
    // A failed load is reported even when the other queries returned nothing.
    expect(combinedLoadState([query(), query({ isError: true })])).toBe("failed");
    expect(combinedLoadState([query(), query()])).toBe("ready");
  });

  it("offers a safe retry that reloads every query", () => {
    const queries = [query({ isError: true }), query(), query()];
    render(
      <OsLoadFailedState
        isAr={false}
        title="Customers could not be loaded"
        description="No data was changed."
        queries={queries}
      />,
    );
    expect(screen.getByText("Customers could not be loaded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    for (const q of queries) expect(q.refetch).toHaveBeenCalledTimes(1);
  });

  it("gives an empty customer list a useful action", () => {
    const onAddCustomer = vi.fn();
    const onClearFilters = vi.fn();
    const props = { isAr: false, onAddCustomer, onClearFilters };
    const view = render(<CustomersEmptyState customerCount={0} {...props} />);
    expect(screen.getByText("No matching customers")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Customer" }));
    expect(onAddCustomer).toHaveBeenCalledTimes(1);
    view.unmount();

    render(<CustomersEmptyState customerCount={4} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear Filters" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("gives an empty product list a useful action", () => {
    const onAddProduct = vi.fn();
    const onClearFilters = vi.fn();
    const props = { isAr: false, onAddProduct, onClearFilters };
    const view = render(<InventoryEmptyState productCount={0} {...props} />);
    expect(screen.getByText("No matching products")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    expect(onAddProduct).toHaveBeenCalledTimes(1);
    view.unmount();

    render(<InventoryEmptyState productCount={4} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear Filters" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("shows the settings save and discard actions only when the form is dirty", () => {
    const renderHeader = () =>
      render(
        <I18nProvider>
          <SettingsHeader activeTab="general" onTabChange={vi.fn()} />
        </I18nProvider>,
      );
    const clean = renderHeader();
    expect(screen.queryByRole("button", { name: /Save Changes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    clean.unmount();

    settingsForm.isDirty = true;
    settingsForm.dirtyCount = 2;
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes (2)" }));
    expect(settingsForm.save).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(settingsForm.reset).toHaveBeenCalledTimes(1);
  });
});
