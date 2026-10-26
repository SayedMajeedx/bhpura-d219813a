import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { monthHasAvailableDay } from "../src/features/storefront-booking/lib/booking-flow";
import {
  DAY_PERIODS,
  periodOf,
  periodsOf,
} from "../src/features/storefront-booking/lib/time-periods";

// What makes the booking page short and light: the day in three parts, the terms and the
// questions folded, the calendar that opens where there is a day to book.

const state = vi.hoisted(() => ({
  policy: null as Record<string, unknown> | null,
  faq: [] as Array<Record<string, unknown>>,
}));
const policies = {
  bookingPoliciesQueries: {
    policy: () => ({ queryKey: ["ux-policy"], queryFn: async () => state.policy }),
  },
};
vi.mock("../src/lib/data/booking-policies", () => policies);
vi.mock("@/lib/data/booking-policies", () => policies);
const content = {
  storeContentQueries: {
    publicFaq: () => ({ queryKey: ["ux-faq"], queryFn: async () => state.faq }),
  },
};
vi.mock("../src/lib/data/store-content", () => content);
vi.mock("@/lib/data/store-content", () => content);

const { BookingPolicies } =
  await import("../src/features/storefront-booking/components/BookingPolicies");
const { StoreFaq } = await import("../src/features/store-content/components/StoreFaq");

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

beforeEach(() => {
  state.policy = null;
  state.faq = [];
});

describe("the day in three parts", () => {
  it("puts a time in the morning before noon, the afternoon until five, the evening after", () => {
    expect(DAY_PERIODS.map((p) => p.id)).toEqual(["morning", "noon", "evening"]);
    expect(periodOf("10:00")).toBe("morning");
    expect(periodOf("11:30:00")).toBe("morning");
    expect(periodOf("12:00")).toBe("noon");
    expect(periodOf("16:30")).toBe("noon");
    expect(periodOf("17:00")).toBe("evening");
    expect(periodOf("22:00")).toBe("evening");
  });

  it("lists only the parts that have a time, in order, each with its times", () => {
    expect(periodsOf(["10:00", "10:30", "13:00", "18:00", "22:00"])).toMatchObject([
      { id: "morning", times: ["10:00", "10:30"] },
      { id: "noon", times: ["13:00"] },
      { id: "evening", times: ["18:00", "22:00"] },
    ]);
    expect(periodsOf(["19:00"]).map((p) => p.id)).toEqual(["evening"]);
    expect(periodsOf([])).toEqual([]);
  });
});

describe("the month the calendar opens on", () => {
  it("has a free day only when one of its days is available", () => {
    const states = new Map([
      ["2026-10-30", "full"],
      ["2026-11-03", "available"],
    ]);
    expect(monthHasAvailableDay(states, 2026, 10)).toBe(false);
    expect(monthHasAvailableDay(states, 2026, 11)).toBe(true);
    expect(monthHasAvailableDay(states, 2026, 12)).toBe(false);
  });
});

describe("the booking terms on the booking page", () => {
  const policy = {
    balance_due_days: 1,
    reschedule_months: null,
    deposit_refundable: true,
    terms_en: "• Cancel a week ahead.\n• Security deposit 20 BHD.",
    terms_ar: null,
  };

  it("keep the short sentences in view, fold the long text and say that sending accepts them", async () => {
    state.policy = policy;
    wrap(<BookingPolicies brandId="b1" isAr={false} depositPercent={50} compact />);
    expect(await screen.findByText("The 50% deposit is refunded if you cancel.")).toBeVisible();
    expect(screen.getByText(/By sending your request you accept these terms/)).toBeVisible();
    expect(screen.queryByText(/Security deposit 20 BHD/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Read the full terms" }));
    expect(await screen.findByText(/Security deposit 20 BHD/)).toBeVisible();
  });

  it("stay whole everywhere else (the confirmation shows them all)", async () => {
    state.policy = policy;
    wrap(<BookingPolicies brandId="b1" isAr={false} depositPercent={50} />);
    expect(await screen.findByText(/Security deposit 20 BHD/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Read the full terms" })).toBeNull();
  });
});

describe("the questions on the booking page", () => {
  const item = (id: string, group: string, n: number) => ({
    id,
    brand_id: "b1",
    group_en: group,
    group_ar: group,
    question_en: `Question ${id}`,
    question_ar: `سؤال ${id}`,
    answer_en: `Answer ${id}`,
    answer_ar: `جواب ${id}`,
    sort_order: n,
    is_active: true,
  });
  const items = [item("a", "Booking", 0), item("b", "Booking", 1), item("c", "Privacy", 2)];

  it("is one row per group, each with its count, opening onto its questions", async () => {
    state.faq = items;
    wrap(<StoreFaq brandId="b1" isAr={false} folded />);
    const booking = await screen.findByRole("button", { name: /Booking/ });
    expect(within(booking).getByText("2 questions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Privacy/ })).toBeInTheDocument();
    expect(screen.queryByText("Question a")).toBeNull();
    fireEvent.click(booking);
    fireEvent.click(await screen.findByRole("button", { name: "Question a" }));
    expect(await screen.findByText("Answer a")).toBeVisible();
  });

  it("stays a list of every question where it is not folded", async () => {
    state.faq = items;
    wrap(<StoreFaq brandId="b1" isAr={false} />);
    expect(await screen.findByRole("button", { name: "Question a" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Question c" })).toBeInTheDocument();
  });
});
