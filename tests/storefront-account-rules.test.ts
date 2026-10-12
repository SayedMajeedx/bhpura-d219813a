import { describe, expect, it } from "vitest";
import { getInitials, statusMeta } from "../src/features/storefront-account/lib/account-shared";
import { emptyAddress } from "../src/features/storefront-account/lib/empty-address";
import { getInvoiceStatusLabel } from "../src/lib/status-labels";

// What a shopper's account page says about an order, and the small rules its sections share.

describe("how an order's state reads on the account page", () => {
  it("says cancelled, in the shopper's language, whichever field says so", () => {
    expect(statusMeta("cancelled", null, null, false).label).toBe("Cancelled");
    expect(statusMeta("confirmed", "paid", "CANCELLED", true).label).toBe("ملغي");
    expect(statusMeta("cancelled", null, null, false).tone).toContain("red");
  });

  it("is named after the stage the order is at, and after its status when it has no stage", () => {
    expect(statusMeta("confirmed", "paid", "NEEDS_PACKING", false).label).toBe(
      getInvoiceStatusLabel("NEEDS_PACKING", "en"),
    );
    expect(statusMeta("pending", null, null, true).label).toBe(
      getInvoiceStatusLabel("pending", "ar"),
    );
  });

  it("is coloured by how far the order has come", () => {
    const tone = (status: string, stage: string | null) =>
      statusMeta(status, null, stage, false).tone;
    expect(tone("confirmed", "SENT_TO_TAILOR")).toContain("purple");
    for (const stage of ["RECEIVED_FROM_TAILOR", "NEEDS_PACKING", "PACKING"]) {
      expect(tone("confirmed", stage)).toContain("blue");
    }
    expect(tone("confirmed", "READY_FOR_PICKUP")).toContain("indigo");
    for (const stage of ["SHIPPED", "ASSIGNED", "OUT_FOR_DELIVERY"]) {
      expect(tone("confirmed", stage)).toContain("sky");
    }
    expect(tone("shipped", null)).toContain("sky");
    for (const stage of ["COMPLETED", "DELIVERED"])
      expect(tone("confirmed", stage)).toContain("emerald");
    expect(tone("completed", null)).toContain("emerald");
    // Anything earlier is still waiting.
    expect(tone("pending", "ON_HOLD")).toContain("amber");
    expect(tone("pending", null)).toContain("amber");
  });

  it("reads a stage written in any case", () => {
    expect(statusMeta("confirmed", null, "delivered", false).tone).toContain("emerald");
  });
});

describe("a shopper's initials", () => {
  it("are the first letters of the first and last name", () => {
    expect(getInitials("sara ali")).toBe("SA");
    expect(getInitials("  Sara   bint  Ali ")).toBe("SA");
  });

  it("are the first two letters of a single name", () => {
    expect(getInitials("Noura")).toBe("NO");
    expect(getInitials("N")).toBe("N");
  });
});

describe("a new address", () => {
  it("starts as a home address with nothing filled in, and is a fresh object each time", () => {
    const first = emptyAddress();
    expect(first).toMatchObject({ label: "Home", region: "", block: "", is_default: false });
    expect(emptyAddress()).not.toBe(first);
    expect(emptyAddress()).toEqual(first);
  });
});
