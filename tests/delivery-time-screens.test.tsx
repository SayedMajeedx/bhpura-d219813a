import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The day and time a shopper picks: the checkout's card (through its hook), and the merchant's
// schedule in the orders settings, which shows the days a shopper would be offered now.

const settingsForm = vi.hoisted(() => ({
  bs: {} as Record<string, unknown>,
  setBs: vi.fn(),
}));
const formModule = vi.hoisted(() => () => ({
  useBrandSettingsFormContext: () => ({
    form: { bs: settingsForm.bs, brand: {}, brandId: "b1" },
    setBs: settingsForm.setBs,
  }),
}));
vi.mock("../src/features/settings/use-brand-settings-form", formModule);
vi.mock("@/features/settings/use-brand-settings-form", formModule);
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));

const { useDeliveryTime } = await import("../src/features/checkout/hooks/use-delivery-time");
const { DeliveryTimeCard } = await import("../src/features/checkout/components/DeliveryTimeCard");
const { DeliveryScheduleCard } =
  await import("../src/features/settings/tabs/orders/DeliveryScheduleCard");
const { requestedTimeLabel } = await import("../src/lib/delivery-schedule");

const t = (_ar: string, en: string) => en;
const SCHEDULE = {
  enabled: true,
  lead_hours: 20,
  days_ahead: 3,
  slots: [
    { from: "10:00", to: "14:00" },
    { from: "16:00", to: "20:00" },
  ],
};

let picked: ReturnType<typeof useDeliveryTime> | null = null;
function Checkout({
  fulfillment = "delivery",
  appointment = false,
  schedule = SCHEDULE as unknown,
}) {
  const time = useDeliveryTime({ schedule, fulfillment, appointment, t });
  picked = time;
  return <DeliveryTimeCard time={time} fulfillment={fulfillment} lang="en" t={t} />;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Saturday 24 October 2026, 15:00 in Bahrain: ready from Sunday 11:00.
  vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  picked = null;
  settingsForm.bs = { delivery_enabled: true };
  settingsForm.setBs.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("the checkout's day and time", () => {
  it("offers the store's days, then the chosen day's windows, and says what is still to pick", async () => {
    await act(async () => {
      render(<Checkout />);
    });
    const days = screen.getByRole("group", { name: "Day" });
    expect(
      within(days)
        .getAllByRole("button")
        .map((b) => b.textContent),
      // The weekday and date as the locale writes them ("Mon 26 Oct" or "Mon, 26 Oct").
    ).toEqual([
      "Tomorrow",
      expect.stringMatching(/^Mon,? 26 Oct$/),
      expect.stringMatching(/^Tue,? 27 Oct$/),
    ]);
    expect(picked?.requested?.missing).toBe("Pick the day you would like your order.");

    fireEvent.click(within(days).getByRole("button", { name: "Tomorrow" }));
    // Tomorrow's morning window starts before the store can be ready.
    const times = screen.getByRole("group", { name: "Time" });
    expect(
      within(times)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["16:00 – 20:00"]);
    expect(picked?.requested?.missing).toBe("Pick a time that suits you.");
    fireEvent.click(within(times).getByRole("button", { name: "16:00 – 20:00" }));
    expect(picked?.requested).toEqual({ date: "2026-10-25", slot: "16:00-20:00", missing: null });

    // Another day drops the window picked for the first.
    fireEvent.click(within(days).getByRole("button", { name: /^Mon,? 26 Oct$/ }));
    expect(picked?.requested?.slot).toBeNull();
  });

  it("asks nothing for a booking, a digital order, or a store that keeps no schedule", async () => {
    for (const props of [
      { appointment: true },
      { fulfillment: "digital" },
      { schedule: { ...SCHEDULE, enabled: false } },
      { fulfillment: "pickup", schedule: { ...SCHEDULE, applies_to: ["delivery"] } },
    ]) {
      const { unmount } = await act(async () => render(<Checkout {...props} />));
      expect(screen.queryByRole("heading", { name: /When/ })).toBeNull();
      expect(picked?.requested).toBeNull();
      unmount();
    }
  });

  it("writes the day the order asked for as staff and the shopper read it", () => {
    expect(requestedTimeLabel("2026-10-30", "10:00-14:00", "en")).toBe(
      "Friday 30 October · 10:00 – 14:00",
    );
    expect(requestedTimeLabel("2026-10-30", null, "ar")).toContain("30");
    expect(requestedTimeLabel(null, "10:00-14:00", "en")).toBeNull();
  });
});

describe("the merchant's schedule", () => {
  it("is off until switched on, and then shows the days a shopper would see", async () => {
    await act(async () => {
      render(<DeliveryScheduleCard />);
    });
    fireEvent.click(screen.getByRole("switch", { name: "Shoppers pick the day" }));
    expect(settingsForm.setBs).toHaveBeenLastCalledWith({
      delivery_schedule: expect.objectContaining({ enabled: true, lead_hours: 24, days_ahead: 7 }),
    });
  });

  it("edits the days and windows, and warns of a window that ends before it starts", async () => {
    settingsForm.bs = {
      delivery_enabled: true,
      delivery_schedule: { ...SCHEDULE, slots: [{ from: "15:00", to: "11:00" }] },
    };
    await act(async () => {
      render(<DeliveryScheduleCard />);
    });
    expect(screen.getByText("Ends before it starts: not offered")).toBeTruthy();
    // With no valid window, the preview offers days only.
    expect(screen.getByText(/Shoppers see now: Tomorrow, Mon,? 26 Oct/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fri" }));
    const saved = settingsForm.setBs.mock.calls.at(-1)?.[0].delivery_schedule;
    expect(saved.weekdays).toEqual([0, 1, 2, 3, 4, 6]);
    // The window being edited is kept as typed.
    expect(saved.slots).toEqual([{ from: "15:00", to: "11:00" }]);

    fireEvent.click(screen.getByRole("button", { name: "Remove window 1" }));
    expect(settingsForm.setBs.mock.calls.at(-1)?.[0].delivery_schedule.slots).toEqual([]);
  });
});
