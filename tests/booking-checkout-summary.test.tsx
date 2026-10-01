import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import guestFix from "../supabase/migrations/20261002130000_fix_guest_checkout_customer_owner.sql?raw";
import { formatClockRange } from "../src/lib/bookings/format";
import {
  appointmentCheckoutForm,
  appointmentFormApplied,
} from "../src/features/checkout/lib/appointment-checkout";
import { checkoutFormError } from "../src/features/checkout/lib/checkout-validation";
import type { CheckoutForm } from "../src/features/checkout/types";

// A booking's checkout: the customer already told us who, when and where on the
// booking page, so checkout shows that once and asks for the payment.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const { AppointmentDetailsCard } =
  await import("../src/features/checkout/components/AppointmentDetailsCard");

const empty: CheckoutForm = {
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
const booking = {
  id: "bk1",
  token: "t",
  reference: "BK-1",
  day: "2026-10-02",
  start: "13:00",
  durationMinutes: 180,
  expiresAt: "2026-10-02T10:00:00Z",
  customer: { name: "Sayed", phone: "39950016" },
  place: { area: "Isa Town", venue: "Villa 24" },
  notes: "Gold backdrop",
};
const t = (_ar: string, en: string) => en;

describe("the form of a booking's checkout", () => {
  it("takes the customer and notes from the booking, and leaves the address empty", () => {
    expect(appointmentCheckoutForm(empty, booking)).toEqual({
      ...empty,
      name: "Sayed",
      phone: "39950016",
      notes: "Gold backdrop",
    });
    // Other details the customer has (an email) stay.
    expect(appointmentCheckoutForm({ ...empty, email: "s@example.com" }, booking).email).toBe(
      "s@example.com",
    );
    // No booking: untouched.
    expect(appointmentCheckoutForm(empty, null)).toBe(empty);
  });

  it("knows when it is already applied, so it is set once", () => {
    expect(appointmentFormApplied(empty, booking)).toBe(false);
    expect(appointmentFormApplied(appointmentCheckoutForm(empty, booking), booking)).toBe(true);
    expect(appointmentFormApplied(empty, null)).toBe(true);
  });

  it("asks for no delivery address, but still for the payment and the terms", () => {
    const base = {
      form: appointmentCheckoutForm(empty, booking),
      fulfillment: "delivery" as const,
      acceptedTerms: true,
      selectedDestination: "BH",
      method: "cod" as const,
      benefitReceipt: null,
      branches: [],
      branchId: "",
      digitalChannel: "email" as const,
      digitalContact: "",
      t,
    };
    expect(checkoutFormError({ ...base, appointment: true })).toBeNull();
    // A delivery order without the booking still needs the address.
    expect(checkoutFormError({ ...base, appointment: false })).toMatch(/Bahrain/);
    expect(checkoutFormError({ ...base, appointment: true, acceptedTerms: false })).toMatch(
      /terms/,
    );
    expect(checkoutFormError({ ...base, appointment: true, method: "" })).toMatch(/payment/);
    expect(
      checkoutFormError({ ...base, appointment: true, form: { ...empty, name: "", phone: "" } }),
    ).toMatch(/Name and phone/);
  });
});

describe("the times of a booking, in Arabic and English", () => {
  it("reads start to end whichever way the page runs", () => {
    expect(formatClockRange("13:00", "16:00", false)).toBe("1:00 PM – 4:00 PM");
    const ar = formatClockRange("13:00", "16:00", true);
    // Each clock is its own right-to-left isolate: start first, then the dash, then the end.
    expect(ar).toBe("⁧1:00 م⁩ – ⁧4:00 م⁩");
    expect(ar.indexOf("1:00")).toBeLessThan(ar.indexOf("4:00"));
    expect(ar.split("⁧")).toHaveLength(3);
    expect(ar.split("⁩")).toHaveLength(3);
  });
});

describe("the booking summary of checkout", () => {
  it("shows the day, time, person, place and notes once, with a way to change them", () => {
    render(
      <AppointmentDetailsCard appointment={booking} brand={{ slug: "aurora" }} lang="en" t={t} />,
    );
    expect(screen.getByText("Your booking")).toBeInTheDocument();
    expect(screen.getByText(/Friday/)).toBeInTheDocument();
    expect(screen.getByText("1:00 PM – 4:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Sayed")).toBeInTheDocument();
    expect(screen.getByText("39950016")).toBeInTheDocument();
    expect(screen.getByText("Isa Town، Villa 24")).toBeInTheDocument();
    expect(screen.getByText("Gold backdrop")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Change/ })).toHaveAttribute("href", "/$slug/book");
  });

  it("leaves out what the booking does not have", () => {
    render(
      <AppointmentDetailsCard
        appointment={{ ...booking, customer: undefined, place: undefined, notes: null }}
        brand={{ slug: "aurora" }}
        lang="en"
        t={t}
      />,
    );
    expect(screen.queryByText("Sayed")).toBeNull();
    expect(screen.queryByText("Gold backdrop")).toBeNull();
    expect(screen.getByText("1:00 PM – 4:00 PM")).toBeInTheDocument();
  });
});

describe("a first-time guest's checkout", () => {
  it("creates the customer and the saved address with the store owner's user id", () => {
    // The order builder was inserting both without it (customers.user_id and
    // customer_addresses.user_id are NOT NULL), so a new shopper's order failed.
    expect(guestFix).toContain(
      "INSERT INTO public.customers (user_id, brand_id, name, phone, email)",
    );
    expect(guestFix).not.toContain("INSERT INTO public.customers (brand_id, name, phone, email)");
    expect(guestFix).toMatch(
      /INSERT INTO public\.customer_addresses \(\s*user_id, customer_id, brand_id/,
    );
    expect(guestFix).toContain(
      "(SELECT c.user_id FROM public.customers c WHERE c.id = v_customer_id)",
    );
    // The owner is the store's, resolved before the customer is made.
    expect(guestFix.indexOf("v_owner := v_brand.created_by")).toBeLessThan(
      guestFix.indexOf("INSERT INTO public.customers"),
    );
  });
});
