import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BookingServiceOptions } from "../src/features/storefront-booking/components/BookingServiceOptions";
import type { BookingFlow } from "../src/features/storefront-booking/hooks/use-booking-flow";
import type { ServiceOption } from "../src/lib/bookings/service-options";

// An add-on's long description does not push the list apart: it opens from a small info button.
const option: ServiceOption = {
  id: "o1",
  product_id: "s1",
  name_en: "Instant printing",
  name_ar: "الطباعة الفورية",
  description_en: "Prints from a professional studio printer, ready in seconds.",
  description_ar: "طباعة احترافية جاهزة خلال ثوانٍ.",
  mode: "optional",
  price: 30,
  extra_hour_price: 10,
  tiers: null,
  max_quantity: null,
  sort_order: 0,
  is_active: true,
};

const flow = (isAr: boolean) =>
  ({
    isAr,
    currency: "BHD",
    showPrices: true,
    optionsOfService: () => [option],
    selectionFor: () => ({}),
    extraHoursFor: () => 2,
    setOptionQuantity: vi.fn(),
  }) as unknown as BookingFlow;

describe("an add-on's description on the booking page", () => {
  it("stays folded until the info button is pressed, then folds again", () => {
    render(<BookingServiceOptions flow={flow(false)} serviceId="s1" />);
    expect(screen.queryByText(/studio printer/)).toBeNull();
    const info = screen.getByRole("button", { name: "Details of Instant printing" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(info);
    expect(screen.getByText(/studio printer/)).toBeInTheDocument();
    expect(info).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(info);
    expect(screen.queryByText(/studio printer/)).toBeNull();
  });

  it("is named in Arabic for an Arabic reader, and the price is the chosen length's", () => {
    render(<BookingServiceOptions flow={flow(true)} serviceId="s1" />);
    expect(screen.getByRole("button", { name: "تفاصيل الطباعة الفورية" })).toBeInTheDocument();
    // 30 + 2 extra hours x 10.
    expect(screen.getByText(/50/)).toBeInTheDocument();
  });

  it("shows no button for an add-on with no description", () => {
    const bare = { ...option, description_en: null, description_ar: null };
    const f = { ...flow(false), optionsOfService: () => [bare] } as unknown as BookingFlow;
    render(<BookingServiceOptions flow={f} serviceId="s1" />);
    expect(screen.queryByRole("button", { name: /Details of/ })).toBeNull();
  });
});
