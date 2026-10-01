import React from "react";
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { serviceLengthsText } from "../src/lib/bookings/service-lengths";
import { bookingTermsText } from "../src/lib/bookings/terms";
import {
  answersText,
  bookingQuestions,
  notesWithAnswers,
  unansweredQuestion,
} from "../src/features/storefront-booking/lib/booking-questions";
import {
  bookableServices,
  bookingWhatsAppText,
  EMPTY_FLOW,
  missingStep,
  toBookingRequest,
} from "../src/features/storefront-booking/lib/booking-flow";
import { DEFAULT_BOOKING_RULES } from "../src/lib/bookings/rules";

// Services storefront: a photo booth's card said "Sold out", its page listed
// its lengths as "Size / option", talked about shipping, and the questions it
// asks were never put to the customer.

describe("a service's lengths in a few words", () => {
  it("reads as one length, a range of hours, or two lengths", () => {
    expect(serviceLengthsText([{ duration_minutes: 180 }], false)).toBe("3 hours");
    expect(serviceLengthsText([{ duration_minutes: 480 }, { duration_minutes: 180 }], true)).toBe(
      "3–8 ساعات",
    );
    expect(serviceLengthsText([{ duration_minutes: 90 }, { duration_minutes: 180 }], false)).toBe(
      "90 min – 3 hours",
    );
    expect(serviceLengthsText([{ duration_minutes: null }, {}], false)).toBeNull();
  });
});

describe("a service's booking terms", () => {
  it("say how far ahead to book, the deposit, the hold and how to change it", () => {
    const text = bookingTermsText({ lead_days: 2, deposit_percent: 25, hold_minutes: 15 }, false);
    expect(text).toContain("at least 2 days ahead");
    expect(text).toContain("25% deposit");
    expect(text).toContain("held for 15 minutes");
    expect(text).toContain("change or cancel");
    expect(bookingTermsText({ lead_days: 0 }, true)).toContain("لنفس اليوم");
    expect(bookingTermsText(null, false)).not.toContain("deposit");
  });
});

const booth = {
  id: "booth",
  name: "Photo booth",
  name_ar: "فوتوبوث",
  name_en: "Photo booth",
  image_url: null,
  item_kind: "service",
  custom_fields: [
    { key: "guests", label_ar: "عدد الضيوف", label_en: "Guests", type: "number", required: true },
    {
      key: "theme",
      label_ar: "الثيم",
      label_en: "Theme",
      type: "select",
      options: ["Gold", "Rose"],
    },
    { key: "logo", label_ar: "الشعار", label_en: "Logo", type: "file", required: true },
    { key: "", label_en: "No key", type: "text" },
  ],
  product_variants: [{ id: "v3", selling_price: 40, duration_minutes: 180 }],
};

describe("the questions a service asks", () => {
  it("are asked in the details step, files and keyless fields left out", () => {
    const questions = bookingQuestions([booth], false);
    expect(questions.map((q) => [q.id, q.label, q.type, q.required])).toEqual([
      ["booth:guests", "Guests", "number", true],
      ["booth:theme", "Theme", "select", false],
    ]);
    expect(bookingQuestions([booth], true)[0].label).toBe("عدد الضيوف");
  });

  it("must be answered when required, and go with the booking", () => {
    const questions = bookingQuestions([booth], false);
    expect(unansweredQuestion(questions, {})?.id).toBe("booth:guests");
    expect(unansweredQuestion(questions, { "booth:guests": "80" })).toBeNull();
    const answers = { "booth:guests": " 80 ", "booth:theme": "Gold" };
    expect(answersText(questions, answers)).toBe("Guests: 80\nTheme: Gold");
    expect(notesWithAnswers("Back gate", questions, answers)).toBe(
      "Back gate\n\nGuests: 80\nTheme: Gold",
    );
  });

  it("name their service when several are booked", () => {
    const dj = {
      ...booth,
      id: "dj",
      name_en: "DJ",
      custom_fields: booth.custom_fields.slice(1, 2),
    };
    const questions = bookingQuestions([booth, dj], false);
    expect(answersText(questions, { "booth:guests": "80", "dj:theme": "Rose" })).toBe(
      "Photo booth · Guests: 80\nDJ · Theme: Rose",
    );
  });
});

describe("the booking flow with questions", () => {
  const rules = { ...DEFAULT_BOOKING_RULES, min_duration_minutes: 180, max_duration_minutes: 480 };
  const flow = {
    ...EMPTY_FLOW,
    day: "2026-10-08",
    services: ["booth"],
    durationMinutes: 180,
    start: "18:00",
    name: "Ali",
    phone: "+973 3999 0016",
  };
  const states = new Map([["2026-10-08", "available" as const]]);

  it("waits on the details step until a required answer is in", () => {
    expect(missingStep(flow, rules, states, [booth])).toBe("details");
    expect(
      missingStep({ ...flow, answers: { "booth:guests": "80" } }, rules, states, [booth]),
    ).toBeNull();
  });

  it("sends the answers as the booking's notes, in the customer's language", () => {
    const request = toBookingRequest(
      "b1",
      { ...flow, notes: "Back gate", answers: { "booth:guests": "80" } },
      [booth],
      true,
    );
    expect(request.notes).toBe("Back gate\n\nعدد الضيوف: 80");
    expect(toBookingRequest("b1", flow, [booth]).notes).toBeUndefined();
  });

  it("books services only, not the store's products", () => {
    const tshirt = { ...booth, id: "tee", item_kind: "product" };
    expect(bookableServices([booth, tshirt]).map((s) => s.id)).toEqual(["booth"]);
  });

  it("puts the answers in the WhatsApp message", () => {
    const text = bookingWhatsAppText({
      isAr: false,
      brandName: "Aurora",
      reference: "BK-1",
      dayLabel: "Thursday 8 October",
      timeLabel: "6:00 PM – 9:00 PM",
      services: ["Photo booth"],
      place: "",
      name: "Ali",
      totalLabel: null,
      answers: "Guests: 80",
    });
    expect(text.endsWith("Name: Ali\nGuests: 80")).toBe(true);
  });
});

const storefront = {
  useStorefront: () => ({
    brand: { id: "b1", slug: "aurora" },
    lang: "en",
    currency: "BHD",
    t: (_ar: string, en: string) => en,
  }),
  formatPrice: (n: number) => `BHD ${n.toFixed(3)}`,
};
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);
const bookingsData = {
  bookingsQueries: {
    publicRules: (brandId: string) =>
      queryOptions({
        queryKey: ["bookings", brandId, "public-rules"],
        queryFn: async () => ({ deposit_percent: 20 }),
      }),
  },
};
vi.mock("../src/lib/data/bookings", () => bookingsData);
vi.mock("@/lib/data/bookings", () => bookingsData);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: React.ReactNode; search?: Record<string, unknown> }) => (
    <a href={`/book?${new URLSearchParams(search as Record<string, string>)}`}>{children}</a>
  ),
}));

const { ServicePurchasePanel } =
  await import("../src/features/product-page/components/ServicePurchasePanel");

describe("a service's page", () => {
  it("prices each length, books the chosen one, and says where and what's included", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ServicePurchasePanel
          product={{
            id: "booth",
            service_location: "customer",
            service_includes: [{ ar: "إضاءة", en: "Lighting" }],
            product_variants: [
              { id: "v5", selling_price: 60, duration_minutes: 300 },
              { id: "v3", selling_price: 40, duration_minutes: 180 },
            ],
          }}
        />
      </QueryClientProvider>,
    );
    const book = () => screen.getByRole("link", { name: /Pick a date/ });
    expect(screen.getByRole("radio", { name: /3 hours/ }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(book().getAttribute("href")).toBe("/book?service=booth&minutes=180");

    fireEvent.click(screen.getByRole("radio", { name: /5 hours/ }));
    expect(book().getAttribute("href")).toBe("/book?service=booth&minutes=300");
    expect(screen.getAllByText("BHD 60.000").length).toBeGreaterThan(0);

    expect(screen.getByText("We come to your venue")).toBeTruthy();
    expect(screen.getByText("Lighting")).toBeTruthy();
    expect(await screen.findByText(/20% deposit/)).toBeTruthy();
  });
});
