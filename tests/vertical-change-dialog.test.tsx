import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { planVerticalChange } from "../src/lib/verticals/vertical-change";

// The super admin's vertical change dialog: it shows what the change does
// (the server's plan), lets the add-ons to switch off be chosen, needs a
// reason, and applies the change in one call.

const BRAND = "11111111-2222-4333-8444-555555555555";
const plan = planVerticalChange({
  brandId: BRAND,
  from: "food",
  to: "coffee",
  installed: [{ addon_id: "food-beverage", status: "installed" }],
  categories: [{ id: "c9", slug: "old-empty", name_en: "Old sweets", name_ar: "حلويات قديمة" }],
  usedKeys: new Set(),
  syncCategories: true,
});

const data = vi.hoisted(() => ({
  preview: vi.fn(),
  changeVertical: vi.fn(async () => ({ change_id: "x" })),
  invalidateAfterVerticalChange: vi.fn(async () => undefined),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const verticals = {
  verticalQueries: {
    preview: (brandId: string, vertical: string | null, syncCategories: boolean) => ({
      queryKey: ["vertical-preview-test", brandId, vertical, syncCategories],
      queryFn: () => data.preview(brandId, vertical, syncCategories),
      enabled: Boolean(vertical),
    }),
  },
  changeVertical: data.changeVertical,
  invalidateAfterVerticalChange: data.invalidateAfterVerticalChange,
};
vi.mock("../src/lib/data/verticals", () => verticals);
vi.mock("@/lib/data/verticals", () => verticals);

const { VerticalChangeDialog } = await import("../src/components/settings/VerticalChangeDialog");

function renderDialog({ isAr = false, onChanged = vi.fn() } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <VerticalChangeDialog
        brandId={BRAND}
        from="food"
        to="coffee"
        isAr={isAr}
        onClose={vi.fn()}
        onChanged={onChanged}
      />
    </QueryClientProvider>,
  );
  return { onChanged };
}

beforeEach(() => {
  vi.clearAllMocks();
  data.preview.mockImplementation(async (_brand: string, _to: string, sync: boolean) => ({
    ...plan,
    categories: sync ? plan.categories : null,
  }));
});

describe("VerticalChangeDialog", () => {
  it("shows what the change does, read from the server's plan", async () => {
    renderDialog();
    expect(await screen.findByText("Add-ons to install")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Food/ })).not.toBeChecked();
    expect(screen.getByText(/Old sweets/)).toBeInTheDocument();
    expect(data.preview).toHaveBeenCalledWith(BRAND, "coffee", true);
  });

  it("needs a reason, then applies the choices in one call", async () => {
    const { onChanged } = renderDialog();
    const apply = await screen.findByRole("button", { name: "Confirm & apply" });
    await screen.findByText("Add-ons to install");
    expect(apply).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Food/ }));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "ok" } });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "  Owner now roasts coffee " },
    });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("coffee"));
    expect(data.changeVertical).toHaveBeenCalledWith({
      brandId: BRAND,
      vertical: "coffee",
      reason: "Owner now roasts coffee",
      disableAddons: ["food-beverage"],
      syncCategories: true,
    });
    expect(data.invalidateAfterVerticalChange).toHaveBeenCalledTimes(1);
  });

  it("re-plans without categories when the super admin leaves them alone", async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Update categories/ }));
    await waitFor(() => expect(data.preview).toHaveBeenCalledWith(BRAND, "coffee", false));
    await waitFor(() => expect(screen.queryByText(/Old sweets/)).not.toBeInTheDocument());
  });

  it("reports a refusal plainly and stays open", async () => {
    data.changeVertical.mockRejectedValueOnce(new Error("STORE_VERTICAL_SUPER_ADMIN_ONLY"));
    const { onChanged } = renderDialog();
    fireEvent.change(await screen.findByLabelText(/Reason/), {
      target: { value: "Owner asked for it" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & apply" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Only Boutq can change a store's vertical."),
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("reads right to left in Arabic", async () => {
    renderDialog({ isAr: true });
    expect(await screen.findByText("إضافات ستُثبَّت")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("dir", "rtl");
  });
});
