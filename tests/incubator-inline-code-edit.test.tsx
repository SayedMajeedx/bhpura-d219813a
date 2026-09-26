import React from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const updateIncubatorItem = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("sonner", () => ({ toast }));
vi.mock("../src/lib/data/incubators", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateIncubatorItem,
}));
vi.mock("@/lib/data/incubators", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateIncubatorItem,
}));

const { InlineCodeEditor, useSaveIncubatorCode } =
  await import("../src/components/incubators/InlineCodeEditor");
const { incubatorsKeys } = await import("../src/lib/data/incubators");

beforeEach(() => vi.clearAllMocks());

const renderEditor = (onSave = vi.fn(async (_value: string) => undefined)) => {
  render(<InlineCodeEditor value="A-1" isAr={false} onSave={onSave} />);
  return { onSave, field: screen.getByRole("textbox", { name: "Incubator code" }) };
};

describe("inline incubator code editing", () => {
  it("edits the code in its table cell and saves the trimmed value on blur", async () => {
    const { onSave, field } = renderEditor();
    expect(field).toHaveValue("A-1");
    expect(field).toHaveAttribute("placeholder", "Enter code");
    fireEvent.change(field, { target: { value: "  B-2 " } });
    fireEvent.blur(field);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("B-2"));
    expect(toast.success).toHaveBeenCalledWith("Incubator code saved");
    // An unchanged value is not saved again.
    fireEvent.blur(field);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("saves on Enter", async () => {
    const { onSave, field } = renderEditor();
    fireEvent.change(field, { target: { value: "B-2" } });
    field.focus();
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("B-2"));
  });

  it("cancels with Escape", () => {
    const { onSave, field } = renderEditor();
    fireEvent.change(field, { target: { value: "C-3" } });
    field.focus();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(field).toHaveValue("A-1");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("restores the old code and explains a duplicate", async () => {
    const { field } = renderEditor(vi.fn(async () => Promise.reject({ code: "23505" })));
    fireEvent.change(field, { target: { value: "TAKEN" } });
    fireEvent.blur(field);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This code is already used by another item in this incubator",
      ),
    );
    expect(field).toHaveValue("A-1");
  });

  it("uses the secured item update and refreshes the incubator stock", async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSaveIncubatorCode("b1"), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });
    const item = {
      id: "inv1",
      consignment_price: 12,
      commission_type: "percentage",
      commission_value: 10,
    };
    await act(() => result.current(item, " B-2 "));
    expect(updateIncubatorItem).toHaveBeenCalledWith({
      inventoryId: "inv1",
      externalCode: "B-2",
      consignmentPrice: 12,
      commissionType: "percentage",
      commissionValue: 10,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: incubatorsKeys.inventory("b1") });
  });
});
