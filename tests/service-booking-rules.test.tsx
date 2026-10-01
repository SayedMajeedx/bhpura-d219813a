import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  describeServiceBooking,
  serviceBookingColumns,
  serviceBookingError,
  serviceBookingForm,
  serviceBookingFrom,
  serviceBookingRulesOfForm,
  type ServiceBookingForm,
} from "../src/lib/bookings/service-capacity";
import { bookingErrorMessage } from "../src/lib/bookings/errors";
import {
  productColumnsFrom,
  productFormFrom,
  validateProductForm,
} from "../src/features/inventory/lib/product-form";
import { ServiceBookingFields } from "../src/features/inventory/components/ServiceBookingFields";
import type { Product } from "../src/features/inventory/types";

// Booking engine v2: a service carries its own capacity, scope, setup time and
// notice. The database enforces them (tests/booking-engine-capacity.test.ts);
// this is what the merchant reads and writes.

describe("a service's booking rules", () => {
  it("read from a product row, defaulting to no limit of its own", () => {
    expect(serviceBookingFrom(undefined)).toEqual({
      capacity: null,
      scope: "day",
      bufferMinutes: 0,
      noticeHours: null,
    });
    expect(
      serviceBookingFrom({
        booking_capacity: 2,
        booking_scope: "time",
        booking_buffer_minutes: 30,
        booking_notice_hours: 12,
      }),
    ).toEqual({ capacity: 2, scope: "time", bufferMinutes: 30, noticeHours: 12 });
    // Anything else reads as the default.
    expect(serviceBookingFrom({ booking_scope: "weird", booking_capacity: 1.5 })).toMatchObject({
      scope: "day",
      capacity: null,
    });
  });

  it("round-trip through the editor's text fields", () => {
    const form = serviceBookingForm({
      booking_capacity: 2,
      booking_scope: "time",
      booking_buffer_minutes: 30,
      booking_notice_hours: 0,
    });
    expect(form).toEqual({
      booking_capacity: "2",
      booking_scope: "time",
      booking_buffer_minutes: "30",
      booking_notice_hours: "0",
    });
    expect(serviceBookingRulesOfForm(form)).toEqual({
      capacity: 2,
      scope: "time",
      bufferMinutes: 30,
      noticeHours: 0,
    });
    expect(serviceBookingColumns(form, true)).toEqual({
      booking_capacity: 2,
      booking_scope: "time",
      booking_buffer_minutes: 30,
      booking_notice_hours: 0,
    });
  });

  it("keep setup time only for a service kept by the hour with a capacity", () => {
    const base: ServiceBookingForm = {
      booking_capacity: "1",
      booking_scope: "day",
      booking_buffer_minutes: "45",
      booking_notice_hours: "",
    };
    expect(serviceBookingColumns(base, true).booking_buffer_minutes).toBe(0);
    expect(
      serviceBookingColumns({ ...base, booking_scope: "time", booking_capacity: "" }, true)
        .booking_buffer_minutes,
    ).toBe(0);
    expect(
      serviceBookingColumns({ ...base, booking_scope: "time" }, true).booking_buffer_minutes,
    ).toBe(45);
  });

  it("are cleared for a product, which has none", () => {
    const form = serviceBookingForm({ booking_capacity: 3, booking_notice_hours: 24 });
    expect(serviceBookingColumns(form, false)).toEqual({
      booking_capacity: null,
      booking_scope: "day",
      booking_buffer_minutes: 0,
      booking_notice_hours: null,
    });
  });

  it("refuse a capacity, setup time or notice out of range", () => {
    const form = (patch: Partial<ServiceBookingForm>): ServiceBookingForm => ({
      booking_capacity: "",
      booking_scope: "day",
      booking_buffer_minutes: "",
      booking_notice_hours: "",
      ...patch,
    });
    expect(serviceBookingError(form({}), false)).toBeNull();
    expect(
      serviceBookingError(form({ booking_capacity: "2", booking_notice_hours: "0" }), false),
    ).toBeNull();
    expect(serviceBookingError(form({ booking_capacity: "0" }), false)).toMatch(/1 to 50/);
    expect(serviceBookingError(form({ booking_capacity: "51" }), true)).toMatch(/50/);
    expect(serviceBookingError(form({ booking_capacity: "1.5" }), false)).toMatch(/whole number/);
    expect(serviceBookingError(form({ booking_buffer_minutes: "-5" }), false)).toMatch(/0 to 480/);
    expect(serviceBookingError(form({ booking_notice_hours: "9000" }), false)).toMatch(/8760/);
  });

  it("are described in a few words for the merchant", () => {
    expect(
      describeServiceBooking(
        { capacity: 2, scope: "day", bufferMinutes: 0, noticeHours: 48 },
        false,
      ),
    ).toEqual(["Up to 2 bookings at once", "Kept for the whole day", "2 days notice"]);
    expect(
      describeServiceBooking(
        { capacity: 1, scope: "time", bufferMinutes: 30, noticeHours: 0 },
        false,
      ),
    ).toEqual([
      "One booking at a time",
      "Kept only for its own hours",
      "30 min between bookings",
      "No notice needed",
    ]);
    expect(
      describeServiceBooking(
        { capacity: 1, scope: "time", bufferMinutes: 0, noticeHours: 12 },
        true,
      ),
    ).toEqual(["حجز واحد في الوقت نفسه", "تُحجز لساعاتها فقط", "إشعار مسبق 12 ساعة"]);
    // A service with no rules of its own says nothing.
    expect(describeServiceBooking(serviceBookingFrom(undefined), false)).toEqual([]);
  });
});

describe("the service editor's saved rules", () => {
  const service = (fields: Partial<Product>) => fields as Product;

  it("save a service's rules and clear a product's", () => {
    const form = productFormFrom(
      service({
        item_kind: "service",
        booking_capacity: 2,
        booking_scope: "day",
        booking_notice_hours: 48,
      }),
    );
    expect(productColumnsFrom(form)).toMatchObject({
      booking_capacity: 2,
      booking_scope: "day",
      booking_buffer_minutes: 0,
      booking_notice_hours: 48,
    });
    expect(productColumnsFrom({ ...form, item_kind: "product" })).toMatchObject({
      booking_capacity: null,
      booking_notice_hours: null,
    });
  });

  it("refuse a service whose rules are out of range, and ignore a product's", () => {
    const form = productFormFrom(
      service({ item_kind: "service", name: "Booth", name_en: "Booth" }),
    );
    expect(validateProductForm({ ...form, booking_capacity: "99" }, false).booking).toMatch(/50/);
    expect(validateProductForm({ ...form, booking_capacity: "2" }, false).booking).toBeUndefined();
    expect(
      validateProductForm({ ...form, item_kind: "product", booking_capacity: "99" }, false).booking,
    ).toBeUndefined();
  });
});

describe("the service's rules section of the editor", () => {
  function Harness({ initial }: { initial?: Partial<ServiceBookingForm> }) {
    const [value, setValue] = useState<ServiceBookingForm>({
      ...serviceBookingForm(undefined),
      ...initial,
    });
    return (
      <>
        <ServiceBookingFields
          value={value}
          onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
          isAr={false}
        />
        <output data-testid="state">{JSON.stringify(value)}</output>
      </>
    );
  }
  const state = () =>
    JSON.parse(screen.getByTestId("state").textContent ?? "{}") as ServiceBookingForm;

  it("asks only what a service with a limit needs", () => {
    render(<Harness />);
    // No capacity yet: no scope or setup time to choose.
    expect(screen.queryByRole("button", { name: /The whole day/ })).toBeNull();

    fireEvent.change(screen.getByLabelText("Bookings at the same time"), {
      target: { value: "2" },
    });
    expect(state().booking_capacity).toBe("2");
    expect(screen.getByRole("button", { name: /The whole day/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    // Setup time only for a service kept by the hour.
    expect(screen.queryByText(/Setup \/ clean-up/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Only its hours/ }));
    expect(state().booking_scope).toBe("time");
    expect(screen.getByText(/Setup \/ clean-up/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "30" }));
    expect(state().booking_buffer_minutes).toBe("30");
  });

  it("sets the notice from a quick choice, and sums the rules up", () => {
    render(<Harness initial={{ booking_capacity: "1", booking_scope: "time" }} />);
    fireEvent.click(screen.getByRole("button", { name: "2 days" }));
    expect(state().booking_notice_hours).toBe("48");
    expect(
      screen.getByText(/One booking at a time · Kept only for its own hours · 2 days notice/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Store default" }));
    expect(state().booking_notice_hours).toBe("");
  });
});

describe("the message for a service that is already booked", () => {
  it("reads as such, in both languages", () => {
    expect(bookingErrorMessage("BOOKING_SERVICE_FULL", false)).toMatch(
      /already booked at this time/,
    );
    expect(bookingErrorMessage("BOOKING_SERVICE_FULL", true)).toMatch(/محجوزة في هذا الوقت/);
  });
});
