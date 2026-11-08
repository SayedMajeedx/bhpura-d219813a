import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Leaving the inventory's sheet with changes not yet saved asks first; with none it just leaves.

const confirm = vi.hoisted(() => ({ answer: false, confirmDialog: vi.fn() }));
const dialog = {
  confirmDialog: (...args: unknown[]) => {
    confirm.confirmDialog(...args);
    return Promise.resolve(confirm.answer);
  },
};
vi.mock("../src/components/ui/confirm-dialog", () => dialog);
vi.mock("@/components/ui/confirm-dialog", () => dialog);
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const { useSheetLayout } = await import("../src/features/inventory/hooks/use-sheet-layout");
const { inventoryViewFromSearch } = await import("../src/features/inventory/lib/list-view");

beforeEach(() => vi.clearAllMocks());

function sheetOpen() {
  const setLayout = vi.fn();
  const hook = renderHook(() => useSheetLayout({ layout: "sheet", setLayout, isAr: false }));
  return { hook, setLayout };
}

describe("leaving the sheet", () => {
  it("is opened from the address", () => {
    expect(inventoryViewFromSearch({ view: "sheet" }).layout).toBe("sheet");
    expect(inventoryViewFromSearch({ view: "other" }).layout).toBe("list");
  });

  it("leaves at once with nothing unsaved", async () => {
    const { hook, setLayout } = sheetOpen();
    await act(() => hook.result.current.changeLayout("list"));
    expect(confirm.confirmDialog).not.toHaveBeenCalled();
    expect(setLayout).toHaveBeenCalledWith("list");
  });

  it("asks first with changes unsaved, and stays when told to", async () => {
    const { hook, setLayout } = sheetOpen();
    act(() => hook.result.current.setSheetDirty(true));
    confirm.answer = false;
    await act(() => hook.result.current.changeLayout("photos"));
    expect(confirm.confirmDialog).toHaveBeenCalled();
    expect(setLayout).not.toHaveBeenCalled();
    confirm.answer = true;
    await act(() => hook.result.current.changeLayout("photos"));
    expect(setLayout).toHaveBeenCalledWith("photos");
  });
});
