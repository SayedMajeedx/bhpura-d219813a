import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { adminAddress, storeAddress, PLATFORM_HOST } from "../src/lib/platform-host";
import { assignableCategories, smartKindOf } from "../src/lib/smart-categories";
import { availabilityBadge, productAvailability } from "../src/lib/product-availability";
import { ConfirmDialogHost, confirmDialog } from "../src/components/ui/confirm-dialog";

// Found walking Pura's live admin before going live (2026-10-24).

describe("the platform's address", () => {
  it("is boutq.store for a store and its admin", () => {
    expect(PLATFORM_HOST).toBe("boutq.store");
    expect(storeAddress("pura")).toBe("https://boutq.store/pura");
    expect(adminAddress("pura")).toBe("https://boutq.store/admin/b/pura");
  });
});

describe("a product's category picker", () => {
  const categories = [
    { id: "1", slug: "abayas", name_en: "Abayas" },
    { id: "2", slug: "new-arrivals", name_en: "New arrivals" },
    { id: "3", slug: "most-selling", name_en: "Most selling" },
    { id: "4", slug: "sale", name_en: "Sale" },
  ];

  it("offers no automatic collection", () => {
    expect(assignableCategories(categories).map((c) => c.slug)).toEqual(["abayas"]);
    expect(smartKindOf(" Sale ")).toBe("offers");
    expect(smartKindOf("abayas")).toBeNull();
  });

  it("keeps the one a product is already filed under, so the picker shows it", () => {
    expect(assignableCategories(categories, "sale").map((c) => c.slug)).toEqual(["abayas", "sale"]);
  });
});

describe("a sold-out product", () => {
  it("is spelt نفدت, not نفذت (which means carried out)", () => {
    const out = productAvailability({ is_made_to_order: false, item_kind: "product" }, 0);
    expect(availabilityBadge(out, "ar", { unitsLabel: () => "" }).label).toBe("نفدت الكمية");
  });
});

describe("asking before a step that cannot be undone", () => {
  it("uses the app's own dialog, and resolves with the person's answer", async () => {
    document.documentElement.lang = "ar";
    render(<ConfirmDialogHost />);
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => {
      answer = confirmDialog({ title: "حذف هذا المصروف؟", destructive: true });
    });
    expect(await screen.findByText("حذف هذا المصروف؟")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حذف" }));
    await expect(answer).resolves.toBe(true);
  });

  it("resolves false when cancelled", async () => {
    render(<ConfirmDialogHost />);
    let answer: Promise<boolean> = Promise.resolve(true);
    act(() => {
      answer = confirmDialog({ title: "Delete this webhook?" });
    });
    fireEvent.click(await screen.findByRole("button", { name: /إلغاء|Cancel/ }));
    await expect(answer).resolves.toBe(false);
  });

  it("falls back to the browser's box only when no dialog is mounted", async () => {
    const native = vi.spyOn(window, "confirm").mockReturnValue(true);
    await expect(confirmDialog({ title: "x" })).resolves.toBe(true);
    expect(native).toHaveBeenCalledWith("x");
    native.mockRestore();
  });
});
