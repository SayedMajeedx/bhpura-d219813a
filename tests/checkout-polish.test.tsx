import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldLink } from "../src/features/checkout/components/FieldLink";
import { placeOrderHint } from "../src/features/checkout/lib/checkout-validation";

// The checkout review of 2026-11-15: a discount code, a gift card and a note were three open
// boxes most shoppers never use, the delivery section showed one card that could not be changed
// labelled with the store's word "Default", a guest was asked to name the address, and a
// required tick held the button greyed out.

vi.mock("../src/components/region-picker", () => ({
  RegionPicker: () => <select aria-label="region" />,
}));
vi.mock("@/components/region-picker", () => ({
  RegionPicker: () => <select aria-label="region" />,
}));

const { DeliveryAddressCard } =
  await import("../src/features/checkout/components/DeliveryAddressCard");

const form = {
  name: "",
  phone: "",
  email: "",
  label: "",
  region: "",
  block: "",
  road: "",
  house: "",
  flat: "",
  notes: "",
};

function address(overrides: Partial<React.ComponentProps<typeof DeliveryAddressCard>> = {}) {
  const props: React.ComponentProps<typeof DeliveryAddressCard> = {
    currency: "BHD",
    form,
    handleAddressChange: () => undefined,
    homeEstimateLines: [],
    lang: "ar",
    savedAddresses: [],
    selectedAddressId: "manual",
    selectedCountryCode: "BH",
    selectedDestination: "BH",
    selectedZone: null,
    setForm: () => undefined,
    setSelectedAddressId: () => undefined,
    setSelectedCountryCode: () => undefined,
    setSelectedDestination: () => undefined,
    settings: { delivery_fee: 2 } as React.ComponentProps<typeof DeliveryAddressCard>["settings"],
    t: (ar: string) => ar,
    totalCartQuantity: 1,
    zones: [],
    ...overrides,
  };
  return render(<DeliveryAddressCard {...props} />);
}

describe("a field most shoppers never need", () => {
  it("is a link that opens it, focused", () => {
    render(
      <FieldLink label="Have a discount code?" focusId="code">
        <input id="code" aria-label="Code" />
      </FieldLink>,
    );
    expect(screen.queryByRole("textbox", { name: "Code" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Have a discount code?" }));
    const field = screen.getByRole("textbox", { name: "Code" });
    expect(document.activeElement).toBe(field);
  });

  it("starts open while it holds something", () => {
    render(
      <FieldLink label="Add a note" startOpen>
        <textarea aria-label="Note" defaultValue="Ring twice" />
      </FieldLink>,
    );
    expect(screen.getByRole("textbox", { name: "Note" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
  });
});

describe("the delivery address", () => {
  it("offers no destination when the store delivers in Bahrain only, and never says Default", () => {
    address();
    expect(screen.queryByText("وجهة التوصيل والشحن *")).toBeNull();
    expect(screen.queryByText("الافتراضي")).toBeNull();
  });

  it("asks a guest no name for the address, and a signed-in shopper may give one", () => {
    const { unmount } = address();
    expect(screen.queryByLabelText(/لقب العنوان/)).toBeNull();
    unmount();
    address({ signedIn: true });
    const label = screen.getByLabelText("لقب العنوان (اختياري)");
    expect(label.getAttribute("autocomplete")).toBe("off");
  });
});

describe("placing the order", () => {
  it("waits only on what the shopper must still do, never a terms tick", () => {
    const t = (_ar: string, en: string) => en;
    expect(
      placeOrderHint({
        acceptedTerms: true,
        method: "cod",
        benefitReceipt: null,
        receiptRequired: false,
        t,
      }),
    ).toBeNull();
  });
});
