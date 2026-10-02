import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The package look end to end through the real data module: the merchant picks
// a look, it is written, and reading it back (the dialog reopened, the
// storefront) gives the same look. Only the Supabase client is faked.

const db = vi.hoisted(() => ({
  rows: new Map<string, { package_style: string }>(),
  writes: [] as unknown[],
}));
const fakeSupabase = vi.hoisted(() => ({
  from: (table: string) => {
    if (table !== "booking_page_options") throw new Error(`unexpected table ${table}`);
    return {
      upsert: async (row: { brand_id: string; package_style: string }) => {
        db.writes.push(row);
        db.rows.set(row.brand_id, { package_style: row.package_style });
        return { error: null };
      },
      select: () => ({
        eq: (_col: string, brandId: string) => ({
          maybeSingle: async () => ({ data: db.rows.get(brandId) ?? null, error: null }),
        }),
      }),
    };
  },
}));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: fakeSupabase }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: fakeSupabase }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { BookingLookDialog } = await import("../src/features/bookings/components/BookingLookDialog");
const { fetchBookingPageOptions } = await import("../src/lib/data/booking-page-options");

const page = { isAr: false, brand: { id: "b1" } } as never;
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  db.rows.clear();
  db.writes.length = 0;
});

describe("the package look, saved and read back", () => {
  it("stores the look picked, and the dialog reopens on it", async () => {
    const qc = client();
    const open = () =>
      render(
        <QueryClientProvider client={qc}>
          <BookingLookDialog page={page} open onOpenChange={vi.fn()} />
        </QueryClientProvider>,
      );
    const first = open();
    const ribbon = await screen.findByRole("radio", { name: /Ribbon/ });
    // Nothing can be picked or saved until the stored look is known.
    await waitFor(() => expect(ribbon).toBeEnabled());
    fireEvent.click(ribbon);
    fireEvent.click(screen.getByRole("button", { name: "Save look" }));
    await waitFor(() => expect(db.writes).toHaveLength(1));
    expect(db.writes[0]).toMatchObject({ brand_id: "b1", package_style: "ribbon" });
    expect(await fetchBookingPageOptions("b1")).toEqual({ package_style: "ribbon" });
    first.unmount();

    open();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Ribbon/ })).toHaveAttribute("aria-checked", "true"),
    );
    // And it can be changed again.
    fireEvent.click(screen.getByRole("radio", { name: /Classic/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save look" }));
    await waitFor(() => expect(db.writes).toHaveLength(2));
    expect(db.writes[1]).toMatchObject({ package_style: "plain" });
  });

  it("does not save the default over a look that has not loaded yet", async () => {
    db.rows.set("b1", { package_style: "shimmer" });
    render(
      <QueryClientProvider client={client()}>
        <BookingLookDialog page={page} open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    // Before the saved look is known nothing can be saved, so 'glow' is never written over it.
    const save = await screen.findByRole("button", { name: "Save look" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Sheen/ })).toHaveAttribute("aria-checked", "true"),
    );
    expect(db.writes.every((w) => (w as { package_style: string }).package_style !== "glow")).toBe(
      true,
    );
  });
});
