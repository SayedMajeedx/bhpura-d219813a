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
  requires_option_id: null,
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

describe("an add-on that needs another, on the booking page", () => {
  const prints: ServiceOption = {
    ...option,
    id: "prints",
    name_en: "Instant prints",
    name_ar: "الطباعة الفورية",
    mode: "default_on",
    description_en: null,
    description_ar: null,
  };
  const magnets: ServiceOption = {
    ...option,
    id: "magnets",
    name_en: "Magnets",
    name_ar: "مغناطيس",
    price: 25,
    description_en: null,
    description_ar: null,
    requires_option_id: "prints",
  };
  const flowWith = (selection: Record<string, number>, isAr = false) =>
    ({
      isAr,
      currency: "BHD",
      showPrices: true,
      optionsOfService: () => [prints, magnets],
      selectionFor: () => selection,
      extraHoursFor: () => 0,
      setOptionQuantity: vi.fn(),
    }) as unknown as BookingFlow;

  it("waits, with the reason, until the one it needs is chosen", () => {
    render(<BookingServiceOptions flow={flowWith({})} serviceId="s1" />);
    expect(screen.getByRole("checkbox", { name: "Magnets" })).toBeDisabled();
    expect(screen.getByText("Add “Instant prints” first")).toBeInTheDocument();
  });

  it("can be chosen once the one it needs is", () => {
    const flow = flowWith({ prints: 1 });
    render(<BookingServiceOptions flow={flow} serviceId="s1" />);
    expect(screen.getByRole("checkbox", { name: "Magnets" })).toBeEnabled();
    expect(screen.queryByText(/first$/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Magnets" }));
    expect(flow.setOptionQuantity).toHaveBeenCalledWith("s1", "magnets", 1);
  });

  it("says so in Arabic", () => {
    render(<BookingServiceOptions flow={flowWith({}, true)} serviceId="s1" />);
    expect(screen.getByText("أضف «الطباعة الفورية» أولاً")).toBeInTheDocument();
  });
});
