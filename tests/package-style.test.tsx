import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PACKAGE_STYLE,
  PACKAGE_STYLES,
  packageCardClass,
  packageSavingPercent,
  packageStyleFrom,
} from "../src/lib/bookings/package-style";

// How packages stand out: the pure rules, and the merchant's picker.

const state = vi.hoisted(() => ({
  saved: undefined as string | undefined,
  save: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const data = {
  bookingPageOptionsQueries: {
    options: () => ({
      queryKey: ["pk-test", state.saved],
      queryFn: async () => ({ package_style: state.saved ?? "glow" }),
    }),
  },
  invalidateBookingPageOptions: vi.fn(async () => undefined),
  saveBookingPageOptions: state.save,
};
vi.mock("../src/lib/data/booking-page-options", () => data);
vi.mock("@/lib/data/booking-page-options", () => data);

const { BookingLookDialog } = await import("../src/features/bookings/components/BookingLookDialog");

beforeEach(() => {
  state.saved = undefined;
  vi.clearAllMocks();
});

describe("the package look rules", () => {
  it("knows the four looks and falls back to the default for anything else", () => {
    expect(PACKAGE_STYLES).toEqual(["glow", "shimmer", "ribbon", "plain"]);
    expect(packageStyleFrom("shimmer")).toBe("shimmer");
    expect(packageStyleFrom("neon")).toBe(DEFAULT_PACKAGE_STYLE);
    expect(packageStyleFrom(null)).toBe("glow");
    expect(packageCardClass("ribbon")).toBe("pkg-card pkg-card--ribbon");
  });

  it("works out what a package saves", () => {
    expect(packageSavingPercent(90, 70)).toBe(22);
    expect(packageSavingPercent(70, 70)).toBeNull();
    expect(packageSavingPercent(null, 70)).toBeNull();
    expect(packageSavingPercent(90, null)).toBeNull();
  });
});

describe("the merchant's package look", () => {
  it("shows each look and saves the one picked", async () => {
    state.saved = "shimmer";
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BookingLookDialog
          page={{ isAr: false, brand: { id: "b1" } } as never}
          open
          onOpenChange={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const shimmer = await screen.findByRole("radio", { name: /Shimmer/ });
    await waitFor(() => expect(shimmer).toHaveAttribute("aria-checked", "true"));
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    fireEvent.click(screen.getByRole("radio", { name: /Ribbon/ }));
    expect(screen.getByRole("radio", { name: /Ribbon/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Save look" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith("b1", { package_style: "ribbon" }));
  });
});
